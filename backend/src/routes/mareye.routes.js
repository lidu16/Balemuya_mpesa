const express = require('express');
const router = express.Router();
const mareyeService = require('../services/ai/mareye.service');
const { authenticate, optionalAuth } = require('../middleware/auth.middleware');

// POST /api/mareye/chat — chat with Mareye AI assistant
router.post('/chat', optionalAuth, async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ success: false, message: 'Message is required.', code: 'VALIDATION_ERROR' });
    }

    if (message.length > 2000) {
      return res.status(400).json({ success: false, message: 'Message too long (max 2000 characters).', code: 'VALIDATION_ERROR' });
    }

    const context = req.user ? { userId: req.user.id, role: req.user.role } : {};
    const result = await mareyeService.chat(message, history, context);

    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/mareye/extract — extract job intent from natural language
router.post('/extract', optionalAuth, async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });

    const structured = await mareyeService.extractJobIntent(message);
    res.json({ success: true, data: structured });
  } catch (err) { next(err); }
});

// GET /api/mareye/status — check if Mareye is available
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      available: mareyeService.enabled,
      name: 'Mareye',
      description: 'Balemuya AI Assistant — Amharic + English',
      version: '1.0.0',
    },
  });
});

module.exports = router;
