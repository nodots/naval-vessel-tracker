import { pool } from "../db.js";

export type AisMessage = {
  mmsi: string;
  observedAt: Date;
  lat: number;
  lon: number;
  speedKnots: number | null;
  courseDeg: number | null;
  headingDeg: number | null;
  rawPayload: unknown;
};

export type IngestResult =
  | { kind: "inserted"; vesselId: string; observationId: number }
  | { kind: "skipped"; reason: string };

const MAX_PLAUSIBLE_SPEED_KNOTS = 60;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function aisConfidence(ageMinutes: number): number {
  if (ageMinutes <= 5) return 0.85;
  if (ageMinutes <= 30) return 0.75;
  return 0.65;
}

export async function ingestMessage(msg: AisMessage): Promise<IngestResult> {
  if (!Number.isFinite(msg.lat) || msg.lat < -90 || msg.lat > 90) {
    return { kind: "skipped", reason: `bad lat ${msg.lat}` };
  }
  if (!Number.isFinite(msg.lon) || msg.lon < -180 || msg.lon > 180) {
    return { kind: "skipped", reason: `bad lon ${msg.lon}` };
  }
  if (msg.speedKnots !== null && msg.speedKnots > MAX_PLAUSIBLE_SPEED_KNOTS) {
    return { kind: "skipped", reason: `speed ${msg.speedKnots} > ${MAX_PLAUSIBLE_SPEED_KNOTS}` };
  }
  if (msg.observedAt.getTime() - Date.now() > FUTURE_TOLERANCE_MS) {
    return { kind: "skipped", reason: "observed_at in the future" };
  }

  const vesselLookup = await pool.query<{ id: string }>(
    `SELECT id FROM vessels WHERE mmsi = $1 LIMIT 1`,
    [msg.mmsi],
  );
  const vessel = vesselLookup.rows[0];
  if (!vessel) {
    return { kind: "skipped", reason: `unknown MMSI ${msg.mmsi}` };
  }

  const ageMinutes = Math.max(0, (Date.now() - msg.observedAt.getTime()) / 60_000);
  const confidence = aisConfidence(ageMinutes);

  const insert = await pool.query<{ id: string }>(
    `INSERT INTO observations (
       vessel_id, observed_at, location, lat, lon,
       speed_knots, course_deg, heading_deg,
       source_type, source_name, confidence, raw_payload
     )
     VALUES (
       $1, $2,
       ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
       $3, $4,
       $5, $6, $7,
       'ais', 'ais-stream', $8, $9
     )
     RETURNING id`,
    [
      vessel.id,
      msg.observedAt.toISOString(),
      msg.lat,
      msg.lon,
      msg.speedKnots,
      msg.courseDeg,
      msg.headingDeg,
      confidence,
      JSON.stringify(msg.rawPayload),
    ],
  );

  const row = insert.rows[0];
  if (!row) {
    return { kind: "skipped", reason: "insert returned no row" };
  }

  return { kind: "inserted", vesselId: vessel.id, observationId: Number(row.id) };
}
