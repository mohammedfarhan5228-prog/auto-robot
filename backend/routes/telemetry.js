const express = require('express');
const Robot = require('../models/Robot');
const Telemetry = require('../models/Telemetry');
const Delivery = require('../models/Delivery');

const router = express.Router();

// POST /api/telemetry
// One call per simulation tick from the simulator:
//   - updates the robot document (live snapshot)
//   - appends a telemetry history point
//   - syncs the linked delivery's progress / ETA / status
router.post('/', async (req, res, next) => {
  try {
    const { robotId, latitude, longitude, speed, battery, status, deliveryId, progress } = req.body;

    const robot = await Robot.findOne({ robotId });
    if (!robot) return res.status(404).json({ message: `Unknown robot ${robotId}` });

    robot.latitude = Number(latitude);
    robot.longitude = Number(longitude);
    robot.speed = Math.max(0, Number(speed) || 0);
    robot.battery = Math.min(100, Math.max(0, Number(battery)));

    if (status === 'Delivered') {
      // final tick of a trip: "Delivered" is a delivery status, not a robot
      // state - park the robot instead (charge it if the trip drained it).
      robot.speed = 0;
      robot.currentTask = null;
      robot.status = robot.battery < 40 ? 'Charging' : 'Available';
    } else {
      robot.status = status;
    }
    await robot.save();

    await Telemetry.create({
      robotId,
      deliveryId: deliveryId || null,
      latitude: robot.latitude,
      longitude: robot.longitude,
      speed: robot.speed,
      battery: robot.battery,
      status
    });

    if (deliveryId) {
      const delivery = await Delivery.findOne({ deliveryId });
      if (delivery && delivery.status !== 'Delivered') {
        const p = Math.min(100, Math.max(0, Number(progress) || 0));
        delivery.progress = +p.toFixed(1);
        delivery.remainingKm = +(delivery.distanceKm * (1 - p / 100)).toFixed(3);

        if (status === 'Delivering') delivery.status = 'Delivering';
        else if (status === 'En Route' || status === 'Obstacle Detected' || status === 'Path Clear') {
          if (delivery.status === 'Assigned') delivery.status = 'En Route';
        }

        const effSpeed = Math.max(robot.speed, 8); // avoid divide-by-tiny ETA while stopped
        delivery.etaMinutes = Math.max(0.2, +((delivery.remainingKm / effSpeed) * 60).toFixed(1));

        if (status === 'Delivered') {
          delivery.status = 'Delivered';
          delivery.progress = 100;
          delivery.remainingKm = 0;
          delivery.etaMinutes = 0;
          delivery.deliveredAt = new Date();
        }

        await delivery.save();
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
