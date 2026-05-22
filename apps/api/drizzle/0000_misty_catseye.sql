CREATE TABLE "current_positions" (
	"vessel_id" uuid PRIMARY KEY NOT NULL,
	"observation_id" bigint,
	"observed_at" timestamp with time zone NOT NULL,
	"location" geography(point, 4326) NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"speed_knots" numeric,
	"course_deg" numeric,
	"heading_deg" numeric,
	"source_type" text NOT NULL,
	"source_name" text,
	"confidence" numeric NOT NULL,
	"status" text NOT NULL,
	"age_minutes" integer NOT NULL,
	"summary" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"message" text,
	"records_seen" integer DEFAULT 0,
	"records_inserted" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"vessel_id" uuid,
	"observed_at" timestamp with time zone NOT NULL,
	"location" geography(point, 4326),
	"lat" double precision,
	"lon" double precision,
	"speed_knots" numeric,
	"course_deg" numeric,
	"heading_deg" numeric,
	"source_type" text NOT NULL,
	"source_name" text,
	"source_url" text,
	"confidence" numeric DEFAULT '0.5' NOT NULL,
	"raw_payload" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observations_confidence_range" CHECK ("observations"."confidence" >= 0 AND "observations"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "ports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"location" geography(point, 4326) NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"port_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region_type" text NOT NULL,
	"boundary" geography(polygon, 4326),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vessels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"country" text NOT NULL,
	"navy" text,
	"vessel_type" text NOT NULL,
	"class_name" text,
	"pennant_number" text,
	"mmsi" text,
	"imo" text,
	"call_sign" text,
	"home_port" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "current_positions" ADD CONSTRAINT "current_positions_observation_id_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_vessel_id_vessels_id_fk" FOREIGN KEY ("vessel_id") REFERENCES "public"."vessels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_current_positions_location" ON "current_positions" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_current_positions_status" ON "current_positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_observations_location" ON "observations" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_observations_vessel_time" ON "observations" USING btree ("vessel_id","observed_at" DESC);--> statement-breakpoint
CREATE INDEX "idx_observations_source_type" ON "observations" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_observations_raw_payload" ON "observations" USING gin ("raw_payload");--> statement-breakpoint
CREATE INDEX "idx_ports_location" ON "ports" USING gist ("location");--> statement-breakpoint
CREATE INDEX "idx_regions_boundary" ON "regions" USING gist ("boundary");--> statement-breakpoint
CREATE INDEX "idx_vessels_name" ON "vessels" USING gin (to_tsvector('english', "name"));--> statement-breakpoint
CREATE INDEX "idx_vessels_mmsi" ON "vessels" USING btree ("mmsi");--> statement-breakpoint
CREATE INDEX "idx_vessels_country" ON "vessels" USING btree ("country");--> statement-breakpoint
CREATE INDEX "idx_vessels_type" ON "vessels" USING btree ("vessel_type");