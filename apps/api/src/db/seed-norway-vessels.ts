import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, pool } from "./client.js";
import { vessels, type NewVessel } from "./schema.js";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Real, currently-broadcasting MMSIs observed in the BarentsWatch stream.
// These vessels are routinely visible in Norwegian waters and Svalbard, so
// the worker will start matching and inserting observations within one tick.
const NORWAY_VESSELS: Array<Omit<NewVessel, "normalizedName">> = [
  {
    name: "KV Svalbard",
    country: "NO",
    navy: "Norwegian Coast Guard",
    vesselType: "other",
    className: "Svalbard-class",
    pennantNumber: "W303",
    mmsi: "259040000",
    imo: "8640387",
    callSign: "LBSV",
    homePort: "Sortland",
    notes: "Arctic icebreaker; Norwegian Coast Guard flagship",
  },
  {
    name: "KV Jan Mayen",
    country: "NO",
    navy: "Norwegian Coast Guard",
    vesselType: "other",
    className: "Jan Mayen-class",
    mmsi: "257984000",
    homePort: "Sortland",
    notes: "Jan Mayen-class offshore patrol vessel",
  },
  {
    name: "KV Bison",
    country: "NO",
    navy: "Norwegian Coast Guard",
    vesselType: "other",
    className: "Barentshav-class",
    mmsi: "257934000",
    homePort: "Sortland",
    notes: "Barentshav-class offshore patrol vessel",
  },
  {
    name: "KNM Magnus Lagaboete",
    country: "NO",
    navy: "Royal Norwegian Navy",
    vesselType: "support_ship",
    className: "Joint Logistics Support Vessel",
    pennantNumber: "A537",
    mmsi: "258592000",
    homePort: "Haakonsvern",
    notes: "Fleet logistics support ship",
  },
  {
    name: "KNM Sovikneset",
    country: "NO",
    navy: "Royal Norwegian Navy",
    vesselType: "other",
    mmsi: "257147200",
    notes: "Royal Norwegian Navy auxiliary",
  },
];

async function main(): Promise<void> {
  console.log(`[seed-norway-vessels] seeding ${NORWAY_VESSELS.length} vessels`);

  let inserted = 0;
  let skipped = 0;

  for (const v of NORWAY_VESSELS) {
    const normalizedName = normalize(v.name);
    const existing = await db
      .select({ id: vessels.id })
      .from(vessels)
      .where(eq(vessels.normalizedName, normalizedName))
      .limit(1);

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await db.insert(vessels).values({ ...v, normalizedName });
    inserted++;
  }

  console.log(`[seed-norway-vessels] inserted=${inserted} skipped=${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-norway-vessels] failed", err);
  process.exit(1);
});
