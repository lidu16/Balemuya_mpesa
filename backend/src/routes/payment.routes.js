const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const MpesaProvider = require('../services/payment/MpesaProvider');
const CashProvider = require('../services/payment/CashProvider');
const notificationService = require('../services/notification.service');
const { authenticate, customerOnly } = require('../middleware/auth.middleware');
const { validate, schemas } = require('../middleware/validate.middleware');
const { NotFoundError, ForbiddenError, AppError } = require('../utils/errors');
const logger = require('../config/logger');

const mpesa = new MpesaProvider();
const cash = new CashProvider();

/**
 * Get payment provider by method
 */
function getProvider(method) {
  if (method === 'MPESA') return mpesa;
  return cash;
}

/**
 * Get commission rate from platform settings
 */
async function getCommissionRate() {
  const setting = await prisma.platformSetting.findUnique({ where: { key: 'commission_rate' } });
  return setting ? parseFloat(setting.value) : parseFloat(process.env.DEFAULT_COMMISSION_RATE || '10');
}

// POST /api/payments — initiate/record payment
router.post('/', authenticate, customerOnly, validate(schemas.recordPayment), async (req, res, next) => {
  try {
    const { jobId, amount, method = 'CASH', notes } = req.body;

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customerProfile: true },
    });
    if (!job) return next(new NotFoundError('Job'));
    if (job.customerProfile.userId !== req.user.id) return next(new ForbiddenError());
    if (!['COMPLETED', 'IN_PROGRESS'].includes(job.status)) {
      return next(new AppError('Job must be completed before payment can be recorded.', 400, 'INVALID_OPERATION'));
    }
    if (job.payment) return next(new AppError('Payment already recorded for this job.', 409, 'DUPLICATE'));

    const commissionRate = await getCommissionRate();
    const platformFee = (amount * commissionRate) / 100;
    const workerAmount = amount - platformFee;

    const provider = getProvider(method);
    const reference = `BAL-${jobId.slice(0, 8).toUpperCase()}-${Date.now()}`;

    // Get customer phone for M-PESA
    const customer = await prisma.user.findUnique({ where: { id: req.user.id }, select: { phone: true } });
    const initResult = await provider.initiate({
      amount,
      phone: customer.phone,
      reference,
      description: `Balemuya: ${job.title}`,
    });

    if (!initResult.success && method === 'MPESA') {
      return res.status(400).json({ success: false, message: initResult.message, code: initResult.code || 'PAYMENT_FAILED' });
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        jobId,
        amount,
        workerAmount,
        platformFee,
        commissionRate,
        method,
        status: method === 'CASH' ? 'PAID' : 'PENDING',
        mpesaRef: initResult.transactionRef,
        paidAt: method === 'CASH' ? new Date() : null,
        notes,
      },
    });

    // For cash: immediately update job to PAID
    if (method === 'CASH') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'PAID' } });

      // Update worker earnings
      if (job.selectedWorkerId) {
        await prisma.workerProfile.update({
          where: { id: job.selectedWorkerId },
          data: { totalEarnings: { increment: workerAmount } },
        });
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'PAYMENT',
        resource: 'Payment',
        resourceId: payment.id,
        metadata: { jobId, amount, method, status: payment.status },
      },
    });

    // Notify
    if (job.selectedWorkerId) {
      const worker = await prisma.workerProfile.findUnique({
        where: { id: job.selectedWorkerId },
        include: { user: { select: { id: true } } },
      });
      if (worker) {
        await notificationService.notify(worker.user.id, {
          title: method === 'CASH' ? 'Payment Received' : 'Payment Initiated',
          message: `Payment of ${workerAmount.toFixed(2)} ETB for "${job.title}" has been ${method === 'CASH' ? 'recorded' : 'initiated'}.`,
          type: 'PAYMENT_RECORDED',
          metadata: { jobId, paymentId: payment.id },
        });
      }
    }

    res.status(201).json({
      success: true,
      data: {
        payment,
        providerResponse: initResult,
        message: method === 'MPESA'
          ? 'Payment request sent to your phone. Please complete the M-PESA prompt.'
          : 'Cash payment recorded successfully.',
      },
    });
  } catch (err) { next(err); }
});

// POST /api/payments/mpesa/callback — M-PESA webhook callback
router.post('/mpesa/callback', async (req, res, next) => {
  try {
    logger.info('M-PESA callback received:', JSON.stringify(req.body));
    const result = mpesa.processCallback(req.body);

    if (result.success) {
      // Find payment by M-PESA checkout request ID
      const payment = await prisma.payment.findFirst({
        where: { mpesaRef: result.checkoutRequestId },
        include: { job: { include: { selectedWorkerId: true } } },
      });

      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'PAID',
            mpesaReceiptNo: result.receiptNumber,
            paidAt: new Date(),
          },
        });
        await prisma.job.update({ where: { id: payment.jobId }, data: { status: 'PAID' } });

        // Update worker earnings
        if (payment.job.selectedWorkerId) {
          await prisma.workerProfile.update({
            where: { id: payment.job.selectedWorkerId },
            data: { totalEarnings: { increment: payment.workerAmount } },
          });
        }

        logger.info(`M-PESA payment confirmed: ${result.receiptNumber}`);
      }
    } else {
      logger.warn('M-PESA callback: payment failed or cancelled:', result.message);
      await prisma.payment.updateMany({
        where: { mpesaRef: result.checkoutRequestId },
        data: { status: 'FAILED' },
      });
    }

    // Always return 200 to Safaricom
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    logger.error('M-PESA callback error:', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' }); // still return 200
  }
});

// GET /api/payments/verify/:transactionRef — verify M-PESA payment
router.get('/verify/:transactionRef', authenticate, async (req, res, next) => {
  try {
    const result = await mpesa.verify(req.params.transactionRef);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/payments/my — get user's payment history
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const customerProfile = await prisma.customerProfile.findUnique({ where: { userId: req.user.id } });
    if (!customerProfile) return res.json({ success: true, data: [] });

    const payments = await prisma.payment.findMany({
      where: { job: { customerProfileId: customerProfile.id } },
      include: { job: { select: { title: true, status: true, category: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: payments });
  } catch (err) { next(err); }
});

// GET /api/payments/:id — get payment by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { job: { include: { customerProfile: { include: { user: { select: { id: true } } } } } } },
    });
    if (!payment) return next(new NotFoundError('Payment'));

    // Access check
    const isCustomer = payment.job.customerProfile.userId === req.user.id;
    const isAdmin = req.user.role === 'ADMIN';
    if (!isCustomer && !isAdmin) return next(new ForbiddenError());

    res.json({ success: true, data: payment });
  } catch (err) { next(err); }
});

module.exports = router;
