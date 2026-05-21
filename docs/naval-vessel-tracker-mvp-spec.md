# Naval Vessel Tracker MVP Specification

## 1. Project Goal

Build a web application for tracking the last known and inferred movement of major naval vessels around the world.

The app must not pretend to provide perfect live tracking. Naval vessels often disable AIS, transmit intermittently, spoof positions, or are observed through non-AIS sources. The product should represent vessel movement as evidence-backed observations with confidence levels.

Primary MVP goal:

> Show the last known position, source, age, and confidence state of a curated set of major naval vessels on a global map.

---

## 2. MVP Stack

Use:

- React
- Vite
- TypeScript
- Express
- PostgreSQL
- PostGIS
- MapLibre GL
- Plain Node worker process

Do not use in MVP:

- Redis
- BullMQ
- Kafka
- microservices
- complex auth
- paid satellite integration
- automated OSINT scraping unless trivial

Post-MVP candidates:

- Redis + BullMQ
- authentication / roles
- alert subscriptions
- satellite imagery integrations
- automated OSINT extraction
- vector tiles
- public API

---

## 3. Monorepo Structure

```txt
naval-tracker/
  apps/
    web/
      src/
    api/
      src/
    worker/
      src/
  packages/
    shared/
      src/
  db/
    migrations/
    seeds/
  docker-compose.yml
  package.json
  README.md
```

Recommended package manager:

```txt
pnpm
```

If using npm workspaces, avoid unresolved `workspace:*` dependency issues by ensuring the root package manager and workspace config are correct.

---

## 4. Core Product Concepts

### Vessel

A curated naval vessel of interest.

Examples:

- USS Gerald R. Ford
- USS Nimitz
- HMS Queen Elizabeth
- Charles de Gaulle
- Admiral Kuznetsov
- Liaoning
- Shandong
- Fujian
- JS Izumo
- INS Vikrant

### Observation

A single piece of evidence placing a vessel somewhere at a given time.

Observation sources may include:

- AIS
- manual OSINT sighting
- port sighting
- official navy release
- news article
- satellite-derived observation
- analyst estimate

### Current Position

The app’s current best answer for where a vessel is or was last known to be.

This should include:

- location
- observed_at timestamp
- source
- confidence
- status
- age
- explanatory note

### Track Status

Use explicit states:

```ts
export type TrackStatus =
  | "live_ais"
  | "recent_ais"
  | "stale_ais"
  | "osint_sighting"
  | "estimated"
  | "dark"
  | "unknown";
```

Suggested meaning:

| Status | Meaning |
|---|---|
| `live_ais` | AIS observed recently |
| `recent_ais` | AIS observed, but not live |
| `stale_ais` | AIS old enough to be unreliable |
| `osint_sighting` | Recent non-AIS observation |
| `estimated` | Inferred location based on movement model |
| `dark` | Important vessel with no recent reliable observation |
| `unknown` | Insufficient data |

---

## 5. Database Requirements

PostgreSQL must have PostGIS enabled.

### Extension

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 6. Initial Schema

### vessels

```sql
CREATE TABLE vessels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,

  country TEXT NOT NULL,
  navy TEXT,
  vessel_type TEXT NOT NULL,
  class_name TEXT,
  pennant_number TEXT,

  mmsi TEXT,
  imo TEXT,
  call_sign TEXT,

  home_port TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vessels_name ON vessels USING gin (to_tsvector('english', name));
CREATE INDEX idx_vessels_mmsi ON vessels(mmsi);
CREATE INDEX idx_vessels_country ON vessels(country);
CREATE INDEX idx_vessels_type ON vessels(vessel_type);
```

### observations

Use one normalized table for AIS and non-AIS sightings.

```sql
CREATE TABLE observations (
  id BIGSERIAL PRIMARY KEY,

  vessel_id UUID REFERENCES vessels(id),

  observed_at TIMESTAMPTZ NOT NULL,

  location GEOGRAPHY(POINT, 4326),

  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,

  speed_knots NUMERIC,
  course_deg NUMERIC,
  heading_deg NUMERIC,

  source_type TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,

  confidence NUMERIC NOT NULL DEFAULT 0.5,

  raw_payload JSONB,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT observations_confidence_range
    CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX idx_observations_location
ON observations
USING GIST(location);

CREATE INDEX idx_observations_vessel_time
ON observations(vessel_id, observed_at DESC);

CREATE INDEX idx_observations_source_type
ON observations(source_type);

CREATE INDEX idx_observations_raw_payload
ON observations
USING GIN(raw_payload);
```

