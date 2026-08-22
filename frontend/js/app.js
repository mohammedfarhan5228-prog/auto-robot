/* RoboTrack – customer view logic */

const DELIVERY_STEPS = ['Assigned', 'En Route', 'Delivering', 'Delivered'];

const state = {
  location: null,   // { pincode, area, city, latitude, longitude }
  selection: null,  // nearest-robot response
  delivery: null,   // active delivery document
  pollTimer: null,
  finished: false
};

let map;
let destMarker = null;
let robotMarker = null;
let previewLine = null; // dashed line after "Find Nearest Robot"
let planLine = null;    // planned route polyline
let trailLine = null;   // travelled portion
let lastTrailPos = null;

/* ---------- step 1: location ---------- */

async function loadPincodes() {
  try {
    const list = await api('/api/pincodes');
    $('pinList').innerHTML = list.map((p) => `<option value="${p.pincode}">${p.area}</option>`).join('');
    $('pinChips').innerHTML = list.slice(0, 4).map((p) => `<button type="button" class="chip" data-pin="${p.pincode}">${p.pincode} ${p.area}</button>`).join('');
    $('pinChips').querySelectorAll('.chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        $('pinInput').value = chip.dataset.pin;
        locate();
      })
    );
  } catch (_) { /* chips are optional */ }
}

async function locate() {
  const pin = $('pinInput').value.trim();
  const errEl = $('pinError');
  errEl.classList.add('hidden');

  if (!/^\d{6}$/.test(pin)) {
    errEl.textContent = 'Enter a valid 6-digit PIN code.';
    errEl.classList.remove('hidden');
    return;
  }

  $('locateBtn').disabled = true;
  try {
    const loc = await api(`/api/pincodes/${pin}`);
    state.location = loc;
    $('locArea').textContent = `${loc.area}, ${loc.city}`;
    $('locMeta').textContent = `PIN ${loc.pincode}  ·  ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`;
    $('locCard').classList.remove('hidden');

    if (destMarker) destMarker.setLatLng([loc.latitude, loc.longitude]);
    else destMarker = L.marker([loc.latitude, loc.longitude], { icon: destIcon() }).addTo(map);
    destMarker.bindPopup(`<b>Delivery destination</b><br>${loc.area}, ${loc.city}<br>PIN ${loc.pincode}`);

    map.setView([loc.latitude, loc.longitude], 14);

    clearSelection();
    resetMission();

    $('robotCard').classList.remove('disabled');
    $('findBtn').disabled = false;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
    $('locCard').classList.add('hidden');
  } finally {
    if (!state.delivery) $('locateBtn').disabled = false;
  }
}

/* ---------- step 2: nearest robot ---------- */

function clearSelection() {
  state.selection = null;
  $('selBox').classList.add('hidden');
  $('selError').classList.add('hidden');
  $('dispatchCard').classList.add('disabled');
  $('dispatchBtn').disabled = true;
  if (previewLine) { previewLine.remove(); previewLine = null; }
}

async function findNearest() {
  if (!state.location) return;
  clearSelection();
  const btn = $('findBtn');
  btn.disabled = true;
  btn.textContent = 'Checking fleet…';
  try {
    const res = await api('/api/robots/nearest', {
      method: 'POST',
      body: JSON.stringify({ latitude: state.location.latitude, longitude: state.location.longitude })
    });
    state.selection = res;

    $('selId').textContent = res.selected.robotId;
    $('selStatus').innerHTML = badge(res.selected.status);
    $('selBatt').textContent = `${res.selected.battery}%`;
    const bar = $('selBattBar');
    bar.style.width = `${res.selected.battery}%`;
    bar.className = battClass(res.selected.battery);
    $('selDist').textContent = fmtKm(res.selected.distanceKm);
    $('selEta').textContent = `${Math.max(1, Math.round((res.selected.distanceKm / 22) * 60))} min`;
    $('selReason').textContent = res.reason;
    $('selBox').classList.remove('hidden');

    previewLine = L.polyline(
      [[res.selected.latitude, res.selected.longitude], [state.location.latitude, state.location.longitude]],
      { color: '#9ca3af', weight: 2, dashArray: '6 6' }
    ).addTo(map);

    $('dispatchCard').classList.remove('disabled');
    $('dispatchBtn').disabled = false;
  } catch (err) {
    $('selError').textContent = err.message;
    $('selError').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Find Nearest Robot';
  }
}

