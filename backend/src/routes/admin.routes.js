const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const notificationService = require('../services/notification.service');
const { authenticate, adminOnly } = require('../middleware/auth.middleware');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

// GET /api/admin/dashboard — platform statistics
router.get('/dashboard', authenticate, adminOnly, async (req, res, next) => {
  try {
    const [
      totalUsers, totalCustomers, totalWorkers, verifiedWorkers,
      activeJobs, completedJobs, cancelledJobs, pendingReports,
    ] = await Promise.all([
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'CUSTOMER', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'WORKER', status: 'ACTIVE' } }),
      prisma.workerProfile.count({ where: { verificationStatus: 'VERIFIED' } }),
      prisma.job.count({ where: { status: { in: ['POSTED', 'QUOTATIONS_RECEIVED', 'WORKER_SELECTED', 'ACCEPTED', 'IN_PROGRESS'] } } }),
      prisma.job.count({ where: { status: 'COMPLETED' } }),
      prisma.job.count({ where: { status: 'CANCELLED' } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
    ]);

    const paymentAgg = await prisma.payment.aggregate({
      where: { status: 'PAID' },
      _sum: { amount: true, platformFee: true },
    });

    const totalTransactionValue = paymentAgg._sum.amount || 0;
    const platformRevenue = paymentAgg._sum.platformFee || 0;

    // Recent activity
    const recentJobs = await prisma.job.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: { category: true, customerProfile: { include: { user: { select: { fullName: true } } } } },
    });

    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: { id: true, fullName: true, email: true, role: true, createdAt: true },
    });

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers, totalCustomers, totalWorkers, verifiedWorkers,
          activeJobs, completedJobs, cancelledJobs,
          totalTransactionValue, platformRevenue, pendingReports,
        },
        recentJobs,
        recentUsers,
      },
    });
  } catch (err) { next(err); }
});

// GET /api/admin/users — list all users
router.get('/users', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, role, status, search } = req.query;
    const where = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) where.OR = [
      { fullName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
    ];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, fullName: true, email: true, phone: true, role: true, status: true, city: true, createdAt: true, isVerified: true },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({ success: true, data: { users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/admin/workers — list workers with verification status
router.get('/workers', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, verificationStatus, search } = req.query;
    const where = {};
    if (verificationStatus) where.verificationStatus = verificationStatus;
    if (search) {
      where.user = { OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ]};
    }

    const [workers, total] = await Promise.all([
      prisma.workerProfile.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true, phone: true, status: true, createdAt: true } },
          categories: { include: { category: true } },
        },
        orderBy: { user: { createdAt: 'desc' } },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.workerProfile.count({ where }),
    ]);

    res.json({ success: true, data: { workers, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// PUT /api/admin/workers/:id/verify — verify or reject worker
router.put('/workers/:id/verify', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { verificationStatus, verificationDocType, verificationRef, notes } = req.body;
    if (!['VERIFIED', 'REJECTED', 'PENDING'].includes(verificationStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid verification status.', code: 'VALIDATION_ERROR' });
    }

    const worker = await prisma.workerProfile.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { id: true } } },
    });
    if (!worker) return next(new NotFoundError('Worker'));

    await prisma.workerProfile.update({
      where: { id: req.params.id },
      data: {
        verificationStatus,
        verificationDocType: verificationDocType || worker.verificationDocType,
        verificationRef: verificationRef || worker.verificationRef,
        verificationDate: verificationStatus === 'VERIFIED' ? new Date() : worker.verificationDate,
      },
    });

    await notificationService.notify(worker.user.id, {
      title: verificationStatus === 'VERIFIED' ? '✅ Account Verified!' : 'Verification Update',
      message: verificationStatus === 'VERIFIED'
        ? 'Congratulations! Your worker account has been verified.'
        : `Your verification status: ${verificationStatus}. ${notes || ''}`,
      type: 'WORKER_VERIFIED',
      metadata: { verificationStatus },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: 'VERIFY_WORKER',
        resource: 'WorkerProfile',
        resourceId: req.params.id,
        metadata: { verificationStatus, notes },
      },
    });

    res.json({ success: true, data: { message: `Worker verification status updated to ${verificationStatus}.` } });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/suspend — suspend or unsuspend user
router.put('/users/:id/suspend', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { suspend, reason } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return next(new NotFoundError('User'));
    if (user.role === 'ADMIN') return next(new ForbiddenError('Cannot suspend admin accounts.'));

    const newStatus = suspend ? 'SUSPENDED' : 'ACTIVE';
    await prisma.user.update({ where: { id: req.params.id }, data: { status: newStatus } });

    await notificationService.notify(req.params.id, {
      title: suspend ? 'Account Suspended' : 'Account Reinstated',
      message: suspend
        ? `Your account has been suspended. ${reason || 'Please contact support.'}`
        : 'Your account has been reinstated.',
      type: 'ACCOUNT_SUSPENDED',
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: suspend ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
        resource: 'User',
        resourceId: req.params.id,
        metadata: { reason, suspend },
      },
    });

    res.json({ success: true, data: { message: `User ${suspend ? 'suspended' : 'reinstated'} successfully.` } });
  } catch (err) { next(err); }
});

// GET /api/admin/jobs — all jobs
router.get('/jobs', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = status ? { status } : {};
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          category: true,
          customerProfile: { include: { user: { select: { fullName: true, email: true } } } },
          quotations: { select: { id: true, status: true } },
          payment: { select: { status: true, amount: true, method: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.job.count({ where }),
    ]);
    res.json({ success: true, data: { jobs, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// GET /api/admin/reports — all reports
router.get('/reports', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const where = status ? { status } : {};
    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        include: {
          reporter: { select: { fullName: true, email: true, role: true } },
          reportedUser: { select: { fullName: true, email: true, role: true } },
          job: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.report.count({ where }),
    ]);
    res.json({ success: true, data: { reports, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

// PUT /api/admin/reports/:id — update report status
router.put('/reports/:id', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { status, adminNotes } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { status, adminNotes },
    });
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// GET /api/admin/categories — manage categories
router.get('/categories', authenticate, adminOnly, async (req, res, next) => {
  try {
    const categories = await prisma.serviceCategory.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// GET /api/admin/settings — get platform settings
router.get('/settings', authenticate, adminOnly, async (req, res, next) => {
  try {
    const settings = await prisma.platformSetting.findMany();
    res.json({ success: true, data: settings });
  } catch (err) { next(err); }
});

// PUT /api/admin/settings/:key — update a setting
router.put('/settings/:key', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { value } = req.body;
    const setting = await prisma.platformSetting.upsert({
      where: { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    res.json({ success: true, data: setting });
  } catch (err) { next(err); }
});

// GET /api/admin/payments — all payments
router.get('/payments', authenticate, adminOnly, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        include: { job: { select: { title: true, categoryId: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.payment.count(),
    ]);
    res.json({ success: true, data: { payments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) { next(err); }
});

module.exports = router;