### current_positions

Materialized table maintained by the app/worker.

```sql
CREATE TABLE current_positions (
  vessel_id UUID PRIMARY KEY REFERENCES vessels(id),

  observation_id BIGINT REFERENCES observations(id),

  observed_at TIMESTAMPTZ NOT NULL,

  location GEOGRAPHY(POINT, 4326) NOT NULL,

  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,

  speed_knots NUMERIC,
  course_deg NUMERIC,
  heading_deg NUMERIC,

  source_type TEXT NOT NULL,
  source_name TEXT,

  confidence NUMERIC NOT NULL,

  status TEXT NOT NULL,

  age_minutes INTEGER NOT NULL,

  summary TEXT,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_current_positions_location
ON current_positions
USING GIST(location);

CREATE INDEX idx_current_positions_status
ON current_positions(status);
```

### regions

Used for geofences such as straits, seas, and operating areas.

```sql
CREATE TABLE regions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  region_type TEXT NOT NULL,

  boundary GEOGRAPHY(POLYGON, 4326),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_regions_boundary
ON regions
USING GIST(boundary);
```

### ports

```sql
CREATE TABLE ports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  country TEXT NOT NULL,

  location GEOGRAPHY(POINT, 4326) NOT NULL,

  lat DOUBLE PRECISION NOT NULL,
  lon DOUBLE PRECISION NOT NULL,

  port_type TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ports_location
ON ports
USING GIST(location);
```

### ingestion_runs

For simple worker observability.

```sql
CREATE TABLE ingestion_runs (
  id BIGSERIAL PRIMARY KEY,

  source TEXT NOT NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,

  status TEXT NOT NULL,
  message TEXT,

  records_seen INTEGER DEFAULT 0,
  records_inserted INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 7. PostGIS Usage

Use PostGIS for:

- distance queries
- region containment
- proximity alerts later
- vessel tracks
- strategic area filtering
- port proximity

Example: vessels within 100 nautical miles of a point.

```sql
SELECT
  v.name,
  cp.lat,
  cp.lon,
  cp.observed_at
FROM current_positions cp
JOIN vessels v ON v.id = cp.vessel_id
WHERE ST_DWithin(
  cp.location,
  ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
  185200
);
```

Example: vessels inside a region.

```sql
SELECT
  v.name,
  r.name AS region_name,
  cp.observed_at
