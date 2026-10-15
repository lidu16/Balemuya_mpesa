const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { validate, schemas } = require('../middleware/validate.middleware');

// POST /api/auth/register/customer
router.post('/register/customer', validate(schemas.registerCustomer), authController.registerCustomer);

// POST /api/auth/register/worker
router.post('/register/worker', validate(schemas.registerWorker), authController.registerWorker);

// POST /api/auth/login
router.post('/login', validate(schemas.login), authController.login);

// POST /api/auth/logout
router.post('/logout', authenticate, authController.logout);

// POST /api/auth/forgot-password
router.post('/forgot-password', authController.forgotPassword);

// POST /api/auth/reset-password
router.post('/reset-password', authController.resetPassword);

// GET /api/auth/me
router.get('/me', authenticate, authController.me);

module.exports = router;
