export type TrackStatus =
  | "live_ais"
  | "recent_ais"
  | "stale_ais"
  | "osint_sighting"
  | "estimated"
  | "dark"
  | "unknown";

export type SourceType =
  | "ais"
  | "manual_osint"
  | "official_release"
  | "news"
  | "port_sighting"
  | "satellite"
  | "analyst_estimate";

export type VesselType =
  | "aircraft_carrier"
  | "amphibious_assault_ship"
  | "destroyer"
  | "cruiser"
  | "frigate"
  | "submarine_tender"
  | "intelligence_ship"
  | "support_ship"
  | "other";
