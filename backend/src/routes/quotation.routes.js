const express = require('express');
const router = express.Router();
// quotation routes (standalone, not nested under jobs)
const quotationService = require('../services/quotation.service');
const { authenticate, workerOnly, customerOnly } = require('../middleware/auth.middleware');

// PUT /api/quotations/:id/withdraw
router.put('/:id/withdraw', authenticate, workerOnly, async (req, res, next) => {
  try {
    const result = await quotationService.withdrawQuotation(req.params.id, req.user.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
