import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { vessels } from "./schema.js";

// Synthetic MMSIs in the 999xxxxxx test range — NOT real-world values.
// Real naval MMSIs are largely undisclosed; these exist solely so the mock
// AIS source has known identifiers to match against curated vessels.
const MMSI_MAP: Array<{ normalizedName: string; mmsi: string }> = [
  { normalizedName: "uss-gerald-r-ford", mmsi: "999000001" },
  { normalizedName: "uss-carl-vinson", mmsi: "999000002" },
  { normalizedName: "uss-ronald-reagan", mmsi: "999000003" },
  { normalizedName: "hms-queen-elizabeth", mmsi: "999000004" },
  { normalizedName: "charles-de-gaulle", mmsi: "999000005" },
  { normalizedName: "js-izumo", mmsi: "999000006" },
  { normalizedName: "ins-vikrant", mmsi: "999000007" },
];

async function main(): Promise<void> {
  console.log(`[seed-mmsi] setting MMSI on ${MMSI_MAP.length} vessels`);

  let updated = 0;
  let missing = 0;

  for (const m of MMSI_MAP) {
    const result = await db
      .update(vessels)
      .set({ mmsi: m.mmsi, updatedAt: sql`now()` })
      .where(eq(vessels.normalizedName, m.normalizedName))
      .returning({ id: vessels.id });

    if (result.length === 0) {
      console.warn(`[seed-mmsi] missing vessel normalized_name=${m.normalizedName}`);
      missing++;
    } else {
      updated++;
    }
  }

  console.log(`[seed-mmsi] updated=${updated} missing=${missing}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-mmsi] failed", err);
  process.exit(1);
});
