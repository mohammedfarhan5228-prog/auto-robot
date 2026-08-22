/* RoboTrack – admin fleet dashboard logic */

let map;
const markers = {};       // robotId -> L.Marker
const lastStatus = {};    // robotId -> status (to avoid needless setIcon calls)
let destMarker = null;
let planLine = null;
let fittedFor = null;     // deliveryId the map was fitted to

function fmtTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/* ---------- KPI strip ---------- */

function renderKpis(robots) {
  const online = robots.filter((r) => r.online);
  const avail = robots.filter((r) => r.status === 'Available' && r.online);
  const busy = robots.filter((r) => ['Assigned', 'En Route', 'Delivering'].includes(r.status));
  const avg = robots.length
    ? Math.round(robots.reduce((s, r) => s + r.battery, 0) / robots.length)
    : 0;

  $('kTotal').textContent = robots.length;
  $('kOnline').textContent = `${online.length} online`;
  $('kAvail').textContent = avail.length;
  $('kBusy').textContent = busy.length;
  $('kBatt').textContent = `${avg}%`;
}

/* ---------- fleet cards ---------- */

function taskText(robot, activeDelivery) {
  if (robot.currentTask && activeDelivery && activeDelivery.deliveryId === robot.currentTask) {
    return `Task ${activeDelivery.deliveryId} &rarr; ${activeDelivery.destination.label}`;
  }
  if (robot.currentTask) return `Task ${robot.currentTask}`;
  if (robot.status === 'Charging') return 'At charging bay';
  if (!robot.online) return '<em>No link</em>';
  return '<em>Idle</em>';
}

function renderFleet(robots, activeDelivery) {
  $('fleetList').innerHTML = robots
    .map(
      (r) => `
      <div class="rcard">
        <div class="rcard-top">
          <span class="online-dot ${r.online ? 'on' : ''}" title="${r.online ? 'Online' : 'Offline'}"></span>
          <span class="rid">${r.robotId}</span>
          ${badge(r.status)}
        </div>
        <label>Battery ${Math.round(r.battery)}%</label>
        <div class="bar"><i class="${battClass(r.battery)}" style="width:${Math.round(r.battery)}%"></i></div>
        <div class="rcard-meta">
          <span>${Math.round(r.speed)} km/h</span>
          <span>${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}</span>
        </div>
        <div class="rcard-task">${taskText(r, activeDelivery)}</div>
      </div>`
    )
    .join('');

  $('activeLine').innerHTML = activeDelivery
    ? `Active: <b>${activeDelivery.deliveryId}</b> &middot; ${activeDelivery.assignedRobot} &rarr; ${activeDelivery.destination.label} (${activeDelivery.status})`
    : 'No active delivery.';
}

/* ---------- map ---------- */

function popupHtml(r) {
  return `<b>${r.robotId}</b> &mdash; ${r.status}<br>
    Battery: ${Math.round(r.battery)}%<br>
    Speed: ${Math.round(r.speed)} km/h<br>
    Online: ${r.online ? 'yes' : 'no'}<br>
    Task: ${r.currentTask || 'none'}`;
}

function renderMap(robots, activeDelivery) {
  for (const r of robots) {
    const pos = [r.latitude, r.longitude];
    const moving = ['En Route', 'Delivering'].includes(r.status);
    if (!markers[r.robotId]) {
      markers[r.robotId] = L.marker(pos, { icon: robotIcon(r, moving), zIndexOffset: 500 })
        .addTo(map)
        .bindPopup(popupHtml(r));
    } else {
      markers[r.robotId].setLatLng(pos);
      if (lastStatus[r.robotId] !== r.status || markers[r.robotId]._moving !== moving) {
        markers[r.robotId].setIcon(robotIcon(r, moving));
        markers[r.robotId]._moving = moving;
      }
      markers[r.robotId].getPopup()?.setContent(popupHtml(r));
    }
    lastStatus[r.robotId] = r.status;
  }

  if (activeDelivery) {
    const dest = [activeDelivery.destination.latitude, activeDelivery.destination.longitude];
    if (!destMarker) {
      destMarker = L.marker(dest, { icon: destIcon() }).addTo(map);
      destMarker.bindPopup(`<b>Destination</b><br>${activeDelivery.destination.label}`);
    } else {
      destMarker.setLatLng(dest);
    }
    if (!planLine) planLine = L.polyline(activeDelivery.route, { color: '#93c5fd', weight: 3, opacity: 0.8 }).addTo(map);
    else planLine.setLatLngs(activeDelivery.route);

    if (fittedFor !== activeDelivery.deliveryId) {
      fittedFor = activeDelivery.deliveryId;
      map.fitBounds(L.latLngBounds(activeDelivery.route), { padding: [40, 40] });
    }
  } else if (destMarker) {
    destMarker.remove(); destMarker = null;
    if (planLine) { planLine.remove(); planLine = null; }
    fittedFor = null;
  }
}

/* ---------- deliveries table ---------- */

function renderTable(deliveries) {
  if (!deliveries.length) {
    $('delBody').innerHTML = '<tr><td colspan="8" class="empty">No deliveries yet. Dispatch one from the customer page.</td></tr>';
    return;
  }
  $('delBody').innerHTML = deliveries
    .map(
      (d) => `
      <tr>
        <td class="num"><b>${d.deliveryId}</b></td>
        <td class="num">${d.pincode}</td>
        <td>${d.destination.label}</td>
        <td><b>${d.assignedRobot}</b></td>
        <td>${badge(d.status)}</td>
        <td class="num">${Math.round(d.progress)}%</td>
        <td class="num">${d.status === 'Delivered' ? '-' : d.etaMinutes.toFixed(1) + ' min'}</td>
        <td class="num">${fmtTime(d.createdAt)}</td>
      </tr>`
    )
    .join('');
}

/* ---------- polling ---------- */

async function poll() {
  try {
    const [robots, deliveries] = await Promise.all([
      api('/api/robots'),
      api('/api/deliveries?limit=8')
    ]);
    const active = deliveries.find((d) => d.status !== 'Delivered') || null;
    renderKpis(robots);
    renderFleet(robots, active);
    renderMap(robots, active);
    renderTable(deliveries);
  } catch (_) { /* backend briefly unreachable – retry next tick */ }
}

map = initMap('map');
poll();
setInterval(poll, 1500);
pingHealth();
setInterval(pingHealth, 10000);
