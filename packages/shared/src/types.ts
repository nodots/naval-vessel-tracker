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

export type CurrentPositionSummary = {
  lat: number;
  lon: number;
  observedAt: string;
  sourceType: SourceType;
  confidence: number;
  status: TrackStatus;
  ageMinutes: number;
};

export type VesselListItem = {
  id: string;
  name: string;
  country: string;
  vesselType: string;
  className?: string;
  pennantNumber?: string;
  mmsi?: string;
  currentPosition?: CurrentPositionSummary;
};

export type Vessel = VesselListItem & {
  navy?: string;
  imo?: string;
  callSign?: string;
  homePort?: string;
  active: boolean;
  notes?: string;
};

export type VesselListQuery = {
  q?: string;
  country?: string;
  type?: string;
  status?: TrackStatus;
  limit?: number;
  offset?: number;
};

export type VesselListResponse = {
  items: VesselListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type MapVesselMarker = {
  vesselId: string;
  name: string;
  country: string;
  vesselType: string;
  lat: number;
  lon: number;
  observedAt: string;
  confidence: number;
  status: TrackStatus;
  sourceType: string;
  ageMinutes: number;
};
