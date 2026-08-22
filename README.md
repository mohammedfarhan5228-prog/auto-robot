# RoboTrack

**IoT-Based Smart Delivery Robot Tracking and Dispatch System** — a full software simulation of an IoT delivery robot fleet, built for demonstration and viva.

> **Accuracy note:** RoboTrack is a *software simulation*. No physical ESP32, GPS module, motors, LiDAR or sensors are connected. The `simulator/` folder plays the role of the robot firmware: in a real deployment, each robot would POST the exact same telemetry to the same REST API. The project demonstrates how the software architecture would work with a real IoT fleet.

---

## 1. What it does

1. Customer enters a delivery PIN code (Bengaluru demo dataset).
2. The PIN is mapped to fixed demo coordinates stored in MongoDB.
3. The location appears on a Leaflet / OpenStreetMap map.
4. The system finds the **nearest eligible robot**: status `Available`, online, battery > 30%.
5. The selection is shown with a plain-language reason (who was skipped and why).
6. On **Dispatch**, a delivery is created (`Assigned`) and the simulator drives the robot along a route on the map.
7. Telemetry (position, speed, battery, status) updates live; delivery moves through
   `Assigned → En Route → Delivering → Delivered`.
8. Random obstacle event per trip: `Obstacle Detected → stops → Path Clear → continues`.
9. Success message when the destination is reached; the robot returns to `Available` (or `Charging` if drained).

Two views:

| Page | URL | Audience |
|---|---|---|
| Customer tracking | `https://auto-robot-pcm9.onrender.com` | enter PIN, dispatch, watch live delivery |
| Fleet dashboard | `https://auto-robot-pcm9.onrender.com/admin` | all robots on map, KPIs, status cards, recent deliveries |

## 2. Tech stack (all free)

- **Frontend:** HTML + CSS + vanilla JS, Leaflet.js, OpenStreetMap tiles
- **Backend:** Node.js + Express
- **Database:** MongoDB Atlas free tier (M0)
- **Simulation:** plain Node.js script (no hardware)

Dependencies are only `express`, `mongoose`, `dotenv`.

## 3. Project structure

```
robotrack/
├── backend/
│   ├── server.js              entry point: connect DB, start HTTP
│   ├── app.js                 Express app: routes + static frontend
│   ├── config/db.js           MongoDB connection (Atlas)
│   ├── models/                Robot, Delivery, Telemetry, Pincode schemas
│   ├── routes/
│   │   ├── pincodes.js        GET  /api/pincodes[/:pin]
│   │   ├── robots.js          GET  /api/robots, POST /api/robots/nearest ...
│   │   ├── deliveries.js      POST /api/dispatch, GET /api/deliveries...
│   │   └── telemetry.js       POST /api/telemetry   (simulator writes here)
│   └── utils/
│       ├── geo.js             haversine distance + route builder
│       └── selectRobot.js     nearest-robot algorithm
├── frontend/
│   ├── index.html             customer view
│   ├── admin.html             admin dashboard
│   ├── css/style.css
│   └── js/                    common.js, app.js, admin.js
├── simulator/simulator.js     "robot firmware": movement, battery, obstacles
├── scripts/e2e-test.js        optional end-to-end smoke test
├── package.json
└── .env                       (you create this)
```

## 4. Setup — exact steps

### Prerequisites
- Node.js 18 or newer (`node --version`)
- A free MongoDB Atlas account
- Internet access for map tiles and Atlas

### Step 1 — Create the MongoDB Atlas database (free)

1. Sign up at <https://www.mongodb.com/cloud/atlas> and create an **M0 Free** cluster.
2. **Database Access** → Add New Database User (username + password, e.g. `robotrack_user`).
3. **Network Access** → Add IP Address → **Allow access from anywhere** `0.0.0.0/0`
   (simplest for a college demo / changing Wi-Fi).
