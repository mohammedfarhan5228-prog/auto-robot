const express = require('express');
const Robot = require('../models/Robot');
const Delivery = require('../models/Delivery');
const Pincode = require('../models/Pincode');
const { selectNearestRobot } = require('../utils/selectRobot');
const { buildRoute } = require('../utils/geo');

const router = express.Router();

// POST /api/dispatch { pincode }
// 1. resolve PIN -> demo location
// 2. run nearest-robot selection
// 3. atomically claim the robot (status Available -> Assigned)
// 4. build the route and create the delivery
async function dispatch(req, res, next) {
  try {
    const pincode = String(req.body.pincode || '').trim();
    const location = await Pincode.findOne({ pincode }).lean();
    if (!location) return res.status(404).json({ message: `PIN ${pincode} not found in demo dataset` });

    const { selected, reason } = await selectNearestRobot(location.latitude, location.longitude);
    if (!selected) {
      return res.status(409).json({
        message: 'Dispatch failed: no robot is eligible (Available + Online + battery > 30%).'
      });
    }

    // Atomic claim: only succeeds if the robot is still Available.
    const claimed = await Robot.findOneAndUpdate(
      { robotId: selected.robotId, status: 'Available', online: true },
      { $set: { status: 'Assigned', speed: 0 } },
      { new: true }
    );
    if (!claimed) {
      return res.status(409).json({ message: `${selected.robotId} was just taken by another delivery. Try again.` });
    }

    const count = await Delivery.countDocuments();
    const deliveryId = `DLV-${String(1001 + count)}`;

    const { route, distanceKm } = buildRoute(
      [claimed.latitude, claimed.longitude],
      [location.latitude, location.longitude]
    );

    const delivery = await Delivery.create({
      deliveryId,
      pincode,
      destination: { label: `${location.area}, ${location.city}`, latitude: location.latitude, longitude: location.longitude },
      assignedRobot: claimed.robotId,
      status: 'Assigned',
      etaMinutes: Math.max(1, Math.round((distanceKm / 22) * 60)),
      distanceKm,
      remainingKm: distanceKm,
      progress: 0,
      route
    });

    claimed.currentTask = deliveryId;
    await claimed.save();

    res.status(201).json({ delivery: delivery.toObject(), robot: claimed.toObject(), reason });
  } catch (err) {
    next(err);
  }
}

// GET /api/deliveries?status=Assigned&limit=25
router.get('/', async (req, res, next) => {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    const docs = await Delivery.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

// GET /api/deliveries/:deliveryId
router.get('/:deliveryId', async (req, res, next) => {
  try {
    const doc = await Delivery.findOne({ deliveryId: req.params.deliveryId }).lean();
    if (!doc) return res.status(404).json({ message: 'Delivery not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.dispatch = dispatch;
