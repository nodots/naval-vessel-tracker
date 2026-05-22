import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  type SourceType,
  decayConfidence,
  deriveTrackStatus,
} from "@naval-tracker/shared";
import { db } from "../db/client.js";
import { observations, vessels } from "../db/schema.js";

type RecomputeResult =
  | { kind: "updated"; observationId: number; status: string; ageMinutes: number; confidence: number }
  | { kind: "no_observations" };

const KNOWN_SOURCE_TYPES: ReadonlySet<SourceType> = new Set<SourceType>([
  "ais",
  "manual_osint",
  "official_release",
  "news",
  "port_sighting",
  "satellite",
  "analyst_estimate",
]);

function asSourceType(value: string): SourceType {
  // Treat anything we don't know as analyst_estimate — deriveTrackStatus maps it to "estimated"
  return KNOWN_SOURCE_TYPES.has(value as SourceType)
    ? (value as SourceType)
    : "analyst_estimate";
}

export async function recomputeForVessel(vesselId: string): Promise<RecomputeResult> {
  const latest = await db
    .select({
      id: observations.id,
      observedAt: observations.observedAt,
      lat: observations.lat,
      lon: observations.lon,
      sourceType: observations.sourceType,
      sourceName: observations.sourceName,
      confidence: observations.confidence,
      notes: observations.notes,
    })
    .from(observations)
    .where(
      and(
        eq(observations.vesselId, vesselId),
        isNotNull(observations.lat),
        isNotNull(observations.lon),
      ),
    )
    .orderBy(desc(observations.observedAt))
    .limit(1);

  const o = latest[0];
  if (!o || o.lat === null || o.lon === null) {
    return { kind: "no_observations" };
  }

  const observedAt = new Date(o.observedAt);
  const ageMinutes = Math.max(0, Math.round((Date.now() - observedAt.getTime()) / 60_000));
  const ageHours = ageMinutes / 60;
  const status = deriveTrackStatus(asSourceType(o.sourceType), ageMinutes);
  const decayed = decayConfidence(Number(o.confidence), ageHours);
  const summary = o.notes ?? `Last observation from ${o.sourceType}`;

  await db.execute(sql`
    INSERT INTO current_positions (
      vessel_id, observation_id, observed_at, location, lat, lon,
      source_type, source_name, confidence, status, age_minutes, summary
    )
    VALUES (
      ${vesselId}, ${o.id}, ${observedAt.toISOString()},
      ST_SetSRID(ST_MakePoint(${o.lon}, ${o.lat}), 4326)::geography,
      ${o.lat}, ${o.lon},
      ${o.sourceType}, ${o.sourceName}, ${decayed},
      ${status}, ${ageMinutes}, ${summary}
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
      updated_at = now()
  `);

  return {
    kind: "updated",
    observationId: o.id,
    status,
    ageMinutes,
    confidence: decayed,
  };
}

export async function recomputeAll(): Promise<{ updated: number; skipped: number }> {
  const ids = await db.select({ id: vessels.id }).from(vessels);
  let updated = 0;
  let skipped = 0;
  for (const v of ids) {
    const result = await recomputeForVessel(v.id);
    if (result.kind === "updated") updated++;
    else skipped++;
  }
  return { updated, skipped };
}
