import type { SourceType, TrackStatus } from "./types.js";

const AIS_LIVE_MAX_MIN = 30;
const AIS_RECENT_MAX_MIN = 6 * 60;
const AIS_STALE_MAX_MIN = 48 * 60;

export function deriveTrackStatus(
  sourceType: SourceType,
  ageMinutes: number,
): TrackStatus {
  if (sourceType === "ais") {
    if (ageMinutes <= AIS_LIVE_MAX_MIN) return "live_ais";
    if (ageMinutes <= AIS_RECENT_MAX_MIN) return "recent_ais";
    if (ageMinutes <= AIS_STALE_MAX_MIN) return "stale_ais";
    return "dark";
  }
  // OSINT-sourced observations always show as osint_sighting regardless of
  // age — confidence decay (48h half-life) already represents staleness, and
  // naval movements move on weeks-to-months timescales. `dark` is reserved
  // for vessels we cannot place at all, not for vessels last in the news a
  // few days ago. Diverges from spec §11's 72h cap.
  if (
    sourceType === "manual_osint" ||
    sourceType === "official_release" ||
    sourceType === "news" ||
    sourceType === "port_sighting" ||
    sourceType === "satellite"
  ) {
    return "osint_sighting";
  }
  if (sourceType === "analyst_estimate") return "estimated";
  return "unknown";
}

const DECAY_HALF_LIFE_HOURS = 48;

export function decayConfidence(base: number, ageHours: number): number {
  const decay = Math.exp(-ageHours / DECAY_HALF_LIFE_HOURS);
  return Math.max(0.05, Math.min(1, base * decay));
}
