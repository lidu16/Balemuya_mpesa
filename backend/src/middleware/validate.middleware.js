const { z } = require('zod');
const { ValidationError } = require('../utils/errors');

/**
 * Middleware factory: validate request body with Zod schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          message: 'Validation failed.',
          code: 'VALIDATION_ERROR',
          errors: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
};

/**
 * Middleware factory: validate query params with Zod schema
 */
const validateQuery = (schema) => {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err.name === 'ZodError') {
        return res.status(400).json({
          success: false,
          message: 'Invalid query parameters.',
          code: 'VALIDATION_ERROR',
          errors: err.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(err);
    }
  };
};

// ─────────────────────────────────────────────
// Shared schemas
// ─────────────────────────────────────────────
const schemas = {
  pagination: z.object({
    page: z.string().optional().transform((v) => parseInt(v) || 1),
    limit: z.string().optional().transform((v) => Math.min(parseInt(v) || 20, 100)),
  }),

  registerCustomer: z.object({
    fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^\+?[0-9]{9,15}$/, 'Invalid phone number'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    city: z.string().max(100).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),

  registerWorker: z.object({
    fullName: z.string().min(2).max(100),
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^\+?[0-9]{9,15}$/, 'Invalid phone number'),
    password: z.string().min(8)
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    bio: z.string().max(500).optional(),
    experience: z.number().int().min(0).max(50).optional(),
    startingPrice: z.number().min(0).optional(),
    city: z.string().max(100).optional(),
    subCity: z.string().max(100).optional(),
    serviceArea: z.string().max(200).optional(),
    serviceRadius: z.number().min(1).max(200).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    categoryIds: z.array(z.string().uuid()).optional(),
    skills: z.array(z.string()).optional(),
  }),

  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  createJob: z.object({
    title: z.string().min(5, 'Job title must be at least 5 characters').max(200),
    categoryId: z.string().uuid('Invalid category ID'),
    description: z.string().min(20, 'Description must be at least 20 characters').max(2000),
    location: z.string().min(3).max(300),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    city: z.string().max(100).optional(),
    area: z.string().max(100).optional(),
    preferredDate: z.string().datetime().optional(),
    preferredTime: z.string().max(50).optional(),
    budget: z.number().min(0).optional(),
    urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'EMERGENCY']).optional(),
    additionalNotes: z.string().max(500).optional(),
  }),

  submitQuotation: z.object({
    price: z.number().min(1, 'Price must be at least 1 ETB'),
    estimatedTime: z.string().min(1, 'Estimated time is required').max(200),
    message: z.string().min(10, 'Please provide a message').max(1000),
  }),

  createReview: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(1000).optional(),
  }),

  recordPayment: z.object({
    jobId: z.string().uuid(),
    amount: z.number().min(1),
    method: z.enum(['CASH', 'MPESA', 'OTHER']).default('CASH'),
    notes: z.string().max(500).optional(),
  }),
};

module.exports = { validate, validateQuery, schemas };
