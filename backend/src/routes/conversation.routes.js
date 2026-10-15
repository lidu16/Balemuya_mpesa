const express = require('express');
const router = express.Router();
const chatService = require('../services/chat.service');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/conversations — get user's conversations
router.get('/', authenticate, async (req, res, next) => {
  try {
    const conversations = await chatService.getUserConversations(req.user.id);
    res.json({ success: true, data: conversations });
  } catch (err) { next(err); }
});

// POST /api/conversations/job/:jobId — get or create conversation for a job
router.post('/job/:jobId', authenticate, async (req, res, next) => {
  try {
    const conversation = await chatService.getOrCreateConversation(req.params.jobId, req.user);
    res.json({ success: true, data: conversation });
  } catch (err) { next(err); }
});

// GET /api/conversations/:id/messages — get messages
router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const result = await chatService.getMessages(req.params.id, req.user.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// POST /api/conversations/:id/messages — send message
router.post('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const { content } = req.body;
    const io = req.app.get('io');
    const message = await chatService.sendMessage(req.params.id, req.user.id, content, io);
    res.status(201).json({ success: true, data: message });
  } catch (err) { next(err); }
});

module.exports = router;
