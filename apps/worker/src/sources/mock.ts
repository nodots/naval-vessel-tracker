import type { AisMessage } from "../services/ingest.js";
import type { AisSource } from "./types.js";

type MockBase = { mmsi: string; lat: number; lon: number };

// Bases for the MMSI'd vessels — roughly aligned with seed-positions.ts so
// the mock data looks coherent next to the manually seeded positions.
const BASES: MockBase[] = [
  { mmsi: "999000001", lat: 33.5, lon: 32.0 },     // USS Gerald R. Ford (E. Med)
  { mmsi: "999000002", lat: 35.29, lon: 139.665 }, // USS Carl Vinson (Yokosuka)
  { mmsi: "999000003", lat: 35.29, lon: 139.67 },  // USS Ronald Reagan (Yokosuka)
  { mmsi: "999000004", lat: 50.812, lon: -1.09 },  // HMS Queen Elizabeth (Portsmouth)
  { mmsi: "999000005", lat: 43.107, lon: 5.917 },  // Charles de Gaulle (Toulon)
  { mmsi: "999000006", lat: 35.286, lon: 139.668 },// JS Izumo (Yokosuka)
  { mmsi: "999000007", lat: 14.792, lon: 74.124 }, // INS Vikrant (Karwar)
];

const JITTER_DEG = 0.05;
const BROADCAST_PROBABILITY = 0.6;

function jitter(): number {
  return (Math.random() - 0.5) * 2 * JITTER_DEG;
}

export class MockAisSource implements AisSource {
  readonly name = "mock";

  async connect(): Promise<void> {
    // No-op — mock generates on demand.
  }

  async poll(): Promise<AisMessage[]> {
    const out: AisMessage[] = [];
    const now = new Date();
    for (const base of BASES) {
      if (Math.random() > BROADCAST_PROBABILITY) continue;
      const lat = base.lat + jitter();
      const lon = base.lon + jitter();
      const speedKnots = Number((Math.random() * 25).toFixed(1));
      const courseDeg = Number((Math.random() * 360).toFixed(1));
      out.push({
        mmsi: base.mmsi,
        observedAt: now,
        lat,
        lon,
        speedKnots,
        courseDeg,
        headingDeg: courseDeg,
        rawPayload: {
          source: "mock",
          mmsi: base.mmsi,
          lat,
          lon,
          speedKnots,
          courseDeg,
          time_utc: now.toISOString(),
        },
      });
    }
    return out;
  }

  async close(): Promise<void> {
    // No-op.
  }
}