FROM current_positions cp
JOIN vessels v ON v.id = cp.vessel_id
JOIN regions r ON ST_Contains(r.boundary::geometry, cp.location::geometry)
WHERE r.name = 'Taiwan Strait';
```

---

## 8. Backend API

Base path:

```txt
/api
```

### GET /api/health

Returns service status.

```json
{
  "ok": true,
  "service": "naval-tracker-api"
}
```

### GET /api/vessels

Query params:

```txt
q
country
type
status
limit
offset
```

Response:

```ts
type VesselListItem = {
  id: string;
  name: string;
  country: string;
  vesselType: string;
  className?: string;
  pennantNumber?: string;
  mmsi?: string;
  currentPosition?: CurrentPositionSummary;
};
```

### GET /api/vessels/:id

Returns vessel details plus current position.

### GET /api/vessels/:id/observations

Query params:

```txt
limit
offset
sourceType
from
to
```

Returns chronological or reverse-chronological observation list.

### GET /api/map/vessels

Returns all current vessel map markers.

```ts
type MapVesselMarker = {
  vesselId: string;
  name: string;
  country: string;
  vesselType: string;
  lat: number;
  lon: number;
  observedAt: string;
  confidence: number;
  status: TrackStatus;
  sourceType: string;
  ageMinutes: number;
};
```

### POST /api/admin/observations

Manual OSINT sighting entry.

MVP can be unauthenticated locally, but structure as admin API.

Request:

```ts
type CreateObservationRequest = {
  vesselId: string;
  observedAt: string;
  lat: number;
  lon: number;
  sourceType: "manual_osint" | "official_release" | "news" | "port_sighting" | "satellite";
  sourceName?: string;
  sourceUrl?: string;
  confidence: number;
  notes?: string;
};
```

### POST /api/admin/recompute-current-positions

Manually trigger recomputation.

---

## 9. Worker

MVP worker is a plain Node process.

Responsibilities:

1. Poll or receive AIS data.
2. Match AIS records to vessels by MMSI where possible.
3. Insert observations.
4. Recompute current_positions.
5. Record ingestion_runs.

No Redis/BullMQ in MVP.

Suggested loop:

```ts
async function main() {
  while (true) {
    await ingestAISOnce();
    await recomputeCurrentPositions();
    await sleep(30_000);
  }
}
```

A cron-style worker is also acceptable.

---

## 10. AIS Ingestion Rules

AIS data is useful but incomplete.

For MVP:

- Match incoming AIS messages by MMSI.
- Ignore AIS messages whose MMSI does not match a curated vessel.
- Store raw payload in `observations.raw_payload`.
- Insert only messages with valid lat/lon.
- Use source_type = `ais`.
- Use confidence between `0.6` and `0.9` depending on freshness and validity.

Basic validation:

- lat between -90 and 90
- lon between -180 and 180
- speed less than a plausible max, e.g. 60 knots
- observed_at not in the future beyond a small tolerance

Do not try to identify unknown warships automatically in MVP.

---

## 11. Current Position Computation

For each vessel:

1. Select latest valid observation.
2. Determine age in minutes.
3. Assign track status.
4. Write/update current_positions.

Suggested status logic:

```ts
function deriveTrackStatus(observation: Observation, ageMinutes: number): TrackStatus {
  if (observation.sourceType === "ais") {
    if (ageMinutes <= 30) return "live_ais";
    if (ageMinutes <= 360) return "recent_ais";
    if (ageMinutes <= 2880) return "stale_ais";
    return "dark";
  }

  if (
    observation.sourceType === "manual_osint" ||
    observation.sourceType === "official_release" ||
    observation.sourceType === "news" ||
    observation.sourceType === "port_sighting" ||
    observation.sourceType === "satellite"
  ) {
    if (ageMinutes <= 4320) return "osint_sighting";
    return "dark";
  }

  return "unknown";
}
```

Suggested confidence decay:

```ts
function decayConfidence(base: number, ageHours: number): number {
  const decay = Math.exp(-ageHours / 48);
  return Math.max(0.05, Math.min(1, base * decay));
}
```

Use this only as a first-pass model. Keep it explainable.

---

## 12. Frontend

### Routes

```txt
/
  redirects to /map

/map
  global map view

/vessels
  searchable vessel table

/vessels/:id
  vessel detail page

/admin/observations/new
  manual observation entry
```

### Map View

Use MapLibre GL.

Features:

- global map
- vessel markers
- marker style reflects status/confidence
- click marker to show vessel summary
- filter by country
- filter by vessel type
- filter by status
- stale/dark vessels visually distinct

Popup content:

```txt
USS Gerald R. Ford
Aircraft carrier
Status: recent AIS
Last observed: 3h ago
Confidence: 0.72
Source: AIS
```

### Vessel Detail Page

Show:

- vessel name
- country/navy
- type/class
- pennant number
- MMSI if available
- current position map
- confidence status
- observation timeline
- raw/source links where available

### Admin Observation Form

Fields:

- vessel
- observed_at
- lat
- lon
- source_type
- source_name
- source_url
- confidence
- notes

After submit:

- insert observation
- recompute current position for that vessel
- redirect to vessel detail page

---

## 13. Shared Types

In `packages/shared/src/types.ts`:

```ts
export type TrackStatus =
  | "live_ais"
  | "recent_ais"
  | "stale_ais"
  | "osint_sighting"
  | "estimated"
  | "dark"
  | "unknown";

export type SourceType =
  | "ais"
  | "manual_osint"
  | "official_release"
  | "news"
  | "port_sighting"
  | "satellite"
  | "analyst_estimate";

