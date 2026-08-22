const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema(
  {
    deliveryId: { type: String, required: true, unique: true },
    pincode: { type: String, required: true },
    destination: {
      label: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true }
    },
    assignedRobot: { type: String, required: true },
    status: {
      type: String,
      enum: ['Assigned', 'En Route', 'Delivering', 'Delivered'],
      default: 'Assigned'
    },
    etaMinutes: { type: Number, default: 0 },
    distanceKm: { type: Number, default: 0 },
    remainingKm: { type: Number, default: 0 },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    route: [[Number]],
    deliveredAt: { type: Date, default: null }
  },
  { timestamps: true }
);

deliverySchema.index({ createdAt: -1 });

module.exports = mongoose.model('Delivery', deliverySchema);
