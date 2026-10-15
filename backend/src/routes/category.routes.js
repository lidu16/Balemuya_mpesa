const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const { authenticate } = require('../middleware/auth.middleware');

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    const categories = await prisma.serviceCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// POST /api/categories (admin)
router.post('/', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Admin only.' });
    const { name, nameAm, icon, description, sortOrder } = req.body;
    const cat = await prisma.serviceCategory.create({ data: { name, nameAm, icon, description, sortOrder } });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PUT /api/categories/:id (admin)
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Admin only.' });
    const cat = await prisma.serviceCategory.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /api/categories/:id (admin)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ success: false, message: 'Admin only.' });
    await prisma.serviceCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true, data: { message: 'Category deactivated.' } });
  } catch (err) { next(err); }
});

module.exports = router;