export type VesselType =
  | "aircraft_carrier"
  | "amphibious_assault_ship"
  | "destroyer"
  | "cruiser"
  | "frigate"
  | "submarine_tender"
  | "intelligence_ship"
  | "support_ship"
  | "other";
```

---

## 14. Seed Data

Seed 20–50 major vessels.

Each seed record should include:

- name
- country
- navy
- vessel_type
- class_name
- pennant_number
- mmsi if known
- notes

Start with aircraft carriers and amphibious assault ships.

Recommended initial categories:

- US aircraft carriers
- Chinese aircraft carriers
- UK aircraft carriers
- French aircraft carrier
- Indian aircraft carriers
- Japanese helicopter destroyers / carrier-like ships
- major Russian naval units where relevant
- major amphibious assault ships

Do not block MVP on perfect MMSI data. The app should support manual observations even when MMSI is unknown.

---

## 15. Environment Variables

### apps/api/.env

```txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/naval_tracker
PORT=6732
CORS_ORIGIN=http://localhost:6731
```

### apps/worker/.env

```txt
DATABASE_URL=postgres://postgres:postgres@localhost:5432/naval_tracker
AISSTREAM_API_KEY=
AISSTREAM_ENABLED=false
```

### apps/web/.env

```txt
VITE_API_BASE_URL=http://localhost:6732/api
```

Vite dev server must be configured to listen on port `6731` (set `server.port` in `vite.config.ts`).

---

## 16. Docker Compose

MVP needs Postgres with PostGIS.

```yaml
services:
  postgres:
    image: postgis/postgis:16-3.4
    container_name: naval-tracker-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: naval_tracker
    ports:
      - "5432:5432"
    volumes:
      - naval_tracker_pgdata:/var/lib/postgresql/data

volumes:
  naval_tracker_pgdata:
```

---

## 17. Implementation Milestones

### Milestone 1: Project bootstrap

Acceptance criteria:

- monorepo created
- React/Vite app runs
- Express API runs
- Postgres/PostGIS runs via Docker
- shared TypeScript package works

### Milestone 2: Database + seed data

Acceptance criteria:

- migrations create schema
- seed script inserts at least 20 vessels
- API can list vessels

### Milestone 3: Map with fake/current positions

Acceptance criteria:

- `/map` displays global map
- map shows vessel markers from `/api/map/vessels`
- marker popup shows status/confidence

### Milestone 4: Manual observations

Acceptance criteria:

- admin form creates observation
- current_positions updates
- vessel detail page shows latest observation

### Milestone 5: AIS ingestion

Acceptance criteria:

- worker can ingest AIS records for known MMSIs
- records are stored as observations
- current_positions recomputed
- ingestion_runs records success/failure

### Milestone 6: Confidence and stale/dark states

Acceptance criteria:

- status derives from source and age
- stale/dark vessels are visually distinct
- vessel detail explains why status was assigned

---

## 18. Non-Goals for MVP

Do not implement:

- real-time collaborative editing
- public accounts
- payment system
- high-scale streaming architecture
- Redis/BullMQ
- Kafka
- Elasticsearch
- automated social media scraping
- submarine tracking claims
- classified or restricted data
- predictive military targeting features

This is an OSINT-style situational awareness app using public or user-provided observations.

---

## 19. Safety and Representation Requirements

The app must represent uncertainty clearly.

Avoid language like:

- “current exact location”
- “real-time position”
- “confirmed location” unless source supports it

Prefer:

- “last observed”
- “last known”
- “reported near”
- “AIS observed”
- “confidence estimate”
- “dark since”

Each position should be explainable by a source and timestamp.

---

## 20. Recommended First Build Task for Agent

Start with this task:

> Bootstrap the monorepo with React + Vite frontend, Express TypeScript API, shared TypeScript package, Docker Compose PostGIS database, initial migrations, and seed data for at least 20 major naval vessels. Then implement `/api/health`, `/api/vessels`, and `/api/map/vessels`, with the frontend `/map` rendering seeded current positions on MapLibre.

Do not implement AIS ingestion until the map and manual observations work.
