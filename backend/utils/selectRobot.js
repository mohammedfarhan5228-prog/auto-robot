const Robot = require('../models/Robot');
const { haversineKm } = require('./geo');

// Nearest-robot selection:
//   eligible = status "Available" AND online AND battery > 30
//   winner   = smallest haversine distance to the destination
async function selectNearestRobot(destLat, destLng) {
  const robots = await Robot.find().lean();

  const eligible = (r) => r.online && r.status === 'Available' && r.battery > 30;

  const candidates = robots
    .filter(eligible)
    .map((r) => ({
      ...r,
      distanceKm: +haversineKm(r.latitude, r.longitude, destLat, destLng).toFixed(2)
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const skipped = robots
    .filter((r) => !eligible(r))
    .map((r) => {
      let reason;
      if (!r.online) reason = 'offline';
      else if (r.status !== 'Available') reason = `status is "${r.status}"`;
      else reason = `battery ${Math.round(r.battery)}% (<= 30%)`;
      return { robotId: r.robotId, status: r.status, battery: Math.round(r.battery), reason };
    });

  if (candidates.length === 0) {
    return { selected: null, candidates: [], skipped };
  }

  const best = candidates[0];
  const others = candidates.slice(1).map((c) => c.robotId);
  const reason =
    `${best.robotId} selected - it is the NEAREST available robot (${best.distanceKm} km away), ` +
    `online, with ${Math.round(best.battery)}% battery (> 30% minimum).` +
    (others.length ? ` Other eligible robots: ${others.join(', ')}.` : ' It was the only eligible robot.') +
    (skipped.length ? ` Skipped: ${skipped.map((s) => `${s.robotId} (${s.reason})`).join(', ')}.` : '');

  return { selected: best, candidates, skipped, reason };
}

module.exports = { selectNearestRobot };
