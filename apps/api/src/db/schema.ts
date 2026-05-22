import { sql } from "drizzle-orm";
import {
  bigserial,
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { geographyPoint, geographyPolygon } from "./types.js";

export const vessels = pgTable(
  "vessels",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    country: text("country").notNull(),
    navy: text("navy"),
    vesselType: text("vessel_type").notNull(),
    className: text("class_name"),
    pennantNumber: text("pennant_number"),
    mmsi: text("mmsi"),
    imo: text("imo"),
    callSign: text("call_sign"),
    homePort: text("home_port"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("idx_vessels_name").using(
      "gin",
      sql`to_tsvector('english', ${table.name})`,
    ),
    index("idx_vessels_mmsi").on(table.mmsi),
    index("idx_vessels_country").on(table.country),
    index("idx_vessels_type").on(table.vesselType),
  ],
);

export const observations = pgTable(
  "observations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    vesselId: uuid("vessel_id").references(() => vessels.id),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    location: geographyPoint("location"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    speedKnots: numeric("speed_knots"),
    courseDeg: numeric("course_deg"),
    headingDeg: numeric("heading_deg"),
    sourceType: text("source_type").notNull(),
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    confidence: numeric("confidence").notNull().default("0.5"),
    rawPayload: jsonb("raw_payload"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("idx_observations_location").using("gist", table.location),
    index("idx_observations_vessel_time").on(
      table.vesselId,
      sql`${table.observedAt} DESC`,
    ),
    index("idx_observations_source_type").on(table.sourceType),
    index("idx_observations_raw_payload").using("gin", table.rawPayload),
    check(
      "observations_confidence_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
);

export const currentPositions = pgTable(
  "current_positions",
  {
    vesselId: uuid("vessel_id")
      .primaryKey()
      .references(() => vessels.id),
    observationId: bigint("observation_id", { mode: "number" }).references(
      () => observations.id,
    ),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    location: geographyPoint("location").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    speedKnots: numeric("speed_knots"),
    courseDeg: numeric("course_deg"),
    headingDeg: numeric("heading_deg"),
    sourceType: text("source_type").notNull(),
    sourceName: text("source_name"),
    confidence: numeric("confidence").notNull(),
    status: text("status").notNull(),
    ageMinutes: integer("age_minutes").notNull(),
    summary: text("summary"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("idx_current_positions_location").using("gist", table.location),
    index("idx_current_positions_status").on(table.status),
  ],
);

export const regions = pgTable(
  "regions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    regionType: text("region_type").notNull(),
    boundary: geographyPolygon("boundary"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("idx_regions_boundary").using("gist", table.boundary)],
);

export const ports = pgTable(
  "ports",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    country: text("country").notNull(),
    location: geographyPoint("location").notNull(),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    portType: text("port_type"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [index("idx_ports_location").using("gist", table.location)],
);

export const ingestionRuns = pgTable("ingestion_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(),
  message: text("message"),
  recordsSeen: integer("records_seen").default(0),
  recordsInserted: integer("records_inserted").default(0),
  recordsSkipped: integer("records_skipped").default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

export type Vessel = typeof vessels.$inferSelect;
export type NewVessel = typeof vessels.$inferInsert;
