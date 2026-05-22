import { type Request, type Response, Router } from "express";
import { eq, sql } from "drizzle-orm";
import type { CreateObservationRequest, Observation } from "@naval-tracker/shared";
import { db } from "../db/client.js";
import { observations, vessels } from "../db/schema.js";
import { recomputeAll, recomputeForVessel } from "../services/recompute.js";

const ALLOWED_SOURCE_TYPES: ReadonlySet<CreateObservationRequest["sourceType"]> =
  new Set(["manual_osint", "official_release", "news", "port_sighting", "satellite"]);

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type ValidationError = { field: string; message: string };

function validate(body: unknown): { ok: true; value: CreateObservationRequest } | { ok: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: [{ field: "body", message: "expected an object" }] };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.vesselId !== "string" || b.vesselId.length === 0) {
    errors.push({ field: "vesselId", message: "required string" });
  }
  if (typeof b.observedAt !== "string") {
    errors.push({ field: "observedAt", message: "required ISO timestamp" });
  } else {
    const t = Date.parse(b.observedAt);
    if (Number.isNaN(t)) errors.push({ field: "observedAt", message: "could not parse" });
    else if (t - Date.now() > FUTURE_TOLERANCE_MS) errors.push({ field: "observedAt", message: "too far in the future" });
  }
  if (typeof b.lat !== "number" || !Number.isFinite(b.lat) || b.lat < -90 || b.lat > 90) {
    errors.push({ field: "lat", message: "must be a number in [-90, 90]" });
  }
  if (typeof b.lon !== "number" || !Number.isFinite(b.lon) || b.lon < -180 || b.lon > 180) {
    errors.push({ field: "lon", message: "must be a number in [-180, 180]" });
  }
  if (typeof b.sourceType !== "string" || !ALLOWED_SOURCE_TYPES.has(b.sourceType as CreateObservationRequest["sourceType"])) {
    errors.push({ field: "sourceType", message: `must be one of ${[...ALLOWED_SOURCE_TYPES].join(", ")}` });
  }
  if (typeof b.confidence !== "number" || !Number.isFinite(b.confidence) || b.confidence < 0 || b.confidence > 1) {
    errors.push({ field: "confidence", message: "must be a number in [0, 1]" });
  }
  for (const optional of ["sourceName", "sourceUrl", "notes"] as const) {
    if (b[optional] !== undefined && typeof b[optional] !== "string") {
      errors.push({ field: optional, message: "must be a string if provided" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: b as unknown as CreateObservationRequest };
}

export const adminRouter = Router();

adminRouter.post("/observations", async (req: Request, res: Response) => {
  const validation = validate(req.body);
  if (!validation.ok) {
    res.status(400).json({ error: "validation_failed", details: validation.errors });
    return;
  }
  const r = validation.value;

  const vessel = await db
    .select({ id: vessels.id })
    .from(vessels)
    .where(eq(vessels.id, r.vesselId))
    .limit(1);
  if (vessel.length === 0) {
    res.status(404).json({ error: "vessel_not_found", vesselId: r.vesselId });
    return;
  }

  const inserted = await db.execute<{
    id: number;
    vessel_id: string;
    observed_at: string | Date;
    lat: number | null;
    lon: number | null;
    speed_knots: string | null;
    course_deg: string | null;
    heading_deg: string | null;
    source_type: string;
    source_name: string | null;
    source_url: string | null;
    confidence: string;
    notes: string | null;
    created_at: string | Date;
  }>(sql`
    INSERT INTO observations (
      vessel_id, observed_at, location, lat, lon,
      source_type, source_name, source_url, confidence, notes
    )
    VALUES (
      ${r.vesselId}, ${r.observedAt},
      ST_SetSRID(ST_MakePoint(${r.lon}, ${r.lat}), 4326)::geography,
      ${r.lat}, ${r.lon},
      ${r.sourceType}, ${r.sourceName ?? null}, ${r.sourceUrl ?? null},
      ${r.confidence}, ${r.notes ?? null}
    )
    RETURNING *
  `);

  const row = inserted.rows[0];
  if (!row) {
    res.status(500).json({ error: "insert_failed" });
    return;
  }

  const recompute = await recomputeForVessel(r.vesselId);

  const observation: Observation = {
    id: row.id,
    vesselId: row.vessel_id,
    observedAt: new Date(row.observed_at).toISOString(),
    lat: row.lat,
    lon: row.lon,
    speedKnots: row.speed_knots === null ? null : Number(row.speed_knots),
    courseDeg: row.course_deg === null ? null : Number(row.course_deg),
    headingDeg: row.heading_deg === null ? null : Number(row.heading_deg),
    sourceType: row.source_type,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    confidence: Number(row.confidence),
    notes: row.notes,
    createdAt: new Date(row.created_at).toISOString(),
  };

  res.status(201).json({ observation, recompute });
});

adminRouter.post("/recompute-current-positions", async (_req: Request, res: Response) => {
  const { updated, skipped } = await recomputeAll();
  res.json({ updated, skipped });
});
