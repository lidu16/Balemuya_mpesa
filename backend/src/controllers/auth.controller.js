const authService = require('../services/auth.service');
const { validate, schemas } = require('../middleware/validate.middleware');

const authController = {
  /**
   * POST /api/auth/register/customer
   */
  async registerCustomer(req, res, next) {
    try {
      const result = await authService.registerCustomer(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/register/worker
   */
  async registerWorker(req, res, next) {
    try {
      const result = await authService.registerWorker(req.body);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/login
   */
  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const ipAddress = req.ip || req.connection?.remoteAddress;
      const result = await authService.login(email, password, ipAddress);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/logout
   */
  async logout(req, res) {
    // JWT logout is handled client-side (token deletion)
    // Server-side token blacklisting can be added later with Redis
    res.json({ success: true, message: 'Logged out successfully.' });
  },

  /**
   * POST /api/auth/forgot-password
   */
  async forgotPassword(req, res, next) {
    try {
      const { email } = req.body;
      const result = await authService.forgotPassword(email);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/auth/reset-password
   */
  async resetPassword(req, res, next) {
    try {
      const { token, password } = req.body;
      const result = await authService.resetPassword(token, password);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/auth/me
   */
  async me(req, res) {
    res.json({ success: true, data: req.user });
  },
};

module.exports = authController;
