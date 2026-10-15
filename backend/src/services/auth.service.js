const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/database');
const logger = require('../config/logger');
const { AppError, ConflictError, UnauthorizedError, NotFoundError } = require('../utils/errors');

const SALT_ROUNDS = 12;

/**
 * Generate JWT access token
 */
const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

/**
 * Sanitize user for response (remove sensitive fields)
 */
const sanitizeUser = (user) => {
  const { passwordHash, ...safe } = user;
  return safe;
};

/**
 * Calculate worker profile completion percentage
 */
const calculateProfileCompletion = (workerProfile, user) => {
  let score = 0;
  const checks = [
    [user.avatarUrl, 15],
    [workerProfile.bio, 10],
    [workerProfile.experience > 0, 10],
    [workerProfile.startingPrice > 0, 10],
    [workerProfile.city, 10],
    [workerProfile.latitude && workerProfile.longitude, 15],
    [workerProfile.serviceArea, 10],
    // categories and skills checked separately
    [true, 10], // placeholder for categories
    [true, 10], // placeholder for skills
  ];
  for (const [val, points] of checks) {
    if (val) score += points;
  }
  return Math.min(score, 100);
};

// ─────────────────────────────────────────────
// AUTH SERVICE
// ─────────────────────────────────────────────

const authService = {
  /**
   * Register a new customer
   */
  async registerCustomer(data) {
    const { fullName, email, phone, password, city, latitude, longitude } = data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existing) {
      if (existing.email === email) throw new ConflictError('Email address is already registered.');
      throw new ConflictError('Phone number is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role: 'CUSTOMER',
        city,
        latitude,
        longitude,
        customerProfile: { create: {} },
      },
      include: { customerProfile: true },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        resource: 'User',
        resourceId: user.id,
        metadata: { role: 'CUSTOMER', email },
      },
    });

    const token = generateToken(user.id, user.role);
    return { user: sanitizeUser(user), token };
  },

  /**
   * Register a new worker
   */
  async registerWorker(data) {
    const {
      fullName, email, phone, password,
      bio, experience, startingPrice,
      city, subCity, serviceArea, serviceRadius,
      latitude, longitude,
      categoryIds = [], skills = [],
    } = data;

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });

    if (existing) {
      if (existing.email === email) throw new ConflictError('Email address is already registered.');
      throw new ConflictError('Phone number is already registered.');
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Validate categories exist
    let categoryConnections = [];
    if (categoryIds.length > 0) {
      const categories = await prisma.serviceCategory.findMany({
        where: { id: { in: categoryIds }, isActive: true },
      });
      categoryConnections = categories.map((c) => ({ categoryId: c.id }));
    }

    // Create or find skills
    let skillConnections = [];
    if (skills.length > 0) {
      const skillRecords = await Promise.all(
        skills.map((name) =>
          prisma.skill.upsert({
            where: { name },
            update: {},
            create: { name },
          })
        )
      );
      skillConnections = skillRecords.map((s) => ({ skillId: s.id }));
    }

    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        phone,
        passwordHash,
        role: 'WORKER',
        city,
        latitude,
        longitude,
        workerProfile: {
          create: {
            bio,
            experience: experience || 0,
            startingPrice: startingPrice || 0,
            city,
            subCity,
            serviceArea,
            serviceRadius: serviceRadius || 10,
            latitude,
            longitude,
            categories: { create: categoryConnections },
            skills: { create: skillConnections },
          },
        },
      },
      include: {
        workerProfile: {
          include: { categories: true, skills: true },
        },
      },
    });

    // Calculate profile completion
    const completion = calculateProfileCompletion(user.workerProfile, user);
    await prisma.workerProfile.update({
      where: { id: user.workerProfile.id },
      data: { profileCompletion: completion },
    });

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'REGISTER',
        resource: 'User',
        resourceId: user.id,
        metadata: { role: 'WORKER', email },
      },
    });

    const token = generateToken(user.id, user.role);
    return { user: sanitizeUser(user), token };
  },

  /**
   * Login
   */
  async login(email, password, ipAddress) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        workerProfile: { select: { id: true, availability: true, verificationStatus: true } },
        customerProfile: { select: { id: true } },
      },
    });

    if (!user) throw new UnauthorizedError('Invalid email or password.');

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) throw new UnauthorizedError('Invalid email or password.');

    if (user.status === 'SUSPENDED') {
      throw new AppError('Your account has been suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED');
    }

    if (user.status === 'DELETED') {
      throw new UnauthorizedError('Invalid email or password.');
    }

    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        resource: 'User',
        resourceId: user.id,
        ipAddress,
        metadata: { email },
      },
    });

    const token = generateToken(user.id, user.role);
    return { user: sanitizeUser(user), token };
  },

  /**
   * Forgot password — generate reset token
   */
  async forgotPassword(email) {
    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return { message: 'If that email exists, a reset link has been sent.' };

    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    // TODO: Send email with reset link: /reset-password?token={token}
    logger.info(`Password reset token for ${email}: ${token}`);

    return { message: 'If that email exists, a reset link has been sent.' };
  },

  /**
   * Reset password with token
   */
  async resetPassword(token, newPassword) {
    const resetRecord = await prisma.passwordReset.findUnique({ where: { token } });

    if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
      throw new AppError('Invalid or expired reset token.', 400, 'INVALID_RESET_TOKEN');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
    ]);

    return { message: 'Password reset successfully.' };
  },
};

module.exports = authService;