4. **Cluster → Connect → Drivers (Node.js)** → copy the connection string. It looks like:
   ```
   mongodb+srv://robotrack_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Add the database name `/robotrack` after `.mongodb.net`:
   ```
   mongodb+srv://robotrack_user:<password>@cluster0.xxxxx.mongodb.net/robotrack?retryWrites=true&w=majority
   ```

### Step 2 — Configure environment variables

Copy `.env.example` to `.env` and paste your URI:

```env
MONGODB_URI=mongodb+srv://robotrack_user:YourPassword@cluster0.xxxxx.mongodb.net/robotrack?retryWrites=true&w=majority
PORT=3000
API_URL=http://localhost:3000
```

### Step 3 — Install and start

```bash
npm install
npm start
```

Keep this terminal open. First start creates the collections' indexes.
You should see:

```
[RoboTrack] Connected to MongoDB -> database "robotrack"
Customer view : http://localhost:3000
Admin dashboard: http://localhost:3000/admin
```

### Step 4 — Insert the demo data manually

The app does not seed anything by itself — add the rows yourself, either with
**MongoDB Compass** (GUI) or **mongosh**.

<details>
<summary><b>Option A: mongosh (copy-paste)</b></summary>

```bash
mongosh "your-atlas-uri/robotrack"
```

```js
use robotrack

db.pincodes.insertMany([
  { pincode: "560001", area: "MG Road",         city: "Bengaluru", latitude: 12.9756, longitude: 77.6068 },
  { pincode: "560034", area: "Koramangala",     city: "Bengaluru", latitude: 12.9352, longitude: 77.6245 },
  { pincode: "560038", area: "Indiranagar",     city: "Bengaluru", latitude: 12.9784, longitude: 77.6412 },
  { pincode: "560063", area: "Hebbal",          city: "Bengaluru", latitude: 13.0358, longitude: 77.5970 },
  { pincode: "560064", area: "Jakkur",          city: "Bengaluru", latitude: 13.0474, longitude: 77.6192 },
  { pincode: "560065", area: "Thanisandra",     city: "Bengaluru", latitude: 13.0504, longitude: 77.6468 },
  { pincode: "560097", area: "Panathur",        city: "Bengaluru", latitude: 12.9407, longitude: 77.7024 },
  { pincode: "560100", area: "Electronic City", city: "Bengaluru", latitude: 12.8452, longitude: 77.6602 }
])

db.robots.insertMany([
  { robotId: "R-01", status: "Available", battery: 91, latitude: 12.9762, longitude: 77.5993, speed: 0, online: true,  currentTask: null },
  { robotId: "R-02", status: "Available", battery: 84, latitude: 12.9600, longitude: 77.6200, speed: 0, online: true,  currentTask: null },
  { robotId: "R-03", status: "Charging",  battery: 37, latitude: 12.9850, longitude: 77.6100, speed: 0, online: true,  currentTask: null },
  { robotId: "R-04", status: "Available", battery: 68, latitude: 12.9450, longitude: 77.5850, speed: 0, online: true,  currentTask: null },
  { robotId: "R-05", status: "Offline",   battery: 22, latitude: 13.0100, longitude: 77.5550, speed: 0, online: false, currentTask: null }
])
```

</details>

<details>
<summary><b>Option B: MongoDB Compass (GUI)</b></summary>

1. Connect Compass with your Atlas URI.
2. Open the `robotrack` database → create/use collection `pincodes` → **ADD DATA → Insert Document** → paste the array from above (without `db.pincodes.insertMany([...])`, just the `[ ... ]` part) → Insert.
3. Repeat for collection `robots`.

</details>

Why these rows matter for the demo:
- `R-05` is **offline** and `R-03` is **Charging** → they must be skipped by the selection algorithm.
- `deliveries` and `telemetry` collections fill up automatically during use — no manual inserts needed.

### Step 5 — Start the robot simulator (second terminal)

```bash
npm run simulate
```

You will see trip logs (movement, obstacle events, deliveries). Leave it running.

### Step 6 — Use the app

- Customer: <http://localhost:3000>
- Admin: <http://localhost:3000/admin>

### Optional — automated end-to-end test

```bash
npm run test:e2e
```

Runs the whole system against a throwaway in-memory MongoDB (no Atlas needed) and
asserts: nearest-robot choice, dispatch, live telemetry, obstacle handling,
delivery completion, robot release. First run downloads a temporary MongoDB binary (~70 MB).

## 5. Two-minute demo script (viva)

1. Open the **customer page**. Enter `560064` → Locate. Point at the map: destination marker appears (PIN → coordinates from MongoDB).
2. Click **Find Nearest Robot**. Read the reason box aloud: *"R-01 selected — nearest available robot, X km away, Y% battery. Skipped R-03 (Charging), R-05 (offline)…"* This is the core IoT dispatch logic.
3. Click **Dispatch Robot**. Switch to the map: the robot pill starts moving along the blue route; battery/speed/ETA update every second; progress bar advances.
4. If you're lucky the **obstacle event** fires mid-trip: red banner "Obstacle detected", robot stops, then "Path Clear" and it resumes. (35% chance per trip — mention it's random.)
5. Robot reaches the destination → green **Delivered successfully** panel; status stepper completed.
6. Open the **admin dashboard**: all 5 robots on one map, KPI cards, per-robot cards (battery bars, task, online state), recent-deliveries table showing the delivery just completed.
7. In MongoDB Compass, show the `deliveries` and `telemetry` collections filling up live — proof that everything is persisted.

Reset between demos: delete documents from `deliveries` and `telemetry`, and re-run the robots insert query (or just edit battery/status fields back).

## 6. How the system works

```
            PIN + Dispatch                telemetry ticks
 Browser ────────────────► Express API ◄──────────────── Simulator ("firmware")
   ▲                        │    │                          │
   │      poll JSON         │    ▼                          │
   └────────────────────────┘  MongoDB Atlas                 │
        (1.2 s interval)     robots / deliveries /          │
                             pincodes / telemetry ◄─────────┘
