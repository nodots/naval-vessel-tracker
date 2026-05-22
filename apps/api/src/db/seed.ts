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

const SEED_VESSELS: Array<Omit<NewVessel, "normalizedName">> = [
  // US carriers (Nimitz + Ford class)
  { name: "USS Gerald R. Ford", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Gerald R. Ford-class", pennantNumber: "CVN-78", homePort: "Naval Station Norfolk" },
  { name: "USS Nimitz", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-68", homePort: "Naval Base Kitsap" },
  { name: "USS Dwight D. Eisenhower", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-69", homePort: "Naval Station Norfolk" },
  { name: "USS Carl Vinson", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-70", homePort: "NAS North Island" },
  { name: "USS Theodore Roosevelt", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-71", homePort: "NAS North Island" },
  { name: "USS Abraham Lincoln", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-72", homePort: "NAS North Island" },
  { name: "USS George Washington", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-73", homePort: "Naval Station Norfolk" },
  { name: "USS John C. Stennis", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-74", homePort: "Newport News (refueling)" },
  { name: "USS Harry S. Truman", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-75", homePort: "Naval Station Norfolk" },
  { name: "USS Ronald Reagan", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-76", homePort: "NAS North Island" },
  { name: "USS George H.W. Bush", country: "US", navy: "United States Navy", vesselType: "aircraft_carrier", className: "Nimitz-class", pennantNumber: "CVN-77", homePort: "Naval Station Norfolk" },

  // US amphibious assault ships
  { name: "USS America", country: "US", navy: "United States Navy", vesselType: "amphibious_assault_ship", className: "America-class", pennantNumber: "LHA-6", homePort: "Sasebo" },
  { name: "USS Tripoli", country: "US", navy: "United States Navy", vesselType: "amphibious_assault_ship", className: "America-class", pennantNumber: "LHA-7", homePort: "NAS North Island" },
  { name: "USS Wasp", country: "US", navy: "United States Navy", vesselType: "amphibious_assault_ship", className: "Wasp-class", pennantNumber: "LHD-1", homePort: "Naval Station Norfolk" },

  // UK
  { name: "HMS Queen Elizabeth", country: "UK", navy: "Royal Navy", vesselType: "aircraft_carrier", className: "Queen Elizabeth-class", pennantNumber: "R08", homePort: "HMNB Portsmouth" },
  { name: "HMS Prince of Wales", country: "UK", navy: "Royal Navy", vesselType: "aircraft_carrier", className: "Queen Elizabeth-class", pennantNumber: "R09", homePort: "HMNB Portsmouth" },

  // France
  { name: "Charles de Gaulle", country: "FR", navy: "Marine nationale", vesselType: "aircraft_carrier", className: "Charles de Gaulle-class", pennantNumber: "R91", homePort: "Toulon" },

  // China
  { name: "Liaoning", country: "CN", navy: "PLA Navy", vesselType: "aircraft_carrier", className: "Kuznetsov-class (modified, Type 001)", pennantNumber: "CV-16", homePort: "Qingdao" },
  { name: "Shandong", country: "CN", navy: "PLA Navy", vesselType: "aircraft_carrier", className: "Type 002", pennantNumber: "CV-17", homePort: "Yulin (Hainan)" },
  { name: "Fujian", country: "CN", navy: "PLA Navy", vesselType: "aircraft_carrier", className: "Type 003", pennantNumber: "CV-18", notes: "Sea trials phase" },

  // India
  { name: "INS Vikrant", country: "IN", navy: "Indian Navy", vesselType: "aircraft_carrier", className: "Vikrant-class", pennantNumber: "R11", homePort: "Karwar" },
  { name: "INS Vikramaditya", country: "IN", navy: "Indian Navy", vesselType: "aircraft_carrier", className: "modified Kiev-class", pennantNumber: "R33", homePort: "Karwar" },

  // Japan (officially helicopter destroyers, treated as light carrier / amphib here)
  { name: "JS Izumo", country: "JP", navy: "JMSDF", vesselType: "amphibious_assault_ship", className: "Izumo-class", pennantNumber: "DDH-183", homePort: "Yokosuka", notes: "Helicopter destroyer being converted for F-35B operations" },
  { name: "JS Kaga", country: "JP", navy: "JMSDF", vesselType: "amphibious_assault_ship", className: "Izumo-class", pennantNumber: "DDH-184", homePort: "Kure", notes: "Helicopter destroyer being converted for F-35B operations" },

  // Russia
  { name: "Admiral Kuznetsov", country: "RU", navy: "Russian Navy", vesselType: "aircraft_carrier", className: "Kuznetsov-class", pennantNumber: "063", homePort: "Severomorsk", notes: "In extended refit" },
];

async function main(): Promise<void> {
  console.log(`[seed] seeding ${SEED_VESSELS.length} vessels`);

  let inserted = 0;
  let skipped = 0;

  for (const v of SEED_VESSELS) {
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

  console.log(`[seed] inserted=${inserted} skipped=${skipped}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[seed] failed", err);
  process.exit(1);
});
