const prisma = require('../config/database');
const { NotFoundError, ForbiddenError, AppError, ConflictError } = require('../utils/errors');
const notificationService = require('./notification.service');

const quotationService = {
  /**
   * Submit a quotation for a job
   */
  async submitQuotation(jobId, workerUserId, data) {
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: workerUserId } });
    if (!workerProfile) throw new NotFoundError('Worker profile');

    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customerProfile: true },
    });
    if (!job) throw new NotFoundError('Job');

    // Business rules
    if (['CANCELLED', 'COMPLETED', 'PAID', 'REVIEWED'].includes(job.status)) {
      throw new AppError('Cannot submit a quotation for this job.', 400, 'INVALID_OPERATION');
    }

    // Check for duplicate
    const existing = await prisma.quotation.findUnique({
      where: { jobId_workerProfileId: { jobId, workerProfileId: workerProfile.id } },
    });
    if (existing && existing.status !== 'WITHDRAWN') {
      throw new ConflictError('You have already submitted a quotation for this job.');
    }

    let quotation;
    if (existing?.status === 'WITHDRAWN') {
      // Re-create if previously withdrawn
      quotation = await prisma.quotation.update({
        where: { id: existing.id },
        data: { ...data, status: 'PENDING' },
        include: { workerProfile: { include: { user: { select: { fullName: true, avatarUrl: true } } } } },
      });
    } else {
      quotation = await prisma.quotation.create({
        data: { jobId, workerProfileId: workerProfile.id, ...data },
        include: { workerProfile: { include: { user: { select: { fullName: true, avatarUrl: true } } } } },
      });
    }

    // Update job status to QUOTATIONS_RECEIVED
    if (job.status === 'POSTED') {
      await prisma.job.update({ where: { id: jobId }, data: { status: 'QUOTATIONS_RECEIVED' } });
    }

    // Notify customer
    await notificationService.notify(job.customerProfile.userId, {
      title: 'New Quotation Received',
      message: `${workerProfile.user?.fullName || 'A worker'} has submitted a quotation of ${data.price} ETB for "${job.title}".`,
      type: 'QUOTATION_SUBMITTED',
      metadata: { jobId, quotationId: quotation.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: workerUserId,
        action: 'SUBMIT_QUOTATION',
        resource: 'Quotation',
        resourceId: quotation.id,
        metadata: { jobId, price: data.price },
      },
    });

    return quotation;
  },

  /**
   * Get quotations for a job
   */
  async getJobQuotations(jobId, requestingUser) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customerProfile: true },
    });
    if (!job) throw new NotFoundError('Job');

    // Only the customer of the job or admin can see all quotations
    if (requestingUser.role === 'WORKER') {
      const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: requestingUser.id } });
      const quotations = await prisma.quotation.findMany({
        where: { jobId, workerProfileId: workerProfile?.id },
        include: { workerProfile: { include: { user: { select: { id: true, fullName: true, avatarUrl: true } } } } },
      });
      return quotations;
    }

    return prisma.quotation.findMany({
      where: { jobId },
      include: {
        workerProfile: {
          include: {
            user: { select: { id: true, fullName: true, avatarUrl: true, phone: true } },
            skills: { include: { skill: true } },
            categories: { include: { category: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Accept a quotation — selects the worker for the job
   */
  async acceptQuotation(quotationId, customerUserId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        job: { include: { customerProfile: true } },
        workerProfile: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });

    if (!quotation) throw new NotFoundError('Quotation');
    if (quotation.job.customerProfile.userId !== customerUserId) throw new ForbiddenError();
    if (quotation.status !== 'PENDING') {
      throw new AppError('This quotation cannot be accepted.', 400, 'INVALID_OPERATION');
    }

    // Transaction: accept this, reject others, update job
    await prisma.$transaction([
      prisma.quotation.update({
        where: { id: quotationId },
        data: { status: 'ACCEPTED' },
      }),
      prisma.quotation.updateMany({
        where: { jobId: quotation.jobId, id: { not: quotationId }, status: 'PENDING' },
        data: { status: 'REJECTED' },
      }),
      prisma.job.update({
        where: { id: quotation.jobId },
        data: { status: 'WORKER_SELECTED', selectedWorkerId: quotation.workerProfileId },
      }),
    ]);

    // Notify selected worker
    await notificationService.notify(quotation.workerProfile.user.id, {
      title: 'Quotation Accepted!',
      message: `Your quotation for "${quotation.job.title}" has been accepted. Please contact the customer to confirm.`,
      type: 'QUOTATION_ACCEPTED',
      metadata: { jobId: quotation.jobId, quotationId },
    });

    await prisma.auditLog.create({
      data: {
        userId: customerUserId,
        action: 'ACCEPT_QUOTATION',
        resource: 'Quotation',
        resourceId: quotationId,
        metadata: { jobId: quotation.jobId },
      },
    });

    return { message: 'Quotation accepted. Worker selected successfully.' };
  },

  /**
   * Reject a quotation
   */
  async rejectQuotation(quotationId, customerUserId) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: {
        job: { include: { customerProfile: true } },
        workerProfile: { include: { user: { select: { id: true } } } },
      },
    });

    if (!quotation) throw new NotFoundError('Quotation');
    if (quotation.job.customerProfile.userId !== customerUserId) throw new ForbiddenError();

    await prisma.quotation.update({ where: { id: quotationId }, data: { status: 'REJECTED' } });

    await notificationService.notify(quotation.workerProfile.user.id, {
      title: 'Quotation Rejected',
      message: `Your quotation for "${quotation.job.title}" was not selected this time.`,
      type: 'QUOTATION_REJECTED',
      metadata: { jobId: quotation.jobId, quotationId },
    });

    return { message: 'Quotation rejected.' };
  },

  /**
   * Withdraw a quotation (worker)
   */
  async withdrawQuotation(quotationId, workerUserId) {
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId: workerUserId } });
    const quotation = await prisma.quotation.findFirst({
      where: { id: quotationId, workerProfileId: workerProfile?.id },
    });

    if (!quotation) throw new NotFoundError('Quotation');
    if (quotation.status !== 'PENDING') {
      throw new AppError('Only pending quotations can be withdrawn.', 400, 'INVALID_OPERATION');
    }

    await prisma.quotation.update({ where: { id: quotationId }, data: { status: 'WITHDRAWN' } });
    return { message: 'Quotation withdrawn.' };
  },
};

module.exports = quotationService;
