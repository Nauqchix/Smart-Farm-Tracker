# YOLO Farm — Smart-Farm IoT Dashboard

End-to-end IoT system for monitoring a small greenhouse: an **ESP32** publishes
sensor readings to an **MQTT broker**, a **Next.js** backend persists telemetry
to **PostgreSQL** and pushes live data to the dashboard via **Server-Sent
Events**, and the operator can toggle a **heater** and a **buzzer** from the UI
which travels back through MQTT to the firmware.

---

## 1. System architecture

```
┌──────────┐        MQTT publish          ┌─────────────┐
│  ESP32   │ ─── yolofarm/sensor/all ──►  │  Mosquitto  │
│ firmware │                              │   broker    │
│          │ ◄── yolofarm/control/heater ─┤   :1883     │
│          │ ◄── yolofarm/control/buzzer ─┤             │
└──────────┘                              └──────┬──────┘
   sensor reads                                  │
   (every ~2 s)                                  │ subscribe
                                                 ▼
                                       ┌──────────────────────┐
                                       │  Next.js backend     │
                                       │  (Node 20 +          │
                                       │  src/lib/mqtt/*)     │
                                       │                      │
                                       │  • Telemetry → DB    │
                                       │  • Notification → DB │
                                       │  • In-memory cache   │
                                       │  • SSE pub-sub       │
                                       └──┬─────────┬─────────┘
                              REST: /api/...      SSE: /api/dashboard/stream
                                       │             │
                                       ▼             ▼
                                ┌─────────────────────────┐
                                │  Next.js dashboard      │
                                │  (React 19 + recharts)  │
                                └─────────────────────────┘
                                       │            ▲
                                       │ POST       │ EventSource
                                       │ /api/      │
                                       │ actuators/ │
                                       │ {id}/      │
                                       │ toggle     │
                                       ▼            │
                                  user click ───────┘
```

**Live-update flow**: the moment Mosquitto delivers `yolofarm/sensor/all` to
the backend, `processSensorData` writes a Telemetry row, updates an in-memory
cache (`_latestSensorSnapshot`), and broadcasts the snapshot to every connected
SSE client — so gauges and charts update within ~50 ms of the ESP32 publishing.

**Reload flow**: the SSE endpoint replays the cached last snapshot on connect,
so a hard refresh sees real values immediately, before the next ESP32 message.

**Control flow**: the toggle button POSTs to `/api/actuators/{id}/toggle`
which (a) updates `Actuator.currentState` (or `mode` for the buzzer) in the DB,
(b) publishes `ON`/`OFF`/`AUTO` to the matching control topic, (c) returns the
backend-confirmed state. The button's UI updates from the *response*, not from
the click — so the button never lies about hardware state.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Firmware | C++ on ESP32 (PlatformIO, Arduino framework, FreeRTOS, PubSubClient, DHT, BH1750) |
| Broker | Mosquitto 2.x |
| Backend | Next.js 16 (App Router), Node 20, mqtt 5, Prisma 7, `@prisma/adapter-pg` |
| Database | PostgreSQL on Supabase |
| Frontend | React 19, Tailwind v4, recharts, lucide-react |
| Auth | JWT in HttpOnly cookie |

---

## 3. Folder structure

