const prisma = require('../config/database');
const { NotFoundError, ForbiddenError, AppError } = require('../utils/errors');
const notificationService = require('./notification.service');

// Valid job status transitions
const JOB_TRANSITIONS = {
  POSTED: ['QUOTATIONS_RECEIVED', 'CANCELLED'],
  QUOTATIONS_RECEIVED: ['WORKER_SELECTED', 'CANCELLED'],
  WORKER_SELECTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['PAID'],
  PAID: ['REVIEWED'],
  REVIEWED: [],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

const jobService = {
  /**
   * Create a new job
   */
  async createJob(userId, data) {
    const customerProfile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!customerProfile) throw new AppError('Customer profile not found.', 404, 'NOT_FOUND');

    const category = await prisma.serviceCategory.findUnique({
      where: { id: data.categoryId, isActive: true },
    });
    if (!category) throw new NotFoundError('Service category');

    const job = await prisma.job.create({
      data: {
        ...data,
        preferredDate: data.preferredDate ? new Date(data.preferredDate) : null,
        customerProfileId: customerProfile.id,
      },
      include: {
        category: true,
        images: true,
        customerProfile: { include: { user: { select: { fullName: true } } } },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'CREATE_JOB',
        resource: 'Job',
        resourceId: job.id,
        metadata: { title: job.title, categoryId: job.categoryId },
      },
    });

    return job;
  },

  /**
   * Get jobs with filters
   */
  async getJobs({
    status,
    categoryId,
    city,
    urgency,
    minBudget,
    maxBudget,
    search,
    customerId,
    workerId,
    page = 1,
    limit = 20,
  }) {
    const where = {};

    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (urgency) where.urgency = urgency;
    if (minBudget || maxBudget) {
      where.budget = {};
      if (minBudget) where.budget.gte = parseFloat(minBudget);
      if (maxBudget) where.budget.lte = parseFloat(maxBudget);
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (customerId) where.customerProfile = { userId: customerId };

    const jobs = await prisma.job.findMany({
      where,
      include: {
        category: true,
        images: true,
        customerProfile: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true, city: true } } },
        },
        quotations: { select: { id: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await prisma.job.count({ where });

    return { jobs, total, page, pages: Math.ceil(total / limit) };
  },

  /**
   * Get a single job by ID
   */
  async getJobById(jobId, requestingUserId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        category: true,
        images: true,
        customerProfile: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true, phone: true } } },
        },
        quotations: {
          include: {
            workerProfile: {
              include: {
                user: { select: { id: true, fullName: true, avatarUrl: true } },
                skills: { include: { skill: true } },
              },
            },
          },
        },
        payment: true,
        review: true,
      },
    });

    if (!job) throw new NotFoundError('Job');
    return job;
  },

  /**
   * Update job status with transition validation
   */
  async updateJobStatus(jobId, newStatus, requestingUser) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        customerProfile: true,
        quotations: true,
      },
    });

    if (!job) throw new NotFoundError('Job');

    // Validate transition
    const allowedTransitions = JOB_TRANSITIONS[job.status] || [];
    if (!allowedTransitions.includes(newStatus)) {
      throw new AppError(
        `Cannot transition from ${job.status} to ${newStatus}.`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Authorization checks
    if (requestingUser.role === 'CUSTOMER') {
      if (job.customerProfile.userId !== requestingUser.id) {
        throw new ForbiddenError();
      }
      // Customers cannot mark IN_PROGRESS or COMPLETED themselves
      if (['IN_PROGRESS', 'COMPLETED'].includes(newStatus)) {
        throw new ForbiddenError('Only the worker can update this status.');
      }
    }

    if (requestingUser.role === 'WORKER') {
      // Workers can only update jobs they are selected for
      if (job.selectedWorkerId) {
        const workerProfile = await prisma.workerProfile.findUnique({
          where: { userId: requestingUser.id },
        });
        if (!workerProfile || job.selectedWorkerId !== workerProfile.id) {
          throw new ForbiddenError('You are not assigned to this job.');
        }
      } else {
        throw new ForbiddenError('You are not assigned to this job.');
      }
    }

    const updated = await prisma.job.update({
      where: { id: jobId },
      data: { status: newStatus },
    });

    // Notifications on status change
    const customerUserId = job.customerProfile.userId;

    if (newStatus === 'COMPLETED') {
      // Update worker stats
      if (job.selectedWorkerId) {
        await prisma.workerProfile.update({
          where: { id: job.selectedWorkerId },
          data: { completedJobs: { increment: 1 } },
        });
      }
      await notificationService.notify(customerUserId, {
        title: 'Job Completed',
        message: `Your job "${job.title}" has been marked as completed.`,
        type: 'JOB_COMPLETED',
        metadata: { jobId },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: requestingUser.id,
        action: 'CHANGE_JOB_STATUS',
        resource: 'Job',
        resourceId: jobId,
        metadata: { from: job.status, to: newStatus },
      },
    });

    return updated;
  },

  /**
   * Get customer's jobs
   */
  async getMyJobs(userId, status) {
    const customerProfile = await prisma.customerProfile.findUnique({ where: { userId } });
    if (!customerProfile) return [];

    const where = { customerProfileId: customerProfile.id };
    if (status) where.status = status;

    return prisma.job.findMany({
      where,
      include: {
        category: true,
        images: true,
        quotations: { select: { id: true, status: true, price: true } },
        payment: { select: { status: true, method: true, amount: true } },
        review: { select: { rating: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Get worker's jobs (ones they are selected for)
   */
  async getWorkerJobs(userId, status) {
    const workerProfile = await prisma.workerProfile.findUnique({ where: { userId } });
    if (!workerProfile) return [];

    const where = { selectedWorkerId: workerProfile.id };
    if (status) where.status = status;

    return prisma.job.findMany({
      where,
      include: {
        category: true,
        images: true,
        customerProfile: {
          include: { user: { select: { id: true, fullName: true, avatarUrl: true, phone: true } } },
        },
        payment: { select: { status: true, method: true, amount: true, workerAmount: true } },
        review: { select: { rating: true, comment: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Delete a job (only customer, only if POSTED)
   */
  async deleteJob(jobId, userId) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { customerProfile: true },
    });

    if (!job) throw new NotFoundError('Job');
    if (job.customerProfile.userId !== userId) throw new ForbiddenError();
    if (job.status !== 'POSTED') {
      throw new AppError('Only jobs in POSTED status can be deleted.', 400, 'INVALID_OPERATION');
    }

    await prisma.job.delete({ where: { id: jobId } });
    return { message: 'Job deleted successfully.' };
  },
};

module.exports = { jobService, JOB_TRANSITIONS };
