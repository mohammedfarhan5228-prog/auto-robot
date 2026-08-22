/*
 * RoboTrack end-to-end smoke test (no Atlas needed).
 * Spins an in-memory MongoDB, inserts the same demo rows as the README,
 * starts the API + simulator, dispatches a delivery and waits until Delivered.
 *
 * Run:  npm run test:e2e
 * Note: the first run downloads a throwaway MongoDB binary (~70 MB).
 */
const { spawn } = require('child_process');

const BASE = 'http://localhost:3100';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('[e2e] starting in-memory MongoDB...');
  const { MongoMemoryServer } = require('mongodb-memory-server');
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri('robotrack');
  process.env.PORT = '3100';
  process.env.TICK_MS = '300';

  const connectDB = require('../backend/config/db');
  await connectDB();

  // same documents as the manual queries in the README
  const Pincode = require('../backend/models/Pincode');
  const Robot = require('../backend/models/Robot');
  await Pincode.insertMany([
    { pincode: '560001', area: 'MG Road', city: 'Bengaluru', latitude: 12.9756, longitude: 77.6068 },
    { pincode: '560034', area: 'Koramangala', city: 'Bengaluru', latitude: 12.9352, longitude: 77.6245 },
    { pincode: '560064', area: 'Jakkur', city: 'Bengaluru', latitude: 13.0474, longitude: 77.6192 }
  ]);
  await Robot.insertMany([
    { robotId: 'R-01', status: 'Available', battery: 91, latitude: 12.9762, longitude: 77.5993, speed: 0, online: true, currentTask: null },
    { robotId: 'R-02', status: 'Available', battery: 84, latitude: 12.96, longitude: 77.62, speed: 0, online: true, currentTask: null },
    { robotId: 'R-03', status: 'Charging', battery: 37, latitude: 12.985, longitude: 77.61, speed: 0, online: true, currentTask: null },
    { robotId: 'R-04', status: 'Available', battery: 68, latitude: 12.945, longitude: 77.585, speed: 0, online: true, currentTask: null },
    { robotId: 'R-05', status: 'Offline', battery: 22, latitude: 13.01, longitude: 77.555, speed: 0, online: false, currentTask: null }
  ]);

  const { createApp } = require('../backend/app');
  const server = createApp().listen(3100);
  console.log('[e2e] API listening on :3100');

  const sim = spawn(process.execPath, ['simulator/simulator.js'], {
    env: { ...process.env, API_URL: BASE },
    stdio: 'inherit'
  });

  await wait(2500);

  const post = (p, body) =>
    fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' (' + extra + ')' : ''}`);
    if (!cond) failures++;
  };

  const health = await fetch(BASE + '/api/health').then((r) => r.json());
  check('health endpoint responds', health.ok === true);

  const nearestRes = await post('/api/robots/nearest', { latitude: 13.0474, longitude: 77.6192 });
  const nearest = await nearestRes.json();
  check('nearest robot for Jakkur is R-01', nearest.selected && nearest.selected.robotId === 'R-01',
    nearest.selected ? nearest.selected.robotId : 'none');
  check('ineligible robots are listed with reasons', Array.isArray(nearest.skipped) && nearest.skipped.length >= 2);

  const dispatchRes = await post('/api/dispatch', { pincode: '560064' });
  const dispatched = await dispatchRes.json();
  check('dispatch creates delivery assigned to R-01',
    dispatchRes.status === 201 && dispatched.delivery && dispatched.delivery.assignedRobot === 'R-01');

  const id = dispatched.delivery.deliveryId;
  let delivery = null;
  let lastStatus = '';
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    await wait(1500);
    delivery = await fetch(`${BASE}/api/deliveries/${id}`).then((r) => r.json());
    if (delivery.status !== lastStatus) {
      console.log(`[e2e] ${id} -> ${delivery.status} (${Math.round(delivery.progress)}%)`);
      lastStatus = delivery.status;
    }
    if (delivery.status === 'Delivered') break;
  }
  check('delivery reached Delivered', delivery && delivery.status === 'Delivered');
  check('progress completed to 100%', delivery && delivery.progress === 100);

  const robots = await fetch(BASE + '/api/robots').then((r) => r.json());
  const r01 = robots.find((r) => r.robotId === 'R-01');
  check('R-01 released back to Available/Charging', ['Available', 'Charging'].includes(r01.status), r01.status);

  const telemetry = await fetch(BASE + '/api/robots/R-01/telemetry?limit=500').then((r) => r.json());
  check('telemetry history recorded', telemetry.length >= 10, `${telemetry.length} points`);

  await wait(1500);
  const second = await post('/api/dispatch', { pincode: '560034' });
  check('second dispatch accepted after release', second.status === 201);

  console.log(failures ? `[e2e] ${failures} check(s) FAILED` : '[e2e] ALL CHECKS PASSED');
  sim.kill();
  server.close();
  await mongod.stop();
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error('[e2e] crashed:', err);
  process.exit(1);
});
