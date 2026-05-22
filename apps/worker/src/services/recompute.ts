import { decayConfidence, deriveTrackStatus, type SourceType } from "@naval-tracker/shared";
import { pool } from "../db.js";

type LatestObservationRow = {
  id: string;
  observed_at: Date;
  lat: number;
  lon: number;
  source_type: string;
  source_name: string | null;
  confidence: string;
  notes: string | null;
};

const KNOWN_SOURCE_TYPES = new Set<SourceType>([
  "ais",
  "manual_osint",
  "official_release",
  "news",
  "port_sighting",
  "satellite",
  "analyst_estimate",
]);

function coerceSourceType(value: string): SourceType {
  return KNOWN_SOURCE_TYPES.has(value as SourceType)
    ? (value as SourceType)
    : "analyst_estimate";
}

export async function recomputeForVessel(vesselId: string): Promise<boolean> {
  const latest = await pool.query<LatestObservationRow>(
    `SELECT id, observed_at, lat, lon, source_type, source_name, confidence, notes
       FROM observations
      WHERE vessel_id = $1
        AND lat IS NOT NULL
        AND lon IS NOT NULL
      ORDER BY observed_at DESC
      LIMIT 1`,
    [vesselId],
  );

  const obs = latest.rows[0];
  if (!obs) return false;

  const observedAtMs = new Date(obs.observed_at).getTime();
  const ageMinutes = Math.max(0, Math.round((Date.now() - observedAtMs) / 60_000));
  const ageHours = ageMinutes / 60;
  const status = deriveTrackStatus(coerceSourceType(obs.source_type), ageMinutes);
  const decayed = decayConfidence(Number(obs.confidence), ageHours);
  const summary = obs.notes ?? `Last observation from ${obs.source_type}`;

  await pool.query(
    `INSERT INTO current_positions (
       vessel_id, observation_id, observed_at, location, lat, lon,
       source_type, source_name, confidence, status, age_minutes, summary
     )
     VALUES (
       $1, $2, $3,
       ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography,
       $4, $5,
       $6, $7, $8, $9, $10, $11
     )
     ON CONFLICT (vessel_id) DO UPDATE SET
       observation_id = EXCLUDED.observation_id,
       observed_at = EXCLUDED.observed_at,
       location = EXCLUDED.location,
       lat = EXCLUDED.lat,
       lon = EXCLUDED.lon,
       source_type = EXCLUDED.source_type,
       source_name = EXCLUDED.source_name,
       confidence = EXCLUDED.confidence,
       status = EXCLUDED.status,
       age_minutes = EXCLUDED.age_minutes,
       summary = EXCLUDED.summary,
       updated_at = now()`,
    [
      vesselId,
      Number(obs.id),
      new Date(obs.observed_at).toISOString(),
      obs.lat,
      obs.lon,
      obs.source_type,
      obs.source_name,
      decayed,
      status,
      ageMinutes,
      summary,
    ],
  );

  return true;
}

export async function recomputeForVessels(vesselIds: Iterable<string>): Promise<number> {
  let updated = 0;
  for (const id of vesselIds) {
    if (await recomputeForVessel(id)) updated++;
  }
  return updated;
}