```

1. **Dispatch** (`POST /api/dispatch`): resolves the PIN, runs the selection algorithm, *atomically* claims the chosen robot (`findOneAndUpdate` with `status: 'Available'` in the filter — no double-booking), builds a curved route (list of ~100–300 coordinate points) and stores the delivery.
2. **Simulator loop** (every ~900 ms): picks up deliveries with status `Assigned`, walks the robot point-by-point through the route, drains battery, varies speed, triggers the obstacle sequence once per trip, and POSTs everything to `POST /api/telemetry`.
3. **Telemetry endpoint**: updates the robot snapshot, appends a history document, and syncs the linked delivery (progress %, remaining km, ETA, status transitions). On the final tick it marks the delivery `Delivered` and parks the robot (`Available`, or `Charging` if battery < 40%).
4. **Browser pages** poll the API every ~1.2–1.5 s and animate the marker between polls with a CSS transform transition — that's what makes the movement look smooth.

### Nearest-robot algorithm (backend/utils/selectRobot.js)

```
eligible(r) = r.online AND r.status == "Available" AND r.battery > 30
distance    = haversine great-circle distance (km) between robot and destination
answer      = eligible robot with minimum distance
```

Haversine formula gives the straight-line ("great circle") distance between two
latitude/longitude points on a sphere — standard for geo shortlisting. Road
routing would need a paid/complex maps API, which the project deliberately avoids.
The response also lists every skipped robot with its reason, which the UI displays.

### Status model

| Delivery | Robot |
|---|---|
| `Assigned → En Route → Delivering → Delivered` | `Available → Assigned → En Route → Delivering → Available / Charging` (+ transient `Obstacle Detected`, `Path Clear`; seeded `Offline`) |

## 7. Data model (3 + 1 small collections)

**robots**
```json
{ "robotId": "R-01", "status": "Available", "battery": 91,
  "latitude": 12.9762, "longitude": 77.5993,
  "speed": 0, "online": true, "currentTask": null }
```

**deliveries**
```json
{ "deliveryId": "DLV-1001", "pincode": "560064",
  "destination": { "label": "Jakkur, Bengaluru", "latitude": 13.0474, "longitude": 77.6192 },
  "assignedRobot": "R-01", "status": "En Route",
  "etaMinutes": 22.4, "distanceKm": 8.21, "remainingKm": 6.7, "progress": 18.4,
  "route": [[12.9762, 77.5993], [12.9769, 77.6001], "..."] }