```
smart-farm/
├── docker-compose.yml          # mqtt + gateway + app
├── Dockerfile                  # Next.js production image
├── Dockerfile.gateway          # passive MQTT logger
├── README.md                   # ← you are here
├── prisma/
│   ├── schema.prisma           # User, Sensor, Telemetry, Actuator, Notification…
│   ├── migrations/             # 4 migrations
│   └── seed.ts                 # idempotent seed (sensor #1, heater, buzzer)
├── prisma.config.ts            # Prisma 7 config (with seed command)
├── firmware/
│   ├── platformio.ini          # ESP32 board: nodemcu-32s
│   ├── include/
│   │   ├── config.h            # WiFi / broker IP / port
│   │   └── config.h.example    # template
│   └── src/main.cpp            # FreeRTOS sensor + mqtt tasks
├── gateway/
│   ├── mqtt_bridge.py          # passive logger (no external services)
│   └── requirements.txt
└── src/                        # Next.js source
    ├── app/
    │   ├── api/
    │   │   ├── auth/login/                   POST  – set token cookie
    │   │   ├── dashboard/                    GET   – aggregate snapshot for first paint
    │   │   ├── dashboard/stream/             GET   – SSE live updates
    │   │   ├── actuators/[id]/toggle/        POST  – DB update + MQTT publish
    │   │   ├── actuators/runtime/            GET   – buzzer real state
    │   │   └── notifications/                GET   – active threshold notifications
    │   ├── dashboard/page.tsx               main UI
    │   ├── login/page.tsx
    │   └── signup/page.tsx
    ├── lib/
    │   ├── mqtt/
    │   │   ├── client.ts        broker connect, publishMqtt
    │   │   ├── init.ts          one-shot global init (instrumentation.ts)
    │   │   └── sensorDataHandler.ts   subscribe → DB → in-memory cache → SSE pub-sub
    │   ├── auth.ts              cookie/bearer extraction, requireAuth
    │   ├── prisma.ts            shared PrismaClient
    │   └── …
    ├── components/             CircularGauge, DataVisualization, SystemStatus, TopNav…
    ├── db/                     Prisma controllers + models
    └── instrumentation.ts      registers MQTT init on Node startup
```

---

## 4. Hardware

| Item | Notes |
|---|---|
| ESP32 NodeMCU-32S | or any ESP32 dev board with the same pinout |
| DHT11 | temperature + humidity |
| BH1750 | ambient light sensor (I²C) |
| Capacitive soil moisture sensor | analog |
| 5 V relay module | switches a heating lamp / fan |
| Active buzzer 5 V | wet-soil alarm |
| Wires, breadboard, 5 V supply for the relay coil | |

### Pin mapping (`firmware/src/main.cpp`)

| Pin | Role | Notes |
|---:|---|---|
| GPIO 5  | DHT data | one-wire |
| GPIO 21 | I²C SDA  | shared with BH1750 |
| GPIO 22 | I²C SCL  | shared with BH1750 |
| GPIO 36 | Soil moisture analog (`SOIL_MOISTURE_PIN`) | ADC1_CH0, input-only |
| GPIO 18 | Buzzer (`BUZZER_PIN`) | output |
| GPIO 23 | Heater relay (`HEATER_PIN`) | output |

> Do not change these without also updating `main.cpp` — the project's seed,
> backend, and dashboard assume them.

---

## 5. MQTT topics

| Direction | Topic | Payload | Producer | Consumer |
|---|---|---|---|---|
| Telemetry | `yolofarm/sensor/all` | `{humidity, temperature, light, soil_moisture, mode, buzzer, heater}` (JSON) | ESP32 | backend |
| Echo (debug) | `yolofarm/sensor/1/processed` | `{...,buzzerMode,buzzerState,telemetryId,timestamp,status}` | backend | optional logger |
| Heater command | `yolofarm/control/heater` | `"ON"` \| `"OFF"` (raw string) | backend | ESP32 |
| Buzzer mode | `yolofarm/control/buzzer` | `"AUTO"` \| `"OFF"` \| `"ON"` (raw string) | backend | ESP32 |

The firmware retains its own buzzer threshold logic (AUTO mode triggers when
soil < `soil_threshold_low`). Backend just forwards the user's mode choice.

---

## 6. Environment variables

`.env` at the project root (committed-style template, real secrets in your local file):

```env
DATABASE_URL="postgresql://...:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...:5432/postgres"
JWT_SECRET="long-random-string"

GMAIL_USER="..."
GMAIL_APP_PASSWORD="..."

MQTT_BROKER_URL="mqtt://localhost:1883"
MQTT_MOCK_MODE="false"             # set "true" only for offline UI dev
```

`firmware/include/config.h` (gitignored — copy from `config.h.example`):

```cpp
#define WIFI_SSID     "your-ssid"
#define WIFI_PASSWORD "your-pass"
#define MQTT_BROKER   "192.168.1.14"   // your laptop's LAN IPv4 (run `ipconfig`)
#define MQTT_PORT     1883
```

`gateway/.env` (optional, only if you run the passive logger):

```env
MQTT_BROKER=localhost
MQTT_PORT=1883
```

---

## 7. Setup

### 7.1 First-time install

```bash
git clone <this-repo>
cd smart-farm
npm install                     # installs Prisma 7, Next 16, mqtt 5, recharts…
npx prisma generate
npx prisma migrate deploy       # applies all migrations
npx prisma db seed              # creates sensor #1, heater, buzzer (idempotent)
```

