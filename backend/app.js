require('dotenv').config();
const path = require('path');
const express = require('express');

function createApp() {
  const app = express();

  app.use(express.json());

  // API routes
  const deliveries = require('./routes/deliveries');
  app.use('/api/pincodes', require('./routes/pincodes'));
  app.use('/api/robots', require('./routes/robots'));
  app.use('/api/deliveries', deliveries);
  app.post('/api/dispatch', deliveries.dispatch);
  app.use('/api/telemetry', require('./routes/telemetry'));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'RoboTrack API', time: new Date().toISOString() });
  });

  // convenience: /admin serves the admin dashboard
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'admin.html'));
  });

  // static frontend (index.html served at /)
  app.use(express.static(path.join(__dirname, '..', 'frontend')));

  // 404 for unknown API routes
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ message: 'Not found' });
    res.status(404).sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
  });

  // central error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[RoboTrack] Error:', err.message);
    res.status(500).json({ message: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