/* ---------- step 3: dispatch + live tracking ---------- */

async function dispatch() {
  if (!state.location) return;
  const btn = $('dispatchBtn');
  btn.disabled = true;
  btn.textContent = 'Dispatching…';
  try {
    const res = await api('/api/dispatch', {
      method: 'POST',
      body: JSON.stringify({ pincode: state.location.pincode })
    });
    startMission(res.delivery);
  } catch (err) {
    btn.textContent = 'Dispatch Robot';
    btn.disabled = false;
    $('selError').textContent = err.message;
    $('selError').classList.remove('hidden');
  }
}

function startMission(delivery) {
  state.delivery = delivery;
  state.finished = false;

  clearSelection();
  $('locateBtn').disabled = true;
  $('findBtn').disabled = true;
  $('robotCard').classList.add('disabled');
  $('dispatchCard').classList.remove('disabled');
  $('dispatchBtn').disabled = true;
  $('dispatchBtn').textContent = 'Robot on the way';

  $('mission').classList.remove('hidden');
  $('successBox').classList.add('hidden');
  $('newBtn').classList.add('hidden');
  $('obstacleAlert').classList.add('hidden');
  $('mDeliveryId').textContent = delivery.deliveryId;

  if (previewLine) { previewLine.remove(); previewLine = null; }
  if (planLine) planLine.remove();
  if (trailLine) trailLine.remove();
  planLine = L.polyline(delivery.route, { color: '#93c5fd', weight: 3, opacity: 0.8 }).addTo(map);
  trailLine = L.polyline([], { color: '#1d4ed8', weight: 3.5 }).addTo(map);
  lastTrailPos = null;

  map.fitBounds(L.latLngBounds(delivery.route), { padding: [40, 40] });

  updateStepper(delivery.status);
  renderMission(delivery, null);

  if (state.pollTimer) clearInterval(state.pollTimer);
  pollMission();
  state.pollTimer = setInterval(pollMission, 1200);
}

async function pollMission() {
  if (!state.delivery) return;
  try {
    const [delivery, robots] = await Promise.all([
      api(`/api/deliveries/${state.delivery.deliveryId}`),
      api('/api/robots')
    ]);
    state.delivery = delivery;
    const robot = robots.find((r) => r.robotId === delivery.assignedRobot);
    renderMission(delivery, robot);
  } catch (_) { /* transient network hiccup – retry next tick */ }
}

function renderMission(delivery, robot) {
  updateStepper(delivery.status);
  $('mStatus').innerHTML = badge(robot ? robot.status : delivery.status);

  $('progFill').style.width = `${delivery.progress}%`;
  $('progLabel').textContent = `${Math.round(delivery.progress)}% of ${fmtKm(delivery.distanceKm)}`;

  if (robot) {
    $('mBatt').textContent = `${Math.round(robot.battery)}%`;
    $('mSpeed').textContent = `${Math.round(robot.speed)} km/h`;
    moveRobotMarker(robot, ['En Route', 'Delivering'].includes(robot.status));
  }

  $('mDist').textContent = fmtKm(delivery.remainingKm);
  $('mEta').textContent = delivery.status === 'Delivered' ? '0 min' : `${delivery.etaMinutes.toFixed(1)} min`;

  $('obstacleAlert').classList.toggle('hidden', !robot || robot.status !== 'Obstacle Detected');

  if (delivery.status === 'Delivered' && !state.finished) {
    state.finished = true;
    finishMission(delivery);
  }
}

