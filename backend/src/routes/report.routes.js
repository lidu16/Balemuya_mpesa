const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// POST /api/reports
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { reportedUserId, jobId, reason, description } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Reason is required.' });

    const report = await prisma.report.create({
      data: { reporterId: req.user.id, reportedUserId, jobId, reason, description },
    });
    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
});

// GET /api/reports/my
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const reports = await prisma.report.findMany({
      where: { reporterId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: reports });
  } catch (err) { next(err); }
});

module.exports = router;
