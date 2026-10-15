const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/reviews/worker/:workerId
router.get('/worker/:workerId', async (req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { workerProfileId: req.params.workerId },
      include: {
        job: {
          include: {
            customerProfile: { include: { user: { select: { fullName: true, avatarUrl: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
});

module.exports = router;
