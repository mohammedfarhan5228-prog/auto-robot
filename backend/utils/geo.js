const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function interpolate([lat1, lng1], [lat2, lng2], f) {
  return [lat1 + (lat2 - lat1) * f, lng1 + (lng2 - lng1) * f];
}

// Builds a slightly curved route (S-shape) from start to end, then densifies it
// into small steps so the simulator can walk it point by point.
function buildRoute(startLatLng, endLatLng) {
  const straightKm = haversineKm(startLatLng[0], startLatLng[1], endLatLng[0], endLatLng[1]);

  const mid1 = interpolate(startLatLng, endLatLng, 0.35);
  const mid2 = interpolate(startLatLng, endLatLng, 0.7);

  // perpendicular offset for a gentle curve
  const dx = endLatLng[1] - startLatLng[1];
  const dy = endLatLng[0] - startLatLng[0];
  const len = Math.hypot(dx, dy) || 1e-9;
  const nx = -dy / len;
  const ny = dx / len;
  const off = straightKm * 0.006; // degrees offset scaled by distance

  const waypoints = [
    startLatLng,
    [mid1[0] + ny * off, mid1[1] + nx * off],
    [mid2[0] - ny * off, mid2[1] - nx * off],
    endLatLng
  ];

  // densify: one point roughly every 60-140 m depending on trip length
  const stepKm = Math.min(0.14, Math.max(0.05, straightKm / 110));
  const dense = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const segKm = haversineKm(a[0], a[1], b[0], b[1]);
    const steps = Math.max(1, Math.round(segKm / stepKm));
    for (let s = 0; s < steps; s++) {
      dense.push(interpolate(a, b, s / steps));
    }
  }
  dense.push(endLatLng);

  return { route: dense, distanceKm: +straightKm.toFixed(3) };
}

module.exports = { haversineKm, buildRoute };
