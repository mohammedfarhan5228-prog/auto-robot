const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || uri.includes('<username>')) {
    console.error(
      '[RoboTrack] MONGODB_URI is missing or not filled in.\n' +
        '  1. Copy .env.example to .env\n' +
        '  2. Paste your MongoDB Atlas connection string and replace <password>'
    );
    process.exit(1);
  }

  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log(`[RoboTrack] Connected to MongoDB -> database "${mongoose.connection.name}"`);
  } catch (err) {
    console.error('[RoboTrack] MongoDB connection failed:', err.message);
    console.error(
      'Checklist:\n' +
        '  1) Is the Atlas cluster running (not paused)?\n' +
        '  2) Network Access -> add your IP or allow 0.0.0.0/0\n' +
        '  3) Username/password correct in the URI?'
    );
    process.exit(1);
  }
};

module.exports = connectDB;
