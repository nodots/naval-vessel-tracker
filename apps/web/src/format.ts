import type { TrackStatus } from "@naval-tracker/shared";

export const STATUS_COLORS: Record<TrackStatus, string> = {
  live_ais: "#4ade80",
  recent_ais: "#facc15",
  stale_ais: "#fb923c",
  osint_sighting: "#60a5fa",
  estimated: "#c084fc",
  dark: "#ef4444",
  unknown: "#9ca3af",
};

const STATUS_LABELS: Record<TrackStatus, string> = {
  live_ais: "Live AIS",
  recent_ais: "Recent AIS",
  stale_ais: "Stale AIS",
  osint_sighting: "OSINT sighting",
  estimated: "Estimated",
  dark: "Dark",
  unknown: "Unknown",
};

export function statusLabel(status: TrackStatus): string {
  return STATUS_LABELS[status];
}

export function vesselTypeLabel(t: string): string {
  return t
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ageLabel(ageMinutes: number): string {
  if (ageMinutes < 1) return "just now";
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const hours = ageMinutes / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const days = hours / 24;
  if (days < 60) return `${Math.round(days)}d ago`;
  const months = days / 30;
  return `${Math.round(months)}mo ago`;
}
