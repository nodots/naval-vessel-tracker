import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { vessels } from "./schema.js";

type SeedPosition = {
  vesselNormalized: string;
  lat: number;
  lon: number;
  ageMinutes: number;
  status: string;
  sourceType: string;
  sourceName: string;
  confidence: number;
  summary: string;
};

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const HOURS = 60;
const DAYS = 24 * HOURS;

const POSITIONS: SeedPosition[] = [
  // live_ais (under 30 min)
  { vesselNormalized: normalize("JS Izumo"),           lat: 35.286, lon: 139.668, ageMinutes: 12,        status: "live_ais",       sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.92, summary: "AIS broadcast near Yokosuka" },
  { vesselNormalized: normalize("HMS Queen Elizabeth"),lat: 50.812, lon:  -1.090, ageMinutes: 22,        status: "live_ais",       sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.90, summary: "AIS broadcast at HMNB Portsmouth" },
  { vesselNormalized: normalize("USS Carl Vinson"),    lat: 35.290, lon: 139.665, ageMinutes: 18,        status: "live_ais",       sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.88, summary: "Port call Yokosuka" },

  // recent_ais (30 min - 6 hr)
  { vesselNormalized: normalize("USS Gerald R. Ford"),       lat: 33.50,  lon:  32.00, ageMinutes:  4 * HOURS, status: "recent_ais",     sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.72, summary: "Eastern Mediterranean" },
  { vesselNormalized: normalize("USS Dwight D. Eisenhower"), lat: 36.949, lon: -76.328, ageMinutes:  2 * HOURS, status: "recent_ais",     sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.78, summary: "Naval Station Norfolk" },
  { vesselNormalized: normalize("USS Ronald Reagan"),        lat: 35.290, lon: 139.670, ageMinutes:  3 * HOURS, status: "recent_ais",     sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.75, summary: "Yokosuka pier" },
  { vesselNormalized: normalize("USS Abraham Lincoln"),      lat: 32.694, lon: -117.215, ageMinutes: 5 * HOURS, status: "recent_ais",     sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.70, summary: "NAS North Island" },
  { vesselNormalized: normalize("JS Kaga"),                  lat: 34.231, lon: 132.555, ageMinutes:  1 * HOURS, status: "recent_ais",     sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.82, summary: "Kure naval base" },

  // stale_ais (6 - 48 hr)
  { vesselNormalized: normalize("HMS Prince of Wales"),     lat: 50.810, lon:   -1.092, ageMinutes: 18 * HOURS, status: "stale_ais",      sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.45, summary: "Last AIS at HMNB Portsmouth" },
  { vesselNormalized: normalize("USS Theodore Roosevelt"),  lat: 23.00,  lon: -160.00,  ageMinutes: 30 * HOURS, status: "stale_ais",      sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.40, summary: "Last AIS Pacific west of Hawaii" },
  { vesselNormalized: normalize("USS Harry S. Truman"),     lat: 36.950, lon:  -76.330, ageMinutes: 22 * HOURS, status: "stale_ais",      sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.50, summary: "Last AIS Naval Station Norfolk" },
  { vesselNormalized: normalize("INS Vikramaditya"),        lat: 14.792, lon:   74.124, ageMinutes: 36 * HOURS, status: "stale_ais",      sourceType: "ais",           sourceName: "AIS feed",         confidence: 0.42, summary: "Last AIS at Karwar" },

  // osint_sighting (1 - 30 days, non-AIS)
  { vesselNormalized: normalize("Charles de Gaulle"), lat: 43.107, lon:   5.917, ageMinutes:  2 * DAYS, status: "osint_sighting", sourceType: "port_sighting", sourceName: "Toulon harbor photo",     confidence: 0.70, summary: "Photographed alongside in Toulon" },
  { vesselNormalized: normalize("Liaoning"),          lat: 36.067, lon: 120.380, ageMinutes:  9 * DAYS, status: "osint_sighting", sourceType: "satellite",     sourceName: "open satellite imagery",  confidence: 0.65, summary: "Satellite imagery at Qingdao" },
  { vesselNormalized: normalize("Shandong"),          lat: 18.215, lon: 109.690, ageMinutes:  5 * DAYS, status: "osint_sighting", sourceType: "satellite",     sourceName: "open satellite imagery",  confidence: 0.68, summary: "Satellite imagery at Yulin (Hainan)" },
  { vesselNormalized: normalize("Fujian"),            lat: 31.247, lon: 121.490, ageMinutes: 12 * DAYS, status: "osint_sighting", sourceType: "satellite",     sourceName: "open satellite imagery",  confidence: 0.60, summary: "Reportedly at Jiangnan shipyard" },
  { vesselNormalized: normalize("USS America"),       lat: 33.158, lon: 129.722, ageMinutes:  4 * DAYS, status: "osint_sighting", sourceType: "port_sighting", sourceName: "Sasebo port observation", confidence: 0.72, summary: "Observed alongside at Sasebo" },

  // dark (no recent observation, last seen pierside long ago)
  { vesselNormalized: normalize("Admiral Kuznetsov"),  lat: 69.060, lon: 33.408,  ageMinutes:  90 * DAYS, status: "dark", sourceType: "satellite",      sourceName: "open satellite imagery", confidence: 0.20, summary: "Last seen pierside at Severomorsk; extended refit" },
  { vesselNormalized: normalize("USS John C. Stennis"),lat: 36.985, lon: -76.430, ageMinutes:  60 * DAYS, status: "dark", sourceType: "port_sighting",  sourceName: "Newport News yard photo", confidence: 0.25, summary: "In Refueling and Complex Overhaul at Newport News" },
  { vesselNormalized: normalize("USS Nimitz"),         lat: 47.560, lon: -122.640,ageMinutes: 120 * DAYS, status: "dark", sourceType: "port_sighting",  sourceName: "Bremerton yard photo",    confidence: 0.22, summary: "Pierside at Bremerton" },
];

async function main(): Promise<void> {
  console.log(`[seed-positions] upserting ${POSITIONS.length} current_positions`);

  let upserted = 0;
  let missing = 0;

  for (const p of POSITIONS) {
    const found = await db
      .select({ id: vessels.id })
      .from(vessels)
      .where(eq(vessels.normalizedName, p.vesselNormalized))
      .limit(1);

    const vessel = found[0];
    if (!vessel) {
      console.warn(`[seed-positions] skipped: no vessel with normalized_name=${p.vesselNormalized}`);
      missing++;
      continue;
    }

    await db.execute(sql`
      INSERT INTO current_positions (
        vessel_id, observed_at, location, lat, lon,
        source_type, source_name, confidence, status, age_minutes, summary
      )
      VALUES (
        ${vessel.id},
        now() - (${p.ageMinutes} * interval '1 minute'),
        ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography,
        ${p.lat}, ${p.lon},
        ${p.sourceType}, ${p.sourceName}, ${p.confidence},
        ${p.status}, ${p.ageMinutes}, ${p.summary}
      )
      ON CONFLICT (vessel_id) DO UPDATE SET
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

    upserted++;
  }

  console.log(`[seed-positions] upserted=${upserted} missing=${missing}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-positions] failed", err);
  process.exit(1);
});
