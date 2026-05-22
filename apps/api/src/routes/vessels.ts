import { type Request, type Response, Router } from "express";
import { and, asc, count, eq, ilike, type SQL } from "drizzle-orm";
import type {
  CurrentPositionSummary,
  TrackStatus,
  VesselListItem,
  VesselListResponse,
} from "@naval-tracker/shared";
import { db } from "../db/client.js";
import { currentPositions, vessels } from "../db/schema.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(raw: unknown): number {
  if (typeof raw !== "string") return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
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

export const vesselsRouter = Router();

vesselsRouter.get("/", async (req: Request, res: Response) => {
  const q = strParam(req.query.q);
  const country = strParam(req.query.country);
  const type = strParam(req.query.type);
  const status = strParam(req.query.status) as TrackStatus | undefined;
  const limit = parseLimit(req.query.limit);
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

  const items: VesselListItem[] = rows.map((r) => {
    const currentPosition: CurrentPositionSummary | undefined =
      r.cpLat !== null && r.cpLon !== null && r.cpObservedAt !== null
        ? {
            lat: r.cpLat,
            lon: r.cpLon,
            observedAt: r.cpObservedAt.toISOString(),
            sourceType: r.cpSourceType as CurrentPositionSummary["sourceType"],
            confidence: Number(r.cpConfidence),
            status: r.cpStatus as TrackStatus,
            ageMinutes: r.cpAgeMinutes ?? 0,
          }
        : undefined;

    return {
      id: r.id,
      name: r.name,
      country: r.country,
      vesselType: r.vesselType,
      className: r.className ?? undefined,
      pennantNumber: r.pennantNumber ?? undefined,
      mmsi: r.mmsi ?? undefined,
      currentPosition,
    };
  });

  const response: VesselListResponse = { items, total, limit, offset };
  res.json(response);
});
