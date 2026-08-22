const mongoose = require('mongoose');

const robotSchema = new mongoose.Schema(
  {
    robotId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: [
        'Available',
        'Assigned',
        'En Route',
        'Delivering',
        'Charging',
        'Obstacle Detected',
        'Path Clear',
        'Offline'
      ],
      default: 'Available'
    },
    battery: { type: Number, default: 100, min: 0, max: 100 },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    speed: { type: Number, default: 0 },
    online: { type: Boolean, default: true },
    currentTask: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Robot', robotSchema);
