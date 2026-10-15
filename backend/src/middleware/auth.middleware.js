const jwt = require('jsonwebtoken');
const prisma = require('../config/database');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

/**
 * Middleware: Authenticate JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No authentication token provided.');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        isVerified: true,
      },
    });

    if (!user) {
      throw new UnauthorizedError('User no longer exists.');
    }

    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError('Your account has been suspended. Please contact support.');
    }

    if (user.status === 'DELETED') {
      throw new UnauthorizedError('This account has been deleted.');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Middleware: Require specific roles
 */
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Access restricted to: ${roles.join(', ')}`));
    }
    next();
  };
};

/**
 * Middleware: Admin only
 */
const adminOnly = requireRole('ADMIN');

/**
 * Middleware: Customer only
 */
const customerOnly = requireRole('CUSTOMER');

/**
 * Middleware: Worker only
 */
const workerOnly = requireRole('WORKER');

/**
 * Middleware: Optional auth (doesn't fail if no token)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, fullName: true, role: true, status: true },
    });

    if (user && user.status === 'ACTIVE') {
      req.user = user;
    }

    next();
  } catch {
    next(); // silently continue
  }
};

module.exports = { authenticate, requireRole, adminOnly, customerOnly, workerOnly, optionalAuth };
