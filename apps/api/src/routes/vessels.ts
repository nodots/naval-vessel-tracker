import { type Request, type Response, Router } from "express";
import { and, asc, count, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import type {
  CurrentPositionDetail,
  Observation,
  ObservationListResponse,
  SourceType,
  TrackStatus,
  VesselDetail,
  VesselListItem,
  VesselListResponse,
} from "@naval-tracker/shared";
import { db } from "../db/client.js";
import { currentPositions, observations, vessels } from "../db/schema.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const OBSERVATIONS_PAGE_DEFAULT = 25;

function parseLimit(raw: unknown, fallback: number): number {
  if (typeof raw !== "string") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_LIMIT);
}

function parseOffset(raw: unknown): number {
  if (typeof raw !== "string") return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function strParam(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

function parseDate(raw: unknown): Date | undefined {
  if (typeof raw !== "string") return undefined;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? undefined : new Date(t);
}

function toObservation(row: {
  id: number;
  vesselId: string | null;
  observedAt: Date;
  lat: number | null;
  lon: number | null;
  speedKnots: string | null;
  courseDeg: string | null;
  headingDeg: string | null;
  sourceType: string;
  sourceName: string | null;
  sourceUrl: string | null;
  confidence: string;
  notes: string | null;
  createdAt: Date;
}): Observation {
  return {
    id: row.id,
    // Schema allows null vesselId, but every code path that calls this
    // either inserts with a vesselId or filters by vesselId — never null here.
    vesselId: row.vesselId as string,
    observedAt: row.observedAt.toISOString(),
    lat: row.lat,
    lon: row.lon,
    speedKnots: row.speedKnots === null ? null : Number(row.speedKnots),
    courseDeg: row.courseDeg === null ? null : Number(row.courseDeg),
    headingDeg: row.headingDeg === null ? null : Number(row.headingDeg),
    sourceType: row.sourceType,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    confidence: Number(row.confidence),
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  };
}

export const vesselsRouter = Router();

vesselsRouter.get("/", async (req: Request, res: Response) => {
  const q = strParam(req.query.q);
  const country = strParam(req.query.country);
  const type = strParam(req.query.type);
  const status = strParam(req.query.status) as TrackStatus | undefined;
  const limit = parseLimit(req.query.limit, DEFAULT_LIMIT);
  const offset = parseOffset(req.query.offset);

  const conditions: SQL[] = [];
  if (q) conditions.push(ilike(vessels.name, `%${q}%`));
  if (country) conditions.push(eq(vessels.country, country));
  if (type) conditions.push(eq(vessels.vesselType, type));
  if (status) conditions.push(eq(currentPositions.status, status));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: vessels.id,
      name: vessels.name,
      country: vessels.country,
      vesselType: vessels.vesselType,
      className: vessels.className,
      pennantNumber: vessels.pennantNumber,
      mmsi: vessels.mmsi,
      cpLat: currentPositions.lat,
      cpLon: currentPositions.lon,
      cpObservedAt: currentPositions.observedAt,
      cpSourceType: currentPositions.sourceType,
      cpConfidence: currentPositions.confidence,
      cpStatus: currentPositions.status,
      cpAgeMinutes: currentPositions.ageMinutes,
    })
    .from(vessels)
    .leftJoin(currentPositions, eq(currentPositions.vesselId, vessels.id))
    .where(whereClause)
    .orderBy(asc(vessels.country), asc(vessels.name))
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ value: count() })
    .from(vessels)
    .leftJoin(currentPositions, eq(currentPositions.vesselId, vessels.id))
    .where(whereClause);
  const total = totalRows[0]?.value ?? 0;

  const items: VesselListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    vesselType: r.vesselType,
    className: r.className ?? undefined,
    pennantNumber: r.pennantNumber ?? undefined,
    mmsi: r.mmsi ?? undefined,
    currentPosition:
      r.cpLat !== null && r.cpLon !== null && r.cpObservedAt !== null
        ? {
            lat: r.cpLat,
            lon: r.cpLon,
            observedAt: r.cpObservedAt.toISOString(),
            // Stored as text in current_positions; coerced to the union here.
            sourceType: r.cpSourceType as SourceType,
            confidence: Number(r.cpConfidence),
            status: r.cpStatus as TrackStatus,
            ageMinutes: r.cpAgeMinutes ?? 0,
          }
        : undefined,
  }));

  const response: VesselListResponse = { items, total, limit, offset };
  res.json(response);
});

vesselsRouter.get("/:id", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "missing_vessel_id" });
    return;
  }

  const found = await db
    .select()
    .from(vessels)
    .where(eq(vessels.id, id))
    .limit(1);
  const v = found[0];
  if (!v) {
    res.status(404).json({ error: "vessel_not_found", vesselId: id });
    return;
  }

  const cpRows = await db
    .select()
    .from(currentPositions)
    .where(eq(currentPositions.vesselId, id))
    .limit(1);
  const cp = cpRows[0];

  const obsRows = await db
    .select()
    .from(observations)
    .where(eq(observations.vesselId, id))
    .orderBy(desc(observations.observedAt))
    .limit(50);

  const currentPositionDetail: CurrentPositionDetail | undefined = cp
    ? {
        lat: cp.lat,
        lon: cp.lon,
        observedAt: cp.observedAt.toISOString(),
        // Stored as text in current_positions; coerced to the union here.
        sourceType: cp.sourceType as SourceType,
        confidence: Number(cp.confidence),
        status: cp.status as TrackStatus,
        ageMinutes: cp.ageMinutes,
        sourceName: cp.sourceName,
        summary: cp.summary,
      }
    : undefined;

  const detail: VesselDetail = {
    id: v.id,
    name: v.name,
    country: v.country,
    vesselType: v.vesselType,
    className: v.className ?? undefined,
    pennantNumber: v.pennantNumber ?? undefined,
    mmsi: v.mmsi ?? undefined,
    navy: v.navy ?? undefined,
    imo: v.imo ?? undefined,
    callSign: v.callSign ?? undefined,
    homePort: v.homePort ?? undefined,
    active: v.active,
    notes: v.notes ?? undefined,
    currentPosition: currentPositionDetail,
    currentPositionDetail,
    observations: obsRows.map(toObservation),
  };

  res.json(detail);
});

vesselsRouter.get("/:id/observations", async (req: Request, res: Response) => {
  const id = req.params.id;
  if (typeof id !== "string" || id.length === 0) {
    res.status(400).json({ error: "missing_vessel_id" });
    return;
  }
  const sourceType = strParam(req.query.sourceType);
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  const limit = parseLimit(req.query.limit, OBSERVATIONS_PAGE_DEFAULT);
  const offset = parseOffset(req.query.offset);

  const conditions: SQL[] = [eq(observations.vesselId, id)];
  if (sourceType) conditions.push(eq(observations.sourceType, sourceType));
  if (from) conditions.push(gte(observations.observedAt, from));
  if (to) conditions.push(lte(observations.observedAt, to));
  const whereClause = and(...conditions);

  const rows = await db
    .select()
    .from(observations)
    .where(whereClause)
    .orderBy(desc(observations.observedAt))
    .limit(limit)
    .offset(offset);

  const totalRows = await db
    .select({ value: count() })
    .from(observations)
    .where(whereClause);
  const total = totalRows[0]?.value ?? 0;

  const response: ObservationListResponse = {
    items: rows.map(toObservation),
    total,
    limit,
    offset,
  };
  res.json(response);
});
