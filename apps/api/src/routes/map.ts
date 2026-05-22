import { type Request, type Response, Router } from "express";
import { sql } from "drizzle-orm";
import type { MapVesselMarker, TrackStatus } from "@naval-tracker/shared";
import { db } from "../db/client.js";

type Row = {
  vessel_id: string;
  name: string;
  country: string;
  vessel_type: string;
  lat: number;
  lon: number;
  observed_at: string | Date;
  confidence: string;
  status: string;
  source_type: string;
  age_minutes: number;
};

export const mapRouter = Router();

mapRouter.get("/vessels", async (_req: Request, res: Response) => {
  const result = await db.execute<Row>(sql`
    SELECT
      cp.vessel_id,
      v.name,
      v.country,
      v.vessel_type,
      cp.lat,
      cp.lon,
      cp.observed_at,
      cp.confidence,
      cp.status,
      cp.source_type,
      GREATEST(0, EXTRACT(EPOCH FROM (now() - cp.observed_at)) / 60)::int AS age_minutes
    FROM current_positions cp
    JOIN vessels v ON v.id = cp.vessel_id
    ORDER BY v.country, v.name
  `);

  const markers: MapVesselMarker[] = result.rows.map((r) => ({
    vesselId: r.vessel_id,
    name: r.name,
    country: r.country,
    vesselType: r.vessel_type,
    lat: r.lat,
    lon: r.lon,
    observedAt: new Date(r.observed_at).toISOString(),
    confidence: Number(r.confidence),
    status: r.status as TrackStatus,
    sourceType: r.source_type,
    ageMinutes: r.age_minutes,
  }));

  res.json(markers);
});
