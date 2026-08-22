/*
 * RoboTrack Robot Simulator
 * -------------------------
 * This Node.js process plays the role of the real robot fleet's IoT firmware.
 * In a production system each robot (ESP32 + GPS + motor controller) would POST
 * telemetry to the same API. Here everything is software-simulated.
 *
 * What it does every tick (~900 ms):
 *   - polls the backend for deliveries with status "Assigned" and starts a trip
 *   - walks the robot along its pre-computed route point by point
 *   - drains the battery, varies the speed, updates status transitions
 *   - charges robots that are parked with status "Charging"
 *   - randomly triggers one obstacle event per trip:
 *       Obstacle Detected -> stops -> Path Clear -> continues
 *   - sends every update to POST /api/telemetry (robot + delivery + history)
 */

const API = process.env.API_URL || 'http://localhost:3000';
const TICK_MS = parseInt(process.env.TICK_MS || '900', 10);
const OBSTACLE_CHANCE = 0.35; // 35% of trips hit one obstacle
const DISPLAY_SPEED_KMH = [19, 26]; // cosmetic speed range shown on the dashboard

const trips = new Map(); // deliveryId -> trip state
let warnedServerDown = false;

async function api(pathname, options = {}) {
  const res = await fetch(`${API}${pathname}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.message) msg = body.message;
    } catch (_) { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => min + Math.random() * (max - min);
const round1 = (n) => Math.round(n * 10) / 10;

function log(...args) {
  console.log(`[${new Date().toLocaleTimeString()}]`, ...args);
}

// ---------- trip lifecycle ----------

async function startTrip(delivery) {
  const robotId = delivery.assignedRobot;
  const route = delivery.route;
  const obstacleAt =
    Math.random() < OBSTACLE_CHANCE ? Math.floor(route.length * rand(0.3, 0.7)) : -1;

  trips.set(delivery.deliveryId, {
    deliveryId: delivery.deliveryId,
    robotId,
    route,
    index: 0,
    battery: null, // read from the robot doc on the first tick
    obstacleAt,
    mode: 'move', // move | obstacle | clear
    resumeAt: 0,
    displaySpeed: rand(DISPLAY_SPEED_KMH[0], DISPLAY_SPEED_KMH[1])
  });

  log(`Trip started: ${delivery.deliveryId} | ${robotId} -> ${delivery.destination.label} ` +
      `(route: ${route.length} points, ${delivery.distanceKm.toFixed(2)} km` +
      `${obstacleAt >= 0 ? ', obstacle expected' : ''})`);
}

async function sendTick(trip, status, progress) {
  const [lat, lng] = trip.route[Math.min(trip.index, trip.route.length - 1)];
  const moving = status === 'En Route' || status === 'Delivering';
  const speed = moving ? round1(trip.displaySpeed + rand(-1.5, 1.5)) : 0;

  if (trip.battery === null) {
    const robots = await api('/api/robots');
    const me = robots.find((r) => r.robotId === trip.robotId);
    trip.battery = me ? me.battery : 80;
  }
  if (moving) trip.battery = Math.max(5, trip.battery - 0.12);

  await api('/api/telemetry', {
    method: 'POST',
    body: JSON.stringify({
      robotId: trip.robotId,
      deliveryId: trip.deliveryId,
      latitude: lat,
      longitude: lng,
      speed,
      battery: round1(trip.battery),
      status,
      progress
    })
  });
}

async function stepTrip(trip) {
  const total = trip.route.length - 1;
  const progress = +((trip.index / total) * 100).toFixed(1);

  // obstacle pause sequence: Obstacle Detected -> Path Clear -> move again
  if (trip.mode === 'obstacle') {
    if (Date.now() >= trip.resumeAt) {
      trip.mode = 'clear';
      trip.resumeAt = Date.now() + 2000;
      await sendTick(trip, 'Path Clear', progress);
      log(`${trip.deliveryId} | ${trip.robotId}: path clear, resuming`);
    } else {
      await sendTick(trip, 'Obstacle Detected', progress);
    }
    return;
  }
  if (trip.mode === 'clear') {
    if (Date.now() >= trip.resumeAt) trip.mode = 'move';
    return;
  }

  // normal movement along the route
  trip.index += 1;
  const p = +((trip.index / total) * 100).toFixed(1);

  if (trip.index >= total) {
    await sendTick(trip, 'Delivered', 100);
    log(`DELIVERED: ${trip.deliveryId} by ${trip.robotId} (battery left: ${round1(trip.battery)}%)`);
    trips.delete(trip.deliveryId);
    return;
  }

  if (trip.obstacleAt === trip.index && trip.mode === 'move') {
    trip.mode = 'obstacle';
    trip.resumeAt = Date.now() + 6000;
    await sendTick(trip, 'Obstacle Detected', p);
    log(`${trip.deliveryId} | ${trip.robotId}: OBSTACLE DETECTED - stopping for 6 s`);
    return;
  }

  if (!trip.arrivalLogged && p >= 94) {
    trip.arrivalLogged = true;
    log(`${trip.deliveryId} | ${trip.robotId}: arriving, handing over package (${p}%)`);
  }
  const status = p >= 94 ? 'Delivering' : 'En Route';
  await sendTick(trip, status, p);
}

// ---------- background behaviour ----------

async function chargeAndIdleRobots() {
  const robots = await api('/api/robots');

  for (const robot of robots) {
    if (!robot.online || robot.currentTask) continue;

    if (robot.status === 'Charging') {
      const battery = Math.min(100, robot.battery + 0.45);
      const status = battery >= 95 ? 'Available' : 'Charging';
      if (battery !== robot.battery || status !== robot.status) {
        await api('/api/telemetry', {
          method: 'POST',
          body: JSON.stringify({
            robotId: robot.robotId,
            latitude: robot.latitude,
            longitude: robot.longitude,
            speed: 0,
            battery: round1(battery),
            status
          })
        });
        if (status === 'Available') log(`${robot.robotId}: fully charged, back to Available`);
      }
    } else if (robot.battery < 25 && robot.status === 'Available') {
      // auto-send very low robots to the charging bay
      await api('/api/telemetry', {
        method: 'POST',
        body: JSON.stringify({
          robotId: robot.robotId,
          latitude: robot.latitude,
          longitude: robot.longitude,
          speed: 0,
          battery: round1(robot.battery),
          status: 'Charging'
        })
      });
      log(`${robot.robotId}: battery low (${Math.round(robot.battery)}%), moved to Charging`);
    }
  }
}

// ---------- main loop ----------

async function tick() {
  try {
    // pick up newly assigned deliveries (also adopts them after a simulator restart)
    const assigned = await api('/api/deliveries?status=Assigned&limit=10');
    for (const d of assigned) {
      if (!trips.has(d.deliveryId)) await startTrip(d);
    }

    // drop local trips whose delivery is gone or already delivered (e.g. DB re-seeded)
    for (const id of [...trips.keys()]) {
      const d = await api(`/api/deliveries/${id}`).catch(() => null);
      if (!d || d.status === 'Delivered') trips.delete(id);
    }

    for (const trip of trips.values()) {
      await stepTrip(trip);
    }

    await chargeAndIdleRobots();
    warnedServerDown = false;
  } catch (err) {
    if (!warnedServerDown) {
      log(`Cannot reach backend at ${API} (${err.message}). Retrying...`);
      warnedServerDown = true;
    }
  }
}

function startSimulator() {
  log(`RoboTrack simulator started -> API: ${API} | tick: ${TICK_MS} ms`);
  setInterval(tick, TICK_MS);
}

// Run standalone: `node simulator/simulator.js` (or npm run simulate).
// When imported from backend/server.js, startSimulator() is called instead
// so a single process can host the API and the fleet simulation together
// (required for hosts that only keep one process alive, e.g. Render free tier).
if (require.main === module) {
  startSimulator();
}

module.exports = { startSimulator };
