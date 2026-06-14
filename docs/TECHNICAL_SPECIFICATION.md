# Technical Specification

> Project: **YOLO Farm — Smart-Farm IoT Dashboard**
> Repository name (`package.json`): `yolo-farm` (v0.1.0)
> Document scope: end-to-end system specification grounded in the actual source
> code — hardware → firmware → MQTT/realtime pipeline → backend → database →
> frontend → AI plant-disease diagnosis.

---

## 1. Project Overview

### 1.1 What the project does

YOLO Farm is a small-scale **smart-farm / greenhouse monitoring and control
system**. A single ESP32 sensor node measures the air, soil, and light
environment around a plant, publishes the readings every 5 seconds to an MQTT
broker, and a Next.js web application persists the data, exposes a live
dashboard, and lets the operator remotely control two actuators (a heater and
a buzzer). A separate Python AI service performs plant-disease diagnosis from
uploaded leaf photos via a PyTorch CNN model.

### 1.2 Main goals

1. **Monitor**: collect temperature, humidity, soil moisture, and light
   intensity from a real ESP32 + sensor stack and visualize them in real time.
2. **Control**: let the operator switch a heater ON/OFF and put the buzzer in
   AUTO/OFF mode (firmware itself decides ON/OFF when in AUTO based on a soil
   moisture threshold).
3. **Alert**: raise threshold-based notifications (soil moisture too low,
   temperature too high, etc.) and surface them in the UI.
4. **Diagnose**: classify leaf photos against 38 plant/disease classes and
   return a treatment suggestion.
5. **Persist**: store every sensor reading as a Telemetry row in PostgreSQL so
   trends can be plotted across reloads.

### 1.3 Main users / features

The schema only models a single `User.role` field with a default of `"viewer"`
and the API check uses the role list `['admin', 'viewer', 'operator']`
inconsistently across endpoints (see §10), so the role model is best
described as **single operator / viewer**:

- **Viewer / Operator** (default role `viewer` in `prisma/seed.ts`):
  - Sign up, verify email, sign in (`/login`, `/signup`,
    `/forgot-password`, `/reset-password`).
  - View the live dashboard (`/dashboard`) — gauges, charts, system status,
    notifications, current actuator state.
  - Toggle the heater (ON/OFF) and the buzzer (AUTO/OFF).
  - Upload a plant photo and get an AI diagnosis (`/diagnose`).
- **Admin** (role string `"admin"`): can create / delete sensors and
  actuators (`POST /api/sensors`, `DELETE /api/actuators/{id}`).

> No separate user-management UI is implemented — admin-level role can only be
> set directly in the database. (`src/db/controllers/userController.ts` always
> assigns `"viewer"` on signup.)

---

## 2. System Architecture

### 2.1 End-to-end flow

```
ESP32 + sensors + actuators
    ▲   │
    │   │ DHT11 / BH1750 / soil ADC reads (5 s tick)
    │   ▼
firmware  (FreeRTOS sensorTask + mqttTask)
    │   ▲
    │   │  publish  yolofarm/sensor/all      (retained, JSON)
    │   │  subscribe yolofarm/control/buzzer (AUTO|OFF|ON)
    │   │  subscribe yolofarm/control/heater (ON|OFF)
    │   ▼
Mosquitto MQTT broker  (Docker, eclipse-mosquitto:latest, :1883)
    │   ▲
    │   │ subscribe yolofarm/sensor/all
    │   │ publish    yolofarm/control/{role}
    │   ▼
Next.js backend  (Node 20, App Router, mqtt 5)
    │   ├── src/lib/mqtt/client.ts            broker client + pub-sub
    │   ├── src/lib/mqtt/sensorDataHandler.ts process payload, write DB,
    │   │                                     update in-memory snapshot,
    │   │                                     fan out to SSE subscribers
    │   ├── src/app/api/dashboard/route.ts    initial snapshot (REST)
    │   ├── src/app/api/dashboard/stream/...  live snapshot (SSE)
    │   ├── src/app/api/actuators/[id]/toggle PATCH-style POST: DB + MQTT
    │   └── src/app/api/plant-diagnose/...    proxy to FastAPI
    │
    │ Prisma 7 (PostgreSQL via Supabase)
    ▼
PostgreSQL  (User, Sensor, Telemetry, Actuator, Notification,
             Frame, AiDetection, Alert, AlertTrigger, …)

Frontend dashboard  (React 19, Next.js client component)
    ├── /dashboard  : initial fetch /api/dashboard, then SSE /api/dashboard/stream
    ├── /diagnose   : POST /api/plant-diagnose → proxied to AI service
    └── /login, /signup, /forgot-password, /reset-password

AI diagnosis  (Python 3.11, FastAPI, PyTorch CNN, :8001/predict)
    ├── plant_disease/inference_api.py
    └── plant_disease/plant_disease_98.pth   (trained weights)
```

### 2.2 Components and ports

| Component        | Tech                                  | Default port | Source                                |
| ---------------- | ------------------------------------- | ------------ | ------------------------------------- |
| ESP32 firmware   | C++/Arduino on `nodemcu-32s`          | —            | `firmware/src/main.cpp`               |
| MQTT broker      | Mosquitto 2.x                         | 1883 (ws 9001) | `docker-compose.yml`                |
| MQTT logger      | Python paho-mqtt                      | —            | `gateway/mqtt_bridge.py`              |
| Web app          | Next.js 16, React 19, Node 20         | 3000         | `src/`, `Dockerfile`                  |
| Database         | PostgreSQL (Supabase pooler)          | 6543/5432    | `.env`, `src/lib/prisma.ts`           |
| AI service       | FastAPI + PyTorch                     | 8001         | `plant_disease/inference_api.py`      |

### 2.3 Live-update strategy (verified in code)

- ESP32 publishes once per ~5 s (`xFrequency = pdMS_TO_TICKS(5000)`) with the
  retained flag set (`client.publish(SENSOR_JSON_TOPIC, ..., true)`).
