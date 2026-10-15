require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');

const logger = require('./config/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const workerRoutes = require('./routes/worker.routes');
const jobRoutes = require('./routes/job.routes');
const quotationRoutes = require('./routes/quotation.routes');
const conversationRoutes = require('./routes/conversation.routes');
const notificationRoutes = require('./routes/notification.routes');
const paymentRoutes = require('./routes/payment.routes');
const reviewRoutes = require('./routes/review.routes');
const reportRoutes = require('./routes/report.routes');
const adminRoutes = require('./routes/admin.routes');
const mareyeRoutes = require('./routes/mareye.routes');
const categoryRoutes = require('./routes/category.routes');
const uploadRoutes = require('./routes/upload.routes');

const app = express();
const httpServer = createServer(app);

// ─────────────────────────────────────────────
// Socket.IO (real-time chat ready)
// ─────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Attach io to app for use in routes/controllers
app.set('io', io);

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('join_conversation', (conversationId) => {
    socket.join(`conversation_${conversationId}`);
  });

  socket.on('leave_conversation', (conversationId) => {
    socket.leave(`conversation_${conversationId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─────────────────────────────────────────────
// Security middleware
// ─────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow serving uploaded images
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 200,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMIT',
  },
});

app.use('/api/auth', authLimiter);
app.use('/api', limiter);

// ─────────────────────────────────────────────
// Body parsing
// ─────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

// ─────────────────────────────────────────────
// Static file serving (uploads)
// ─────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ success: true, message: 'Balemuya API is running', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/mareye', mareyeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/upload', uploadRoutes);

// ─────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
  logger.info(`🚀 Balemuya API running on port ${PORT}`);
  logger.info(`📱 Environment: ${process.env.NODE_ENV}`);
  logger.info(`🌐 CORS: ${process.env.FRONTEND_URL}`);
});

module.exports = { app, httpServer };
