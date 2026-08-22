require('dotenv').config();
const connectDB = require('./config/db');
const { createApp } = require('./app');

const PORT = process.env.PORT || 3000;

(async () => {
  await connectDB();

  // Single-process deployment mode (Render free tier etc.):
  // EMBED_SIMULATOR=true runs the robot fleet simulation inside the web server.
  if (/^true$/i.test(process.env.EMBED_SIMULATOR || '')) {
    // the embedded simulator talks to this very server, so align the port
    process.env.API_URL = process.env.API_URL || `http://localhost:${PORT}`;
    require('../simulator/simulator').startSimulator();
    console.log('[RoboTrack] Simulator embedded in this process (EMBED_SIMULATOR=true)');
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log('===============================================');
    console.log('  RoboTrack server running');
    console.log(`  Customer view : http://localhost:${PORT}`);
    console.log(`  Admin dashboard: http://localhost:${PORT}/admin`);
    console.log('  (keep this window open; run "npm run simulate" in a second terminal)');
    console.log('===============================================');
  });
})();