function finishMission(delivery) {
  clearInterval(state.pollTimer);
  state.pollTimer = null;

  const secs = Math.max(1, Math.round((new Date(delivery.deliveredAt) - new Date(delivery.createdAt)) / 1000));
  $('successDetail').textContent =
    `Package delivered to ${delivery.destination.label} by ${delivery.assignedRobot}. Trip time ${secs}s (simulated).`;
  $('successBox').classList.remove('hidden');
  $('newBtn').classList.remove('hidden');
  $('dispatchBtn').textContent = 'Delivered';
  $('obstacleAlert').classList.add('hidden');
  if (robotMarker) robotMarker.setIcon(robotIcon({ robotId: delivery.assignedRobot, status: 'Available' }, false));
}

function updateStepper(status) {
  const idx = DELIVERY_STEPS.indexOf(status);
  document.querySelectorAll('#stepper li').forEach((li, i) => {
    li.classList.toggle('done', i < idx || status === 'Delivered');
    li.classList.toggle('active', i === idx && status !== 'Delivered');
  });
}

/* ---------- map helpers ---------- */

function moveRobotMarker(robot, moving) {
  const pos = [robot.latitude, robot.longitude];
  if (!robotMarker) {
    robotMarker = L.marker(pos, { icon: robotIcon(robot, moving), zIndexOffset: 500 }).addTo(map);
    robotMarker.bindPopup(() => popupHtml(robot));
  } else {
    robotMarker.setLatLng(pos);
    robotMarker.setIcon(robotIcon(robot, moving));
    robotMarker.getPopup()?.setContent(popupHtml(robot));
  }
  if (!lastTrailPos || haversineKm(lastTrailPos[0], lastTrailPos[1], pos[0], pos[1]) > 0.02) {
    trailLine.addLatLng(pos);
    lastTrailPos = pos;
  }
}

function popupHtml(robot) {
  return `<b>${robot.robotId}</b> &mdash; ${robot.status}<br>
    Battery: ${Math.round(robot.battery)}%<br>
    Speed: ${Math.round(robot.speed)} km/h<br>
    Position: ${robot.latitude.toFixed(4)}, ${robot.longitude.toFixed(4)}`;
}

function resetMission() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  state.delivery = null;
  state.finished = false;
  $('mission').classList.add('hidden');
  $('dispatchBtn').textContent = 'Dispatch Robot';
  $('locateBtn').disabled = false;
  if (planLine) { planLine.remove(); planLine = null; }
  if (trailLine) { trailLine.remove(); trailLine = null; }
  if (robotMarker) { robotMarker.remove(); robotMarker = null; }
  lastTrailPos = null;
}

/* restore an in-flight delivery after a page reload */
async function restoreState() {
  try {
    const docs = await api('/api/deliveries?limit=10');
    const active = docs.find((d) => d.status !== 'Delivered');
    if (!active) return;
    $('pinInput').value = active.pincode;
    state.location = {
      pincode: active.pincode,
      area: active.destination.label,
      city: '',
      latitude: active.destination.latitude,
      longitude: active.destination.longitude
    };
    $('locArea').textContent = active.destination.label;
    $('locMeta').textContent = `PIN ${active.pincode}  ·  ${active.destination.latitude.toFixed(4)}, ${active.destination.longitude.toFixed(4)}`;
    $('locCard').classList.remove('hidden');
    destMarker = L.marker([active.destination.latitude, active.destination.longitude], { icon: destIcon() }).addTo(map);
    destMarker.bindPopup(`<b>Delivery destination</b><br>${active.destination.label}`);
    startMission(active);
  } catch (_) { /* nothing to restore */ }
}

/* ---------- init ---------- */

map = initMap('map');
loadPincodes();
restoreState();
pingHealth();
setInterval(pingHealth, 10000);

$('pinForm').addEventListener('submit', (e) => { e.preventDefault(); locate(); });
$('findBtn').addEventListener('click', findNearest);
$('dispatchBtn').addEventListener('click', dispatch);
$('newBtn').addEventListener('click', () => {
  resetMission();
  clearSelection();
  $('robotCard').classList.add('disabled');
  $('findBtn').disabled = true;
  $('pinInput').value = '';
  $('locCard').classList.add('hidden');
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('pinInput').focus();
});
