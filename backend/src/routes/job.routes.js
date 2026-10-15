const express = require('express');
const router = express.Router();
const { jobService } = require('../services/job.service');
const { authenticate, customerOnly, workerOnly } = require('../middleware/auth.middleware');
const { validate, schemas } = require('../middleware/validate.middleware');
const quotationService = require('../services/quotation.service');

// POST /api/jobs — create job
router.post('/', authenticate, customerOnly, validate(schemas.createJob), async (req, res, next) => {
  try {
    const job = await jobService.createJob(req.user.id, req.body);
    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
});

// GET /api/jobs — list jobs (public for workers searching)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await jobService.getJobs({ ...req.query, page: parseInt(req.query.page) || 1, limit: parseInt(req.query.limit) || 20 });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/jobs/my — get current user's jobs
router.get('/my', authenticate, async (req, res, next) => {
  try {
    let jobs;
    if (req.user.role === 'CUSTOMER') {
      jobs = await jobService.getMyJobs(req.user.id, req.query.status);
    } else if (req.user.role === 'WORKER') {
      jobs = await jobService.getWorkerJobs(req.user.id, req.query.status);
    } else {
      jobs = await jobService.getJobs({ page: 1, limit: 50 });
    }
    res.json({ success: true, data: jobs });
  } catch (err) { next(err); }
});

// GET /api/jobs/:id — get single job
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const job = await jobService.getJobById(req.params.id, req.user.id);
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
});

// PUT /api/jobs/:id/status — update job status
router.put('/:id/status', authenticate, async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await jobService.updateJobStatus(req.params.id, status, req.user);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /api/jobs/:id — delete job
router.delete('/:id', authenticate, customerOnly, async (req, res, next) => {
  try {
    const result = await jobService.deleteJob(req.params.id, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── Quotations for a job ───────────────────

// POST /api/jobs/:jobId/quotations — submit quotation
router.post('/:jobId/quotations', authenticate, workerOnly, validate(schemas.submitQuotation), async (req, res, next) => {
  try {
    const quotation = await quotationService.submitQuotation(req.params.jobId, req.user.id, req.body);
    res.status(201).json({ success: true, data: quotation });
  } catch (err) { next(err); }
});

// GET /api/jobs/:jobId/quotations — get quotations for a job
router.get('/:jobId/quotations', authenticate, async (req, res, next) => {
  try {
    const quotations = await quotationService.getJobQuotations(req.params.jobId, req.user);
    res.json({ success: true, data: quotations });
  } catch (err) { next(err); }
});

// POST /api/jobs/:jobId/quotations/:quotationId/accept — accept a quotation
router.post('/:jobId/quotations/:quotationId/accept', authenticate, customerOnly, async (req, res, next) => {
  try {
    const result = await quotationService.acceptQuotation(req.params.quotationId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/jobs/:jobId/quotations/:quotationId/reject — reject
router.post('/:jobId/quotations/:quotationId/reject', authenticate, customerOnly, async (req, res, next) => {
  try {
    const result = await quotationService.rejectQuotation(req.params.quotationId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/jobs/:jobId/quotations/:quotationId/withdraw — withdraw (worker)
router.post('/:jobId/quotations/:quotationId/withdraw', authenticate, workerOnly, async (req, res, next) => {
  try {
    const result = await quotationService.withdrawQuotation(req.params.quotationId, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/jobs/:jobId/review — add review
router.post('/:jobId/review', authenticate, customerOnly, validate(schemas.createReview), async (req, res, next) => {
  try {
    const prisma = require('../config/database');
    const { NotFoundError, ForbiddenError, AppError } = require('../utils/errors');

    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { customerProfile: true },
    });
    if (!job) return next(new NotFoundError('Job'));
    if (job.customerProfile.userId !== req.user.id) return next(new ForbiddenError());
    if (!['COMPLETED', 'PAID'].includes(job.status)) {
      return next(new AppError('Job must be completed before reviewing.', 400, 'INVALID_OPERATION'));
    }
    const existing = await prisma.review.findUnique({ where: { jobId: req.params.jobId } });
    if (existing) return next(new AppError('You have already reviewed this job.', 409, 'DUPLICATE'));

    const review = await prisma.review.create({
      data: { jobId: req.params.jobId, workerProfileId: job.selectedWorkerId, ...req.body },
    });

    // Update job status to REVIEWED
    await prisma.job.update({ where: { id: req.params.jobId }, data: { status: 'REVIEWED' } });

    // Update worker average rating
    const reviews = await prisma.review.findMany({ where: { workerProfileId: job.selectedWorkerId } });
    const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
    await prisma.workerProfile.update({
      where: { id: job.selectedWorkerId },
      data: { averageRating: parseFloat(avgRating.toFixed(2)) },
    });

    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
});

module.exports = router;
