const express = require('express');
const router = express.Router();
const notificationService = require('../services/notification.service');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/notifications
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page, limit, unreadOnly } = req.query;
    const result = await notificationService.getNotifications(req.user.id, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      unreadOnly: unreadOnly === 'true',
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count
router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount(req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// PUT /api/notifications/read — mark as read
router.put('/read', authenticate, async (req, res, next) => {
  try {
    const { ids } = req.body; // optional array of IDs; if not provided, marks all
    const result = await notificationService.markAsRead(req.user.id, ids);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
