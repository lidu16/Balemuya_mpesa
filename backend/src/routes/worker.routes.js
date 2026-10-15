const express = require('express');
const router = express.Router();
const { workerService } = require('../services/worker.service');
const { authenticate, workerOnly, adminOnly } = require('../middleware/auth.middleware');
const mareyeService = require('../services/ai/mareye.service');

// GET /api/workers — list workers with filters
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, categoryId, city, availability, minRating, maxPrice, maxDistance, latitude, longitude, search, verificationStatus } = req.query;
    const result = await workerService.getWorkers({
      categoryId, city, availability, minRating, maxPrice,
      maxDistance: maxDistance ? parseFloat(maxDistance) : undefined,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      search, verificationStatus,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/workers/profile — get current worker's profile
router.get('/profile', authenticate, workerOnly, async (req, res, next) => {
  try {
    const profile = await workerService.getMyWorkerProfile(req.user.id);
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// GET /api/workers/:id — get worker profile by ID
router.get('/:id', async (req, res, next) => {
  try {
    const worker = await workerService.getWorkerById(req.params.id);
    res.json({ success: true, data: worker });
  } catch (err) { next(err); }
});

// PUT /api/workers/profile — update worker profile
router.put('/profile', authenticate, workerOnly, async (req, res, next) => {
  try {
    const updated = await workerService.updateWorkerProfile(req.user.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PUT /api/workers/availability — update availability
router.put('/availability', authenticate, workerOnly, async (req, res, next) => {
  try {
    const { availability } = req.body;
    if (!['AVAILABLE', 'UNAVAILABLE', 'BUSY'].includes(availability)) {
      return res.status(400).json({ success: false, message: 'Invalid availability value.', code: 'VALIDATION_ERROR' });
    }
    const updated = await workerService.updateAvailability(req.user.id, availability);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /api/workers/:id/match/:jobId — get match score for a worker and job
router.get('/:jobId/matches', authenticate, async (req, res, next) => {
  try {
    const { latitude, longitude } = req.query;
    const matches = await workerService.findMatchingWorkers(
      req.params.jobId,
      latitude ? parseFloat(latitude) : undefined,
      longitude ? parseFloat(longitude) : undefined
    );
    res.json({ success: true, data: matches });
  } catch (err) { next(err); }
});

// GET /api/workers/:id/profile-suggestions — Mareye AI profile tips
router.get('/profile/suggestions', authenticate, workerOnly, async (req, res, next) => {
  try {
    const profile = await workerService.getMyWorkerProfile(req.user.id);
    const suggestions = await mareyeService.getProfileSuggestions(profile);
    res.json({ success: true, data: suggestions });
  } catch (err) { next(err); }
});

module.exports = router;