- Backend subscribes once at startup via Next's `instrumentation.ts` →
  `initializeMqtt()` (`src/instrumentation.ts`, `src/lib/mqtt/init.ts`).
- On each MQTT message `processSensorData` writes a `Telemetry` row, syncs
  `Notification` rows, updates the in-memory snapshot
  (`globalThis._latestSensorSnapshot`), and broadcasts to every SSE subscriber.
- The dashboard receives the push over `/api/dashboard/stream`; the initial
  page load also sees the latest values immediately because the SSE handler
  replays the cached snapshot on connect.

---

## 3. Hardware Layer

### 3.1 Components

| Component               | Model / Type    | Purpose                                              |
| ----------------------- | --------------- | ---------------------------------------------------- |
| MCU                     | ESP32 (nodemcu-32s board, per `firmware/platformio.ini`) | WiFi + MQTT + sensor/actuator I/O |
| Air temp + humidity     | DHT11 (`DHT_TYPE DHT11` in `main.cpp:13`) | Reads ambient °C and % RH        |
| Light                   | BH1750 (I²C)    | Reads illuminance in lux                             |
| Soil moisture           | Capacitive/resistive analog probe | Read on ADC pin 36                |
| Actuator: buzzer        | Passive/active buzzer wired to GPIO 18 | Audible alert, soil-moisture too low |
| Actuator: heater        | Relay-driven heater on GPIO 23 | Manual ON/OFF from dashboard          |

> No camera, pump, fan, or display is present in `main.cpp` or
> `firmware/include/`. The README mentions "fan/pump if present" — they are
> **not implemented**.

### 3.2 GPIO pin map

Source of truth: `firmware/src/main.cpp` lines 9–18 + `setup()` (lines 296+).

| Component         | GPIO / Interface | Direction | Purpose                                                    |
| ----------------- | ---------------- | --------- | ---------------------------------------------------------- |
| Buzzer            | GPIO 18          | OUTPUT    | `digitalWrite` HIGH = ON                                   |
| Heater (relay)    | GPIO 23          | OUTPUT    | `digitalWrite` HIGH = ON                                   |
| Soil moisture     | GPIO 36 (ADC)    | INPUT     | `analogRead`, raw 0–4095 → %                               |
| DHT11 data        | GPIO 5           | INPUT     | One-wire DHT protocol via `DHT.h`                          |
| BH1750 SDA        | GPIO 21          | I²C       | `Wire.begin(21, 22)`                                       |
| BH1750 SCL        | GPIO 22          | I²C       | `Wire.begin(21, 22)`                                       |
| Serial (USB)      | UART0 (115200)   | I/O       | Logging only                                               |

### 3.3 Sensor reading interval and threshold logic

- **Sampling tick**: `vTaskDelayUntil(&xLastWakeTime, pdMS_TO_TICKS(5000))` —
  one sample every **5 seconds** (`firmware/src/main.cpp:184`).
- **Soil moisture conversion**:
  `data.soilMoisturePercent = 100.0f - ((soilMoistureValue / 4095.0f) * 100.0f)`
  — assumes a probe where higher raw value = drier soil.
- **Buzzer auto threshold (firmware-side)**:
  `if (buzzerEnabled && soilMoisturePercent < soil_threshold_low) → buzzer ON`,
  with `soil_threshold_low = 10` (`main.cpp:34`). When the firmware buzzer
  mode is `OFF`, the buzzer is forced OFF regardless of soil moisture.
- **Heater control**: the firmware does **not** auto-control the heater; it
  only mirrors the last `ON`/`OFF` it received on `yolofarm/control/heater`.

### 3.4 Backend-side notification thresholds

The backend additionally evaluates these thresholds (used for dashboard
alert banners, not firmware automation) — `src/lib/mqtt/sensorDataHandler.ts`
lines 6–45:

| Sensor          | Threshold | Direction | UI message                                       |
| --------------- | --------- | --------- | ------------------------------------------------ |
| `soil_moisture` | 30 %      | below     | "Soil moisture is too low (X%). Please check irrigation." |
| `temperature`   | 35 °C     | above     | "Temperature is too high (X°C). Cooling may be needed."   |
| `humidity`      | 40 %      | below     | "Humidity is too low (X%)."                      |
| `light_intensity` | 300 lux | below     | "Light intensity is too low (X lux)."            |

---

## 4. Firmware Layer

### 4.1 Toolchain

- **Framework**: Arduino on ESP32 via **PlatformIO**
  (`firmware/platformio.ini`):
  - `platform = espressif32`
  - `board = nodemcu-32s`
  - `framework = arduino`
  - `monitor_speed = 115200`

### 4.2 Libraries (`platformio.ini > lib_deps`)

| Library                                 | Used for                                     |
| --------------------------------------- | -------------------------------------------- |
| `adafruit/DHT sensor library@^1.4.7`    | DHT11 reading                                |
| `adafruit/Adafruit Unified Sensor@^1.1.14` | Adafruit dependency                       |
| `claws/BH1750@^1.3.0`                   | BH1750 illuminance                           |
| `knolleary/PubSubClient@^2.8`           | MQTT client                                  |
| Built-in `WiFi.h`, `Wire.h`             | WiFi + I²C                                   |
| Built-in FreeRTOS (via Arduino-ESP32)   | `xTaskCreatePinnedToCore`, queues            |

### 4.3 Configuration

`firmware/include/config.h` (gitignored, with `config.h.example` template):

```c
#define WIFI_SSID     "VNPT-THUY"
#define WIFI_PASSWORD "999999999"
#define MQTT_BROKER   "192.168.1.14"   // laptop LAN IP
#define MQTT_PORT     1883
```

