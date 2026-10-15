const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

// GET /api/users/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, fullName: true, email: true, phone: true, role: true,
        status: true, isVerified: true, avatarUrl: true, city: true,
        latitude: true, longitude: true, createdAt: true,
        customerProfile: { select: { id: true } },
        workerProfile: {
          select: {
            id: true, bio: true, experience: true, startingPrice: true,
            availability: true, verificationStatus: true, completedJobs: true,
            averageRating: true, totalEarnings: true, profileCompletion: true,
            serviceRadius: true, city: true, subCity: true, serviceArea: true,
          },
        },
      },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// PUT /api/users/me
router.put('/me', authenticate, async (req, res, next) => {
  try {
    const { fullName, phone, city, latitude, longitude, avatarUrl } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName, phone, city, latitude, longitude, avatarUrl },
      select: { id: true, fullName: true, email: true, phone: true, role: true, city: true, avatarUrl: true, latitude: true, longitude: true },
    });

    await prisma.auditLog.create({
      data: { userId: req.user.id, action: 'UPDATE_PROFILE', resource: 'User', resourceId: req.user.id },
    });

    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /api/users/:id — public profile (limited info)
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, fullName: true, role: true, avatarUrl: true, city: true, createdAt: true },
    });
    if (!user) return next(new NotFoundError('User'));
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

module.exports = router;