### 7.2 Start the broker

**Native Mosquitto on Windows** (recommended for dev — already a Windows
service after `winget install EclipseFoundation.Mosquitto`):

```powershell
sc query mosquitto              # should show "RUNNING"
# tail traffic in another terminal:
& "C:\Program Files\Mosquitto\mosquitto_sub.exe" -h 192.168.1.14 -p 1883 -t "yolofarm/#" -v
```

**Or with Docker** (use this if you don't want a system service):

```bash
docker compose up -d mqtt
```

Don't run both at once — they'll fight for port 1883.

### 7.3 Start the backend + frontend

The Next.js app runs both. Pick the LAN IP that matches `MQTT_BROKER_URL`:

```bash
npm run dev                      # http://localhost:3000
```

Watch the log; you should see, in order:
```
[MQTT] Initializing...
✓ MQTT connected
✓ Subscribed to yolofarm/sensor/all
[SensorHandler] Subscribed to sensor data
✓ Ready in xxxms
```

### 7.4 Build & flash the ESP32

```bash
cd firmware
pio run                          # build only
pio run -t upload                # flash over USB
pio device monitor -b 115200     # serial monitor (Ctrl+C to exit)
```

You should see:
```
Connecting to <WIFI_SSID>...
WiFi connected
IP address: 192.168.1.x
Attempting MQTT connection... connected
Subscribed: buzzer + heater control topics
Published JSON: {"humidity":67.30, ...}
```

---

## 8. End-to-end test

1. **Broker reachability** from PC:
   ```bash
   mosquitto_pub -h 192.168.1.14 -p 1883 -t yolofarm/test -m hello
   mosquitto_sub -h 192.168.1.14 -p 1883 -t yolofarm/test -C 1
   ```
2. **Backend ingest**: open `pio device monitor` and the dashboard side by
   side. Every ESP32 publish (`Published JSON: ...`) should be followed in
   the backend log with `[SensorHandler] ✓ Telemetry saved (id=...)`.
3. **Live dashboard**: log in → `/dashboard`. Humidity / Temperature /
   Soil / Light gauges update within ~50 ms of every ESP32 publish.
   Charts append a point per publish (capped at the last 50).
4. **Heater control**: click the Heater toggle. Browser network panel
   shows `POST /api/actuators/3/toggle` → `200 {"actuator":{"currentState":"ON"}}`.
   Backend log: `📤 Published to yolofarm/control/heater: ON`. Serial monitor:
   `Heater ON`. Relay clicks. Within ~2 s the next ESP32 publish carries
   `"heater":"ON"` and the dashboard's *Devices Online* stat ticks up.
5. **Buzzer mode**: click Buzzer. UI flips OFF↔AUTO. Backend publishes
   `"AUTO"` / `"OFF"`. ESP32 prints `Buzzer returned to AUTO mode`. Drop a
   damp cloth off the soil sensor — buzzer fires when value crosses the
   firmware threshold.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| ESP32 serial: `MQTT failed rc=-2`, `errno 104 Connection reset by peer` | Wrong broker IP in `firmware/include/config.h`, or two brokers fighting for port 1883 | Run `ipconfig`, copy the Wi-Fi adapter's IPv4 into `MQTT_BROKER`. Check `netstat -ano | findstr :1883` — should be one PID only. Stop Docker mosquitto if you use the native service: `docker stop mosquitto`. |
| ESP32 serial: `MQTT failed rc=-4` (timeout) | Broker not running, or firewall blocks 1883 | `sc query mosquitto`. Allow inbound TCP/1883 in Windows Defender Firewall. |
| Browser console: `Failed to fetch dashboard data (HTTP 401)` | JWT cookie expired (24 h) or never set | Re-login at `/login`. Page now self-heals on 401 by redirecting to `/login`. |
| Browser console: `Failed to fetch dashboard data (HTTP 500)` | Supabase pooler timed out / connection limit hit | Reload — the route now degrades gracefully and returns safe defaults instead of 500. If it persists, check Supabase status, or switch `DATABASE_URL` from `:6543?pgbouncer=true` to `:5432` (direct). |
| Dashboard charts stuck at one value | SSE didn't connect (CORS, devtools blocking, broken proxy) | Open devtools → Network → filter EventStream. You should see `/api/dashboard/stream` with status `200` and a flowing list of `snapshot` events. |
| Dashboard buttons "jump" between ON/OFF | (Already fixed.) Was caused by SSE overwriting the user's toggle. UI now treats the toggle response as authoritative for heater / buzzer mode. |
| Rapid double-click toggles backend twice | (Already fixed.) Each card has a `useRef` synchronous in-flight guard; a second click is rejected before the first request finishes. |
| Heater relay clicks but lamp does not light | Relay is rated for the right voltage but lamp is plugged into a dead socket / open switch / blown bulb / wrong NC vs NO terminal | Test with a multimeter on the relay output. Most relay modules switch through `COM`+`NO`; wire the lamp through those. Check the bulb separately. |
| `npx prisma db seed` says "No seed command configured" | Prisma 7 reads `prisma.config.ts#migrations.seed`, ignoring the legacy `package.json#prisma.seed` | Already configured. Run again. |
| Wrong API URL after deploy | Frontend uses **relative** URLs (`/api/...`) — same-origin only | If you deploy backend and frontend on different domains, set `NEXT_PUBLIC_API_URL` and prepend it in `apiClient.ts` (currently relative, fine for same-origin Next.js). |
| Serial port `pio` can't find ESP32 | USB driver missing, wrong COM, board in bootloader | Install Silicon Labs CP210x VCP driver. Hold BOOT, tap EN. `pio device list` to confirm port. |
| Dashboard real-time but stats stuck | Stats refresh every 30 s via the slow `/api/dashboard` cycle | That's by design — SSE is for live values, REST is for aggregates. Wait one cycle. |

---

## 10. Development workflow

- **Backend changes**: Turbopack hot-reloads on save. The MQTT subscriber and
  in-memory cache survive HMR thanks to `globalThis._mqttClientInstance` and
  `globalThis._latestSensorSnapshot`. If you ever see "MQTT not connected"
  warnings, restart `npm run dev`.
- **Schema changes**: edit `prisma/schema.prisma` →
  `npx prisma migrate dev --name <slug>` (creates + applies migration) →
  `npx prisma generate` (Prisma will do this for you).
- **Firmware changes**: edit `firmware/src/main.cpp` →
  `pio run -t upload` → `pio device monitor`. The pin `#define`s at the top
  of `main.cpp` are load-bearing — see §4.
- **Type check**: `npx tsc --noEmit` (the unused `src/components/ui/*` Figma
  shadcn export has pre-existing missing-radix-ui errors; ignore those — they
  aren't on the dashboard's import path).
- **Watch broker traffic** while debugging:
  ```bash
  mosquitto_sub -h 192.168.1.14 -p 1883 -t "yolofarm/#" -v
  ```

---

## 11. Debug checklist (when something looks wrong)

1. ☐ `sc query mosquitto` shows `RUNNING`.
2. ☐ `netstat -ano | findstr :1883` shows exactly **one** LISTEN row.
3. ☐ `mosquitto_pub`/`mosquitto_sub` round-trip works on `192.168.1.14:1883`.
4. ☐ ESP32 serial log shows `Attempting MQTT connection... connected` and
   periodic `Published JSON: {...}` lines.
5. ☐ Backend log shows `📨 Received from yolofarm/sensor/all` and
   `[SensorHandler] ✓ Telemetry saved`.
6. ☐ Browser devtools → Network → EventStream → `/api/dashboard/stream`
   has status 200 and flowing `snapshot` events.
7. ☐ Database has fresh rows: `SELECT * FROM "Telemetry" ORDER BY id DESC LIMIT 5;`.
8. ☐ Dashboard humidity/temp gauges visibly update within ~5 s of the ESP32.
9. ☐ Toggling heater shows `📤 Published to yolofarm/control/heater: ON|OFF`
   in backend log and matching action on the relay.

---

## 12. Production / Docker

```bash
docker compose up --build
# brings up: mqtt (Mosquitto), gateway (passive logger), app (Next.js)
# app reaches mqtt at mqtt://mqtt:1883 inside the docker network.
```

Set `DATABASE_URL` and `JWT_SECRET` in your shell or a `.env` next to
`docker-compose.yml` before starting.

---

## License

Proprietary — All rights reserved.