> The `.example` is the template; the real `config.h` must be edited per
> deployment (broker IP changes when the host laptop's IP changes).

### 4.4 WiFi connection flow

`setup_wifi()` in `main.cpp:50`:

1. `WiFi.begin(WIFI_SSID, WIFI_PASSWORD)`
2. Block until `WL_CONNECTED`, printing dots once per 500 ms.
3. Print local IP.
4. In the MQTT task, if WiFi drops, `WiFi.disconnect()` and retry up to 20
   times before falling through to MQTT reconnect.

### 4.5 MQTT connection flow

`reconnect()` in `main.cpp:129`:

1. While not connected, call `client.connect("ESP32Client")` (anonymous, no
   credentials).
2. On success, subscribe to `yolofarm/control/buzzer` and
   `yolofarm/control/heater`.
3. On failure, retry every 2 seconds.
4. Broker address is set in `setup()` via
   `client.setServer(MQTT_BROKER, MQTT_PORT)`.

### 4.6 FreeRTOS task layout

Two tasks pinned to different cores (`main.cpp:332`):

- **`sensorTask`** — core 1, 4 KB stack, period 5 s:
  - `analogRead(36)` → soil moisture %
  - `dht.readHumidity()` / `dht.readTemperature()`
  - `lightMeter.readLightLevel()`
  - Apply firmware buzzer threshold logic
  - `xQueueOverwrite(sensorQueue, &data)` — single-slot mailbox queue
- **`mqttTask`** — core 0, 6 KB stack:
  - Maintain WiFi + MQTT connection
  - `client.loop()` to service incoming control messages
  - On each new sample from the queue, build JSON and `client.publish` to
    `yolofarm/sensor/all` with `retain = true`

### 4.7 MQTT topics

| Topic                          | Direction (firmware) | Payload format            |
| ------------------------------ | -------------------- | ------------------------- |
| `yolofarm/sensor/all`          | publish              | JSON sensor snapshot       |
| `yolofarm/control/buzzer`      | subscribe            | `AUTO`, `OFF`, or `ON`    |
| `yolofarm/control/heater`      | subscribe            | `ON` or `OFF`             |
| `yolofarm/sensor/{id}/processed` | (backend → broker, not consumed by firmware) | JSON enriched snapshot |

### 4.8 JSON payload format published by ESP32

`buildSensorJson()` in `main.cpp:147`. Numeric fields are NaN-guarded — when
DHT or BH1750 read fails, the field is serialized as `null`.

```json
{
  "humidity": 60.50,
  "temperature": 30.20,
  "light": 800.00,
  "soil_moisture": 35.42,
  "buzzer": "OFF",
  "mode": "AUTO",
  "heater": "ON"
}
```

Field semantics:

- `humidity` / `temperature` — DHT11 reading; `null` if read failed.
- `light` — BH1750 reading in lux; `null` if read failed (`< 0`).
- `soil_moisture` — already converted to a 0–100 % value.
- `buzzer` — current hardware state of the buzzer pin (`ON`/`OFF`).
- `mode` — firmware buzzer mode (`AUTO`/`OFF`); reflects the last command
  the firmware received on `yolofarm/control/buzzer`.
- `heater` — current hardware state of the heater pin (`ON`/`OFF`).

### 4.9 Actuator command handling

`callback()` in `main.cpp:79` parses incoming control payloads, uppercased and
trimmed:

| Topic                       | Accepted payload | Effect on firmware                                    |
| --------------------------- | ---------------- | ----------------------------------------------------- |
| `yolofarm/control/buzzer`   | `OFF`            | `buzzerEnabled = false`, force buzzer pin LOW         |
| `yolofarm/control/buzzer`   | `AUTO`           | `buzzerEnabled = true` (threshold logic resumes)      |
| `yolofarm/control/buzzer`   | `ON`             | Force buzzer pin HIGH (mode untouched, AUTO will reassert on next tick) |
| `yolofarm/control/heater`   | `ON`             | Heater pin HIGH                                       |
| `yolofarm/control/heater`   | `OFF`            | Heater pin LOW                                        |

### 4.10 AUTO / OFF / MANUAL logic for the buzzer

There is no `MANUAL` mode in the firmware, despite the README hinting at it.
The implemented modes are:

- **`AUTO`** — `buzzerEnabled = true`. On every 5 s tick, sensorTask sets the
  buzzer pin HIGH if `soilMoisturePercent < 10`, otherwise LOW.
- **`OFF`** — `buzzerEnabled = false`. The pin is forced LOW every tick,
  regardless of soil moisture.
- **`ON` (transient override)** — receiving `ON` on the control topic sets
  the pin HIGH but leaves `buzzerEnabled` untouched, so on the very next
  sensorTask tick (within 5 s) the AUTO threshold logic re-evaluates and may
  switch it back. Effectively a one-shot manual buzz.

Heater has no AUTO mode — it strictly mirrors the last `ON`/`OFF` command.

---

## 5. MQTT / Realtime Pipeline

### 5.1 Broker

- **Image**: `eclipse-mosquitto:latest` (Docker, `docker-compose.yml`).
- **Ports**: 1883 (MQTT TCP), 9001 (MQTT-over-WebSocket).
- **Auth**: anonymous in development; `MQTT_USERNAME`/`MQTT_PASSWORD` env vars
  exist in `gateway/mqtt_bridge.py` but are unused by default.
- **QoS / retention**: ESP32 publishes with `retain = true`; backend publishes
  with `qos: 1` (`src/lib/mqtt/client.ts:124`).

### 5.2 Backend MQTT client

`src/lib/mqtt/client.ts`:

- Creates a single `mqtt.MqttClient` and stashes it on `globalThis` so Next's
  hot-reload doesn't open multiple connections.
- Reads `MQTT_BROKER_URL` (default `mqtt://localhost:1883`) and parses it
  with the WHATWG `URL` API (avoids Node 22's DEP0169 deprecation warning).
- Subscribes to `yolofarm/sensor/all` on connect.
- Has a **mock mode** for local dev: if `MQTT_MOCK_MODE=true`, no real broker
  is contacted; instead `generateFakeSensorData()` produces a fake payload
  every 5 s.
- Exposes `publishMqtt(topic, data)` that returns `false` if not connected
  (the toggle route uses this so the UI can warn the user that the DB was
  updated but the hardware command never went out).

### 5.3 Pub-sub fan-out

`src/lib/mqtt/sensorDataHandler.ts`:

- Holds two pieces of in-memory state on `globalThis`:
  - `_latestSensorSnapshot` — the last fully-processed snapshot.
  - `_sensorSseSubscribers` — `Set<callback>` of SSE listeners.
- `processSensorData(payload, sensorId = 1)`:
  1. Look up the buzzer + heater rows in `Actuator`. (Buzzer uses raw SQL so
     a stale Prisma client without the `mode` column still works.)
  2. Sync the firmware-reported buzzer hardware state to
     `Actuator.currentState`.
  3. Persist a `Telemetry` row.
  4. Run threshold-based notification upserts (§5.4).
  5. Update the in-memory snapshot and broadcast to SSE subscribers.
  6. Re-publish an enriched copy to `yolofarm/sensor/{id}/processed` (not
     consumed by anything in this repo, but useful for future external
     consumers).

### 5.4 Notification logic

For each of the four threshold configs:

- If the sensor value violates the threshold → upsert a `Notification` row
  keyed by `sensorKey` (so there's at most one *active* per sensor).
- If the value is back within bounds → mark every unresolved `Notification`
  for that sensor as `isResolved = true`.

### 5.5 Server-Sent Events (SSE) for the dashboard

`src/app/api/dashboard/stream/route.ts`:

- Authenticated via `requireAuth` (cookie or bearer token).
- On connect, the server immediately sends `event: snapshot` with the cached
  snapshot, so a hard reload sees the last known values within a microsecond.
- Subsequent MQTT messages broadcast the new snapshot.
- A `: ping <ts>` heartbeat fires every 15 s to keep proxies / Turbopack from
  closing the connection as idle.
- Closes when the request signal aborts (browser disconnect).

### 5.6 Optional Python gateway (logger)

`gateway/mqtt_bridge.py` — a passive paho-mqtt subscriber that prints every
sensor + control payload. It does **not** write to the database; it's purely a
log tail for debugging or a CI smoke test. Configurable via env vars
`MQTT_BROKER`, `MQTT_PORT`, `MQTT_USERNAME`, `MQTT_PASSWORD`.

---

## 6. Backend Service (Next.js API)

### 6.1 Stack

- Next.js **16.2.1** (App Router, `output: "standalone"`, React Compiler on)
- Node 20 (Docker base image)
- `mqtt@5.15.1`, `@prisma/client@7.5.0` + `@prisma/adapter-pg`,
  `bcryptjs`, `jsonwebtoken`, `nodemailer`
- `recharts` 3.x for charts, `lucide-react` for icons.

### 6.2 Bootstrap sequence

1. `next start` (or `next dev`) loads `src/instrumentation.ts`.
2. `instrumentation.ts > register()` runs only when
   `process.env.NEXT_RUNTIME === 'nodejs'`, then `await initializeMqtt()`.
3. `initializeMqtt()` calls `initMqttClient()` (broker connect, subscribe to
   `yolofarm/sensor/all`) and `subscribeToSensorData()` (registers the
   in-process callback that writes telemetry to the DB).
4. From then on, every MQTT message drives DB writes + SSE broadcasts.

### 6.3 Authentication

- **Sign-up** (`POST /api/signup`): server-side regex validation of name and
  email, bcrypt-hashed password, generates a 24h verification token, sends
  the verification link via Gmail SMTP (`src/lib/email/sendMail.ts`).
- **Email verification** (`GET /api/auth/verify?token=...`): redirects to
  `/login?verified=true` on success or `/login?error=invalid_token` on
  failure.
- **Login** (`POST /api/auth/login`): bcrypt verify, then signs a JWT
  containing `{ userId, email, role }` with `expiresIn: '24h'` and sets it as
  an `HttpOnly`, `SameSite=Lax`, 24-hour cookie named `token` (also adds
  `Secure` flag in production).
- **Forgot / reset password**:
  `POST /api/auth/forgot-password` (always returns success to prevent email
  enumeration) → emails a 30-minute reset link →
  `POST /api/auth/reset-password { token, password }`.
- **Server-side guard**: `requireAuth(request)` (`src/lib/auth.ts`) extracts
  the token from the `Authorization: Bearer …` header **or** the `token`
  cookie, verifies the JWT, and returns the payload. `requireRole(userRole,
  allowed[])` throws on mismatch.

### 6.4 REST API surface

All routes live under `src/app/api/...`. Auth is required unless noted.

#### Authentication

| Method | Path                          | Auth | Description                                      |
| ------ | ----------------------------- | ---- | ------------------------------------------------ |
| POST   | `/api/signup`                 | none | Create user (forces role `viewer`), send email   |
| POST   | `/api/auth/login`             | none | Set `token` cookie on success                    |
| GET    | `/api/auth/verify?token=…`    | none | Mark email verified, redirect to `/login`        |
| GET    | `/api/auth/status?email=…`    | none | Returns `{ isVerified }` for signup polling      |
| POST   | `/api/auth/forgot-password`   | none | Send reset email                                 |
| POST   | `/api/auth/reset-password`    | none | `{ token, password }` → set new password         |

#### Dashboard / live data

| Method | Path                          | Auth | Description                                      |
| ------ | ----------------------------- | ---- | ------------------------------------------------ |
| GET    | `/api/dashboard`              | yes  | Aggregate snapshot for first paint (current values from in-memory cache, plus stats, trends, actuators, notifications) |
| GET    | `/api/dashboard/stream`       | yes  | Server-Sent Events; pushes `snapshot` on every new MQTT message |

`/api/dashboard` is `force-dynamic`/`force-no-store`, queries are wrapped in
per-section try/catch so a single failing query degrades to defaults rather
than returning HTTP 500.

#### Sensors / telemetry / readings

| Method | Path                                | Description                                  |
| ------ | ----------------------------------- | -------------------------------------------- |
| GET    | `/api/sensors`                      | List sensors with relations + counts         |
| POST   | `/api/sensors` (admin or viewer)    | Create sensor                                |
| GET/PATCH/DELETE | `/api/sensors/[id]`       | Per-sensor CRUD                              |
| GET    | `/api/sensors/[id]/telemetries`     | Telemetries for a sensor                     |
| GET    | `/api/sensors/[id]/actuators`       | Actuators wired to a sensor                  |
| GET    | `/api/sensors/[id]/frames`          | Frames for a sensor                          |
| GET    | `/api/telemetries`                  | All telemetries (paginated)                  |
| GET    | `/api/telemetries/[id]`             | Single telemetry                             |
| GET    | `/api/readings/latest`              | Latest telemetry per sensor                  |
| GET    | `/api/readings/history?sensorId=...` | Telemetry history with date range + pagination |

#### Actuators

| Method | Path                              | Description                                  |
| ------ | --------------------------------- | -------------------------------------------- |
| GET    | `/api/actuators`                  | List actuators                               |
| POST   | `/api/actuators`                  | Create actuator (`role`, `currentState`)     |
| GET/PATCH/DELETE | `/api/actuators/[id]`   | Per-actuator CRUD (DELETE is admin-only)     |
| POST   | `/api/actuators/[id]/toggle`      | Toggle state (heater) or mode (buzzer); also publishes MQTT |
| GET    | `/api/actuators/runtime`          | Returns `{ buzzerState, buzzerMode }` from DB (used on first paint before SSE delivers) |

The toggle route is the most important one — it's what bridges "user click in
the UI" to "MQTT control message to the firmware". See §6.6 for the exact
behavior.

#### Notifications

| Method | Path                        | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| GET    | `/api/notifications`        | All `isResolved = false` notifications, newest first |

#### AI plant diagnosis

| Method | Path                        | Description                                  |
| ------ | --------------------------- | -------------------------------------------- |
| POST   | `/api/plant-diagnose`       | Multipart `photo` field → forwards to FastAPI as `file` |

Returns `{ message, data: { rawLabel, label, plant, disease, confidence, status, suggestion } }`. Persisting to `PlantDiagnosis` is **scaffolded but commented out** in the route.

#### Other (alerts, frames, users)

`/api/alerts`, `/api/alerts/[id]`, `/api/alerts/[id]/triggers`, `/api/frames`,
`/api/frames/[id]`, `/api/users`, `/api/users/[id]/sensor-views`,
`/api/users/[id]/detection-views` — wired to the corresponding controllers,
but not used by the current UI.

### 6.5 Helpers

- `src/lib/api.ts`: `ok`, `badRequest`, `unauthorized`, `forbidden`,
  `notFound`, `conflict`, `serverError` — small wrappers around `Response.json`.
- `src/lib/utils.ts`: `hashPassword`, `verifyPassword`, `generateToken`,
  `verifyToken`. JWT secret comes from `process.env.JWT_SECRET` (default:
  `'default_secret'` — must be overridden in production).
- `src/lib/email/sendMail.ts`: nodemailer with Gmail service, credentials
  from `GMAIL_USER` and `GMAIL_APP_PASSWORD`. **Note**: the `localhost`
  variable inside the file is hardcoded to `http://localhost:3000`, so
  verification emails sent from a non-local deployment will point to the
  wrong host (known limitation).

### 6.6 Toggle flow in detail

`src/app/api/actuators/[id]/toggle/route.ts`:

- Authenticated, `role` must be `admin` or `viewer`.
- Looks up the actuator; if not found → 404.
- **Buzzer branch** (`actuator.role === 'buzzer'`):
  - `nextMode = currentMode === 'AUTO' ? 'OFF' : 'AUTO'` — toggle.
  - Persist `{ mode: nextMode, toggledById: user.userId }`.
  - If `nextMode === 'OFF'`: also force `currentState = 'OFF'` in DB and the
    in-memory cache so the dashboard badge flips immediately
    (`forceBuzzerStateOff()`).
  - Publish `nextMode` (`AUTO` or `OFF`) to `yolofarm/control/buzzer`.
  - Response: `{ success, actuatorId, buzzerMode, buzzerState, mqttPublished }`.
- **Generic branch** (heater, future actuators):
  - `targetState` from `body.nextState` if `ON`/`OFF`, else flip `currentState`.
  - Persist `{ currentState: targetState, toggledById }`.
  - Publish `targetState` (`ON` or `OFF`) to `yolofarm/control/{role}`.
  - Response: `{ success, actuator, mqttPublished }`.
- If the broker is unreachable, `mqttPublished` is `false` and the response
  contains `warning: 'MQTT not connected — DB updated, hardware publish skipped'`.

---

## 7. Database (PostgreSQL via Prisma)

### 7.1 Connection

- `.env > DATABASE_URL` points at a Supabase pooler (`pgbouncer=true`,
  port 6543); `DIRECT_URL` is the direct port (5432) used by `prisma migrate`.
- `src/lib/prisma.ts` instantiates a single `PrismaClient` (cached on
  `globalThis` in dev) using `@prisma/adapter-pg`.
- Generated client output is at `src/generated/prisma` (not the default
  `node_modules/.prisma/client`).

### 7.2 Models (from `prisma/schema.prisma`)

| Model               | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `User`              | Auth + role; verification + reset-password tokens         |
| `Sensor`            | Physical sensor node (1 row seeded for the ESP32)         |
| `Telemetry`         | One row per MQTT sensor message (the time-series table)   |
| `Actuator`          | Heater + buzzer; `mode` only used by buzzer (`AUTO`/`OFF`) |
| `Notification`      | Active threshold warnings (deduplicated by `sensorKey`)   |
| `Frame`             | Image / camera frame stub                                 |
| `AiDetection`       | Per-frame AI detection (object detection model — not the plant-disease classifier) |
| `Alert`             | Generic alert definitions                                 |
| `AlertTrigger`      | Many-to-many: an alert fired against an `AiDetection`     |
| `UserSensorView`    | Tracks which user last viewed which sensor                |
| `UserDetectionView` | Tracks which user last viewed which AI detection          |
| `SensorActuatorControl` | Many-to-many sensor↔actuator links                    |
| `PlantDiagnosis`    | Plant-disease classification result (model exists; route currently does **not** write to it) |

### 7.3 Key relations

- `User 1—N Actuator` via `Actuator.toggledById` (who flipped it last).
- `Sensor 1—N Telemetry` (`onDelete: Cascade`).
- `Sensor 1—N Frame 1—N AiDetection` (cascade).
- `Sensor M—N Actuator` via `SensorActuatorControl` (sensor controls actuator
  by ID pair).
- `Alert M—N AiDetection` via `AlertTrigger`.

### 7.4 Indexes

Indices are declared on every column the dashboard filters/sorts on:
`Telemetry(sensorId)`, `Telemetry(timestamp)`, `Telemetry(sensorId,timestamp)`,
`Actuator(role)`, `Actuator(currentState)`, `Sensor(status)`,
`Notification(isResolved)`, `Notification(sensorKey)`, `PlantDiagnosis(status)`,
`PlantDiagnosis(createdAt)`, etc.

### 7.5 Migrations

Four migrations are checked in (`prisma/migrations/`):

1. `20260327122101_init` — initial schema baseline.
2. `20260330162211_add_all_tables` — adds Sensor/Telemetry/Frame/AiDetection/
   Actuator/Alert/AlertTrigger and join tables.
3. `20260331083119_update_user_table` — adds verification + reset fields.
4. `20260430085443_add_mode_and_notification` — adds `Actuator.mode` and the
   `Notification` table (the most recent migration; sensorDataHandler has
   defensive raw-SQL fallbacks for repos still on migration 3).

### 7.6 Seed (`prisma/seed.ts`)

Idempotent seed creates / migrates:

- One verified `User` (email `duongbaolong2503@gmail.com`, role `viewer`,
  password `2503`) — used as the demo account.
- One `Sensor` with `id = 1` (`type: "ESP32"`, location `"Greenhouse 1"`).
  This ID is hardcoded as `DEFAULT_SENSOR_ID = 1` in
  `sensorDataHandler.ts:57`, so every Telemetry MQTT message lands on this row.
- One `Actuator` with `role = "heater"`, `currentState = "OFF"`.
- One `Actuator` with `role = "buzzer"`, `currentState = "OFF"`, `mode = "OFF"`.

### 7.7 Defensive querying

- The buzzer's `mode` column was added in the latest migration; both
  `sensorDataHandler` and `actuators/runtime/route.ts` use a raw SQL
  `SELECT … FROM "Actuator"` so deployments where `npx prisma generate`
  hasn't been re-run still work.
- `Notification` table is read with `(prisma as any).notification?` and
  wrapped in `try/catch` so the dashboard still loads if the migration hasn't
  been applied.

---

## 8. Frontend Dashboard

### 8.1 Tech

- React **19**, Next.js App Router, Tailwind v4, `recharts` for charts,
  `lucide-react` icons. UI design uses an emerald + slate palette
  (intentionally "AI-free" per the redesign brief).
- Client-side React only — every page is `"use client"`.

### 8.2 Page map

| Route                         | File                                              | Purpose                                 |
| ----------------------------- | ------------------------------------------------- | --------------------------------------- |
| `/`                           | `src/app/page.tsx`                                | Redirect → `/dashboard` if authed, else `/login` (uses `localStorage.isAuthenticated`) |
| `/login`                      | `src/app/login/page.tsx`                          | Email + password, multi-tab verification sync via `BroadcastChannel` |
| `/signup`                     | `src/app/signup/page.tsx`                         | Sign-up form                            |
| `/forgot-password`            | `src/app/forgot-password/page.tsx`                | Email entry → POST `/api/auth/forgot-password` |
| `/reset-password`             | `src/app/reset-password/page.tsx`                 | Reset form (consumes token from URL)     |
| `/dashboard`                  | `src/app/dashboard/page.tsx`                      | Main monitoring + control screen         |
| `/diagnose`                   | `src/app/diagnose/page.tsx`                       | AI plant-disease upload & result         |

### 8.3 Components (`src/components`)

- `TopNav.tsx` — top bar: logo, nav links (Dashboard / Diagnose), live clock,
  notification bell with dropdown driven by `useNotifications()` context, user
  chip, logout (clears `localStorage` and pushes `/login`).
- `CircularGauge.tsx` — SVG circular progress gauge, animates between values.
- `DataVisualization.tsx` — wraps a `recharts` `LineChart` with consistent
  styling.
- `SystemStatus.tsx` — pings `/api/dashboard` every 10 s and grades sensor /
  gateway as online (< 30 s old), warning (30 s–5 min), or offline.
- `SensorCard`, `DeviceControlPanel`, `ToggleControl`, etc. — UI primitives.
- `components/ui/*` — Button, Card, Badge, Input small re-usables.

### 8.4 Dashboard composition (`/dashboard`)

The page is laid out in five sections (`src/app/dashboard/page.tsx`):

1. **Quick Stats** — Active Sensors, Devices Online, Alerts, Data Points
   (sourced from `data.stats`).
2. **Environmental Monitoring** — four `CircularGauge`s: Humidity 0–100%,
   Temperature 0–60 °C, Soil Moisture 0–100%, Light Intensity 0–10 000 lux.
3. **Device Controls** — `HeaterCard` and `BuzzerCard` with toggle switches.
4. **Charts** — Light Intensity (`amber`), Temperature (`red`), Soil Moisture
   (`blue`); each chart caps the last 50 SSE-pushed points.
5. **System Status**.

### 8.5 Live update on the client

Two separate `useEffect`s in `dashboard/page.tsx`:

- **REST kick-start** (line 95):
  - On mount, GETs `/api/dashboard` (current values from in-memory snapshot,
    plus stats/trends/actuators/notifications). On HTTP 401, clears
    localStorage and pushes to `/login`.
  - Polls `/api/notifications` every 10 s and `/api/dashboard` every 30 s as
    a safety net for stats/trends.
- **SSE stream** (line 215):
  - `new EventSource('/api/dashboard/stream', { withCredentials: true })`.
  - On every `snapshot` event, updates the live gauges, the buzzer hardware
    badge, and appends a point to each chart trend (deduped on identical
    timestamps, capped at 50 points).
  - **`heaterState` and `buzzerMode` are deliberately NOT updated from SSE**
    — the toggle response is the single source of truth, otherwise live
    updates would race with user clicks (per the comment at lines 244–247).
  - On error, closes and retries with a 3 s backoff.

### 8.6 Toggle UX

`HeaterCard` and `BuzzerCard` (in `dashboard/page.tsx`) both:

1. Use a synchronous `inFlightRef` ref to reject double-clicks before
   `useState` has time to flip the disabled prop.
2. POST to `/api/actuators/{id}/toggle`.
3. Update local state from the **response** (`data.actuator.currentState` for
   heater, `data.buzzerMode` + `data.buzzerState` for buzzer).
4. If `data.warning` is set (MQTT broker unreachable), they log it but still
   reflect the DB-confirmed state.

The buzzer card additionally shows a "ON" / "Silent" badge when the mode is
`AUTO`, reflecting the firmware-reported hardware state pushed via SSE.

### 8.7 Notifications context

- `src/lib/notifications.tsx` defines a `NotificationContext` injected by
  `src/app/providers.tsx` so both `TopNav` (bell) and `dashboard/page.tsx`
  share a single notification list.
- `mapApiNotification()` formats the DB row into the UI shape (adds an
  `HH:mm:ss` `time` from `updatedAt`).
- The bell shows a red dot whenever `notifications.length > 0`. Clicking opens
  a dropdown listing each warning with sensor name, current value, and threshold.

---

## 9. AI Diagnosis Feature

### 9.1 What it is

A **classification** model (not object detection — there are no bounding boxes
in the response, despite the AiDetection table having a `boundingBox` field
left over from earlier YOLO experiments). It takes a leaf photo, predicts
which of **38 plant/disease classes** it most resembles, and returns a
treatment / care suggestion.

### 9.2 Service

- `plant_disease/inference_api.py` — FastAPI app on port **8001**.
- CORS configured to allow `http://localhost:3000` and `http://127.0.0.1:3000`
  only.
- Endpoints:
  - `GET /` — health check (model name, class count, device).
  - `POST /predict` — accepts multipart `file=<image>`; returns the JSON below.
- Model: a 5-block CNN (`Conv → BN → ReLU → MaxPool` × 5, then
  `Flatten → Dropout(0.5) → Linear(256·8·8 → 38)`) — see `PlantDiseaseModel`
  class in `inference_api.py:37`. Mirrors the training architecture in
  `train_plant_disease_test.py`.
- Weights: `plant_disease_98.pth` (98% validation accuracy on the
  PlantVillage augmented dataset). A second checkpoint `plant_disease_89.pth`
  is also kept for reference. Loaded via
  `torch.load(MODEL_PATH, map_location=device, weights_only=True)`.
- Device: CUDA if available, otherwise CPU. Docker image
  (`Dockerfile.ai`) installs CPU-only PyTorch.
- Image transform: `Resize(256, 256) → ToTensor`.

### 9.3 Class taxonomy

`plant_disease/class_names.json` — 38 classes covering: Apple, Blueberry,
Cherry, Corn, Grape, Orange, Peach, Pepper (bell), Potato, Raspberry, Soybean,
Squash, Strawberry, Tomato. Each plant has at least one healthy class plus
zero or more disease classes (e.g. `Tomato___Late_blight`,
`Apple___Apple_scab`).

### 9.4 Status decision

`inference_api.py:308`:

- **Confidence < 40 %** → `status = "uncertain"`, generic "retake the photo"
  suggestion.
- Else if class label contains `"healthy"` → `status = "healthy"`, healthy-care
  tip from `DISEASE_SUGGESTIONS`.
- Else → `status = "diseased"`, treatment recommendation from
  `DISEASE_SUGGESTIONS`.

### 9.5 `/predict` response shape

```json
{
  "rawLabel": "Tomato___Late_blight",
  "label": "Tomato - Late blight",
  "confidence": 92.71,
  "status": "diseased",
  "plant": "Tomato",
  "disease": "Late blight",
  "suggestion": "Apply fungicide immediately (chlorothalonil or copper). Remove and destroy infected plants. This disease spreads rapidly in cool, wet conditions — act fast."
}
```

### 9.6 Frontend integration

`src/app/diagnose/page.tsx` + `src/app/api/plant-diagnose/route.ts`:

1. User opens the upload modal, drops a PNG / JPG / WEBP (max **5 MB**).
2. Browser POSTs `multipart/form-data` with field name `photo` to
   `/api/plant-diagnose`.
3. The Next.js route validates the upload (must be an image), renames the
   field to `file`, and `fetch`-forwards it to `PLANT_AI_URL`
   (default `http://127.0.0.1:8001/predict`, set to `http://ai-service:8001/predict`
   in docker-compose).
4. AI service returns the prediction; the route relays
   `{ message, data: <prediction> }`.
5. The frontend renders a `ResultCard` showing image preview, status badge
   (Healthy / Disease Detected / Uncertain), confidence, plant, disease, and
   suggestion.
6. Errors are surfaced as toast-like banners ("AI service is not available",
   "Network error", etc.). The route returns 503 if the FastAPI service is
   unreachable.

### 9.7 Persistence (current state)

The `PlantDiagnosis` Prisma model exists, but the route's DB-write block is
**commented out** (`src/app/api/plant-diagnose/route.ts:60`). Diagnoses are
returned to the client but not stored. This is a deliberate scaffold the
project plans to enable once the model is migrated everywhere.

---

## 10. Cross-cutting concerns and known gaps

This section mentions parts of the system that are partially implemented or
have known mismatches between the README/intent and the source code.

- **Roles**: signup hardcodes `"viewer"`. There is no admin-promotion UI;
  admin role can only be set via SQL. `requireRole` is invoked with
  inconsistent allowlists across endpoints — for example,
  `POST /api/sensors` allows `['admin', 'viewer']` (a viewer can create
  sensors), and `PATCH /api/actuators/[id]` allows `['admin', 'operator']`
  (but no `operator` role is ever assigned). Treat the role check as
  best-effort.
- **MANUAL buzzer mode**: the README mentions AUTO/OFF/MANUAL, but the
  firmware only implements `AUTO` and `OFF`; `ON` is a transient one-shot
  override.
- **Pump / fan / camera**: not present in firmware. The schema's `Frame`
  and `AiDetection` tables remain unused at runtime.
- **Email link host**: `sendMail.ts` hardcodes `http://localhost:3000`, so
  emails sent from a non-local deployment will point to the wrong host.
- **PlantDiagnosis persistence**: scaffolded, currently commented out.
- **Hardcoded sensor id**: only one sensor (id `1`) is supported; multi-node
  deployments would require routing each ESP32 to its own ID.
- **Secrets in repo**: `.env` is checked in with real Supabase credentials,
  Gmail app password, and JWT secret. Rotate before any public release.
- **Mock mode**: setting `MQTT_MOCK_MODE=true` lets the dashboard run without
  a broker (useful for UI development); the buzzer hardware state will then
  be entirely DB-driven and never reflect a real device.
- **Re-publish topic**: backend publishes an enriched copy to
  `yolofarm/sensor/{id}/processed`, but no other component in the repo
  consumes it.

---

## 11. Deployment topology

### 11.1 Docker Compose (default development setup)

`docker-compose.yml` brings up four services on a shared `mqtt-network`:

| Service       | Image / Build           | Port    | Notes                                          |
| ------------- | ----------------------- | ------- | ---------------------------------------------- |
| `mqtt`        | `eclipse-mosquitto:latest` | 1883, 9001 | Healthcheck via `mosquitto_sub`             |
| `gateway`     | `Dockerfile.gateway`    | —       | Passive logger; depends on `mqtt` healthy     |
| `ai-service`  | `Dockerfile.ai`         | 8001    | CPU-only PyTorch                              |
| `app`         | `Dockerfile`            | 3000    | Next.js standalone; `MQTT_BROKER_URL=mqtt://mqtt:1883`, `PLANT_AI_URL=http://ai-service:8001/predict` |

The ESP32 is **not** in the compose file — it's a real device on the LAN; the
broker IP must match the host's LAN IP from the ESP32's perspective
(`firmware/include/config.h > MQTT_BROKER`).

### 11.2 Environment variables

| Variable               | Used by              | Notes                                           |
| ---------------------- | -------------------- | ----------------------------------------------- |
| `DATABASE_URL`         | Prisma (runtime)     | Supabase pooler, port 6543                      |
| `DIRECT_URL`           | Prisma (migrate)     | Supabase direct, port 5432                      |
| `JWT_SECRET`           | `src/lib/utils.ts`   | Required for prod; falls back to insecure default |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | nodemailer | For verification + reset emails             |
| `MQTT_BROKER_URL`      | `client.ts`          | Defaults to `mqtt://localhost:1883`             |
| `MQTT_MOCK_MODE`       | `client.ts`          | `"true"` to fake sensor payloads every 5 s      |
| `PLANT_AI_URL`         | `plant-diagnose/route.ts` | Defaults to `http://127.0.0.1:8001/predict` |
| `MQTT_BROKER` / `MQTT_PORT` / `MQTT_USERNAME` / `MQTT_PASSWORD` | `gateway/mqtt_bridge.py` | Logger only |

### 11.3 Local development quickstart (from the source code, not asserted as tested)

1. `npm install`
2. Start Postgres + Mosquitto (e.g. `docker compose up mqtt` or use Supabase).
3. `npx prisma migrate deploy && npm run prisma:seed` (or `tsx prisma/seed.ts`).
4. `cd plant_disease && python -m uvicorn inference_api:app --port 8001`.
5. `npm run dev` → http://localhost:3000.
6. Flash the firmware: edit `firmware/include/config.h`, then
   `pio run --target upload` from the `firmware/` directory.

---

## 12. File map (top-level)

```
smart-farm/
├── docker-compose.yml         mqtt + gateway + ai-service + app
├── Dockerfile                 Next.js standalone
├── Dockerfile.ai              FastAPI + PyTorch (CPU)
├── Dockerfile.gateway         paho-mqtt logger
├── README.md                  project README (richer than this spec in places)
├── prisma/
│   ├── schema.prisma          12 models incl. Notification + PlantDiagnosis
│   ├── migrations/            4 migrations (latest: add mode + Notification)
│   └── seed.ts                User + Sensor #1 + heater + buzzer
├── firmware/
│   ├── platformio.ini         nodemcu-32s, Arduino framework
│   ├── include/config.h       WiFi SSID/PSK + MQTT broker IP
│   └── src/main.cpp           FreeRTOS sensor + MQTT tasks
├── gateway/
│   ├── mqtt_bridge.py         passive logger
│   └── requirements.txt
├── plant_disease/
│   ├── inference_api.py       FastAPI /predict
│   ├── train_plant_disease_test.py  training script
│   ├── plant_disease_98.pth   trained weights (used)
│   ├── plant_disease_89.pth   alternative checkpoint
│   ├── class_names.json       38 classes
│   └── requirements.txt
└── src/                       Next.js source
    ├── app/                   App Router pages + API routes
    ├── components/            React components
    ├── db/                    Prisma controllers + models
    ├── generated/prisma/      generated Prisma client
    ├── instrumentation.ts     boot hook → initializeMqtt
    └── lib/
        ├── mqtt/              client + sensorDataHandler + init
        ├── auth.ts            requireAuth / requireRole
        ├── prisma.ts          shared PrismaClient
        ├── utils.ts           bcrypt + JWT helpers
        ├── api.ts             Response.json wrappers
        ├── email/             nodemailer sender + HTML templates
        ├── notifications.tsx  React context for the bell
        └── ...
```

---

*Document generated from a direct scan of the repository as of
**2026-05-08**. All claims above were verified against the source files
listed alongside them; sections explicitly marked "(scaffolded)",
"(commented out)" or "(not implemented)" describe code present in the repo
that does not currently run.*