```

**telemetry** (one row per tick while moving)
```json
{ "robotId": "R-01", "deliveryId": "DLV-1001",
  "latitude": 12.9811, "longitude": 77.6035,
  "speed": 22.4, "battery": 88.6, "status": "En Route",
  "timestamp": "2026-08-21T16:32:01.112Z" }
```

**pincodes** (demo dataset you inserted manually)
```json
{ "pincode": "560064", "area": "Jakkur", "city": "Bengaluru",
  "latitude": 13.0474, "longitude": 77.6192 }
```

## 8. API reference

| Method & path | Purpose |
|---|---|
| `GET /api/health` | liveness check |
| `GET /api/pincodes` | all demo PIN codes |
| `GET /api/pincodes/:pin` | one demo location |
| `GET /api/robots` | fleet snapshot |
| `POST /api/robots/nearest` `{latitude, longitude}` | run selection without dispatching |
| `POST /api/robots/:id/toggle-online` | admin: take a parked robot offline/online |
| `GET /api/robots/:id/telemetry?limit=100` | telemetry history of one robot |
| `POST /api/dispatch` `{pincode}` | select robot + create delivery |
| `GET /api/deliveries?status=&limit=` | recent deliveries |
| `GET /api/deliveries/:deliveryId` | one delivery (polled by customer page) |
| `POST /api/telemetry` | simulator tick: robot update + history + delivery sync |

## 9. Simulation parameters (simulator/simulator.js)

| Constant | Default | Meaning |
|---|---|---|
| `TICK_MS` env | 900 ms | one simulation tick |
| `OBSTACLE_CHANCE` | 0.35 | probability a trip hits one obstacle event |
| obstacle pause | 6 s + 2 s | stop, then "Path Clear" before resuming |
| battery drain | 0.12%/tick | only while driving |
| charging rate | 0.45%/tick | robots with status `Charging`; auto-Available at ≥95% |
| display speed | 19–26 km/h | cosmetic value shown on dashboards |

Trips are time-compressed so a typical delivery finishes in roughly 40–120 real seconds regardless of map distance — long enough to narrate, short enough to stay inside a demo slot.

## 10. Mapping the simulation to real IoT hardware

| Simulated part | Real-world equivalent |
|---|---|
| `simulator/simulator.js` tick loop | ESP32 firmware control loop |
| route waypoints | GPS waypoint navigation / path planner output |
| `POST /api/telemetry` over HTTP | same call over Wi-Fi/4G (or MQTT broker → bridge) |
| battery field | voltage divider / fuel-gauge IC reading |
| obstacle event | ultrasonic sensor / IR proximity interrupt |
| online flag | heartbeat / MQTT last-will |

Because the firmware contract is a single REST endpoint, replacing the simulator with real hardware requires **no changes** to the backend, database, or UI.

## 11. Troubleshooting

| Symptom | Fix |
|---|---|
| `MongoServerSelectionError` on start | Atlas → Network Access → allow `0.0.0.0/0`; check password in URI; cluster not paused |
| Map tiles grey | internet needed for OpenStreetMap tiles; everything else runs locally |
| "No robot is currently eligible" | all robots busy/low/offline — wait for delivery to finish or re-insert robots data |
| Port 3000 in use | change `PORT` in `.env` |
| Robot not moving | second terminal running? `npm run simulate` must stay open |
| Want a clean slate | clear `deliveries` + `telemetry`, re-run the robots insert query |

## 12. Quick viva answers

- **Is real hardware used?** No — pure software simulation; the simulator mimics robot firmware against the same API a real robot would call.
- **Why MongoDB?** Flexible schema for evolving telemetry, free Atlas tier, JSON fits IoT payloads natively.
- **Why polling instead of WebSockets?** Simplest reliable approach for a demo; 1.2 s polling with CSS interpolation looks smooth and has zero extra dependencies.
- **How is "nearest" computed?** Haversine great-circle distance over the eligible set (Available + online + >30% battery); O(n) scan, n = fleet size.
- **What prevents two users grabbing the same robot?** The claim is a single atomic `findOneAndUpdate` filtered on `status: 'Available'`.
- **Where does the PIN→location mapping come from?** A small predefined `pincodes` collection in MongoDB — no paid geocoding API.
