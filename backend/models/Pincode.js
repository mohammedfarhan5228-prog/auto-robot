const mongoose = require('mongoose');

const pincodeSchema = new mongoose.Schema({
  pincode: { type: String, required: true, unique: true },
  area: { type: String, required: true },
  city: { type: String, default: 'Bengaluru' },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true }
});

module.exports = mongoose.model('Pincode', pincodeSchema);
