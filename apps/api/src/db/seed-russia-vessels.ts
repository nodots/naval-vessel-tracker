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

const RUSSIA_VESSELS: Array<Omit<NewVessel, "normalizedName">> = [
  {
    name: "Pyotr Velikiy",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "cruiser",
    className: "Kirov-class (Project 1144) nuclear-powered battlecruiser",
    pennantNumber: "099",
    homePort: "Severomorsk",
    notes: "Northern Fleet flagship",
  },
  {
    name: "Admiral Nakhimov",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "cruiser",
    className: "Kirov-class (Project 1144) nuclear-powered battlecruiser",
    pennantNumber: "080",
    homePort: "Severomorsk",
    notes: "Long-running modernization at Sevmash",
  },
  {
    name: "Marshal Ustinov",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "cruiser",
    className: "Slava-class (Project 1164)",
    pennantNumber: "055",
    homePort: "Severomorsk",
    notes: "Northern Fleet",
  },
  {
    name: "Varyag",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "cruiser",
    className: "Slava-class (Project 1164)",
    pennantNumber: "011",
    homePort: "Vladivostok",
    notes: "Pacific Fleet flagship",
  },
  {
    name: "Admiral Gorshkov",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "frigate",
    className: "Admiral Gorshkov-class (Project 22350)",
    pennantNumber: "454",
    homePort: "Severomorsk",
    notes: "Lead ship of the class; Tsirkon and Kalibr-capable",
  },
  {
    name: "Admiral Kasatonov",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "frigate",
    className: "Admiral Gorshkov-class (Project 22350)",
    pennantNumber: "461",
    homePort: "Severomorsk",
  },
  {
    name: "Admiral Essen",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "frigate",
    className: "Admiral Grigorovich-class (Project 11356R)",
    pennantNumber: "751",
    homePort: "Sevastopol",
    notes: "Black Sea Fleet",
  },
  {
    name: "Admiral Makarov",
    country: "RU",
    navy: "Russian Navy",
    vesselType: "frigate",
    className: "Admiral Grigorovich-class (Project 11356R)",
    pennantNumber: "799",
    homePort: "Sevastopol",
    notes: "Black Sea Fleet",
  },
];

async function main(): Promise<void> {
  console.log(`[seed-russia-vessels] seeding ${RUSSIA_VESSELS.length} vessels`);

  let inserted = 0;
  let skipped = 0;

  for (const v of RUSSIA_VESSELS) {
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

  console.log(`[seed-russia-vessels] inserted=${inserted} skipped=${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed-russia-vessels] failed", err);
  process.exit(1);
});
