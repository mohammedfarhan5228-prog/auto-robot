const express = require('express');
const Robot = require('../models/Robot');
const Telemetry = require('../models/Telemetry');
const Delivery = require('../models/Delivery');
const { selectNearestRobot } = require('../utils/selectRobot');

const router = express.Router();

// GET /api/robots -> full fleet snapshot
router.get('/', async (req, res, next) => {
  try {
    const robots = await Robot.find().lean();
    res.json(robots);
  } catch (err) {
    next(err);
  }
});

// POST /api/robots/nearest { latitude, longitude }
// Runs the selection algorithm WITHOUT dispatching anything.
router.post('/nearest', async (req, res, next) => {
  try {
    const lat = Number(req.body.latitude);
    const lng = Number(req.body.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return res.status(400).json({ message: 'latitude and longitude are required numbers' });
    }

    const { selected, candidates, skipped, reason } = await selectNearestRobot(lat, lng);
    if (!selected) {
      return res.status(409).json({
        message: 'No robot is currently eligible (must be Available, Online and above 30% battery).',
        candidates,
        skipped
      });
    }

    res.json({
      selected: {
        robotId: selected.robotId,
        status: selected.status,
        battery: Math.round(selected.battery),
        latitude: selected.latitude,
        longitude: selected.longitude,
        distanceKm: selected.distanceKm
      },
      candidates: candidates.map((c) => ({ robotId: c.robotId, distanceKm: c.distanceKm, battery: Math.round(c.battery) })),
      skipped,
      reason
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/robots/:robotId/toggle-online  (admin convenience)
router.post('/:robotId/toggle-online', async (req, res, next) => {
  try {
    const robot = await Robot.findOne({ robotId: req.params.robotId });
    if (!robot) return res.status(404).json({ message: 'Robot not found' });
    if (['En Route', 'Delivering', 'Assigned'].includes(robot.status)) {
      return res.status(409).json({ message: 'Robot is on an active delivery and cannot go offline.' });
    }
    robot.online = !robot.online;
    robot.status = robot.online ? (robot.currentTask ? robot.status : 'Available') : 'Offline';
    robot.speed = 0;
    await robot.save();
    res.json(robot);
  } catch (err) {
    next(err);
  }
});

// GET /api/robots/:robotId/telemetry?limit=100 -> recent telemetry history
router.get('/:robotId/telemetry', async (req, res, next) => {
  try {
    const limit = Math.min(500, parseInt(req.query.limit, 10) || 100);
    const docs = await Telemetry.find({ robotId: req.params.robotId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();
    res.json(docs.reverse());
  } catch (err) {
    next(err);
  }
});

// GET /api/robots/:robotId/deliveries -> delivery history for one robot
router.get('/:robotId/deliveries', async (req, res, next) => {
  try {
    const docs = await Delivery.find({ assignedRobot: req.params.robotId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(docs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
