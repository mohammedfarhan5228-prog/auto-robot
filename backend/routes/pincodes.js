const express = require('express');
const Pincode = require('../models/Pincode');

const router = express.Router();

// GET /api/pincodes -> all supported demo PIN codes (for autocomplete)
router.get('/', async (req, res, next) => {
  try {
    const docs = await Pincode.find().lean();
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// GET /api/pincodes/:pin -> one demo location
router.get('/:pin', async (req, res, next) => {
  try {
    const doc = await Pincode.findOne({ pincode: String(req.params.pin).trim() }).lean();
    if (!doc) {
      return res.status(404).json({
        message: `PIN ${req.params.pin} not found. Try one of: 560001, 560034, 560038, 560063, 560064, 560065, 560097, 560100`
      });
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
