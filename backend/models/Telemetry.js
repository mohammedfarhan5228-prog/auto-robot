const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    robotId: { type: String, required: true, index: true },
    deliveryId: { type: String, default: null },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    speed: { type: Number, default: 0 },
    battery: { type: Number, default: 100 },
    status: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  },
  { capped: false }
);

telemetrySchema.index({ robotId: 1, timestamp: -1 });

module.exports = mongoose.model('Telemetry', telemetrySchema);
