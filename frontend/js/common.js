/* RoboTrack – shared helpers for both pages */

const $ = (id) => document.getElementById(id);

async function api(pathname, options = {}) {
  const res = await fetch(pathname, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  let data = {};
  try { data = await res.json(); } catch (_) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const STATUS_META = {
  'Available':         { color: '#16a34a', cls: 'st-available' },
  'Assigned':          { color: '#2563eb', cls: 'st-assigned' },
  'En Route':          { color: '#0891b2', cls: 'st-enroute' },
  'Delivering':        { color: '#d97706', cls: 'st-delivering' },
  'Delivered':         { color: '#16a34a', cls: 'st-delivered' },
  'Charging':          { color: '#ca8a04', cls: 'st-charging' },
  'Obstacle Detected': { color: '#dc2626', cls: 'st-obstacle' },
  'Path Clear':        { color: '#0d9488', cls: 'st-pathclear' },
  'Offline':           { color: '#667085', cls: 'st-offline' }
};

function badge(status) {
  const meta = STATUS_META[status] || STATUS_META.Offline;
  return `<span class="badge ${meta.cls}"><i class="bdot"></i>${status}</span>`;
}

function battClass(battery) {
  if (battery <= 25) return 'low';
  if (battery <= 50) return 'warn';
  return '';
}

function fmtKm(km) {
  if (km == null || Number.isNaN(km)) return '-';
  return km >= 1 ? `${km.toFixed(2)} km` : `${Math.max(0, Math.round(km * 1000))} m`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function initMap(elId, center = [12.9716, 77.5946], zoom = 11) {
  const map = L.map(elId);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  map.setView(center, zoom);
  return map;
}

function robotIcon(robot, moving = false) {
  const meta = STATUS_META[robot.status] || STATUS_META.Offline;
  return L.divIcon({
    className: 'robot-jump',
    html: `<div class="mk-robot${moving ? ' moving' : ''}" style="--c:${meta.color}">${robot.robotId}</div>`,
    iconSize: [52, 22],
    iconAnchor: [26, 11]
  });
}

function destIcon() {
  return L.divIcon({
    className: '',
    html: '<div class="mk-dest"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

async function pingHealth() {
  const el = $('apiStatus');
  try {
    await api('/api/health');
    el.className = 'conn ok';
    el.innerHTML = '<span class="dot"></span>API online';
  } catch (_) {
    el.className = 'conn err';
    el.innerHTML = '<span class="dot"></span>API offline';
  }
}
