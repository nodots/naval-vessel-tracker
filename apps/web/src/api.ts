import type {
  CreateObservationRequest,
  MapVesselMarker,
  Observation,
  VesselDetail,
  VesselListResponse,
} from "@naval-tracker/shared";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6732/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let body: unknown = undefined;
    try {
      body = await res.json();
    } catch {
      // Response body wasn't JSON; leave body undefined.
    }
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`api error ${status}`);
  }
}

export function fetchMapVessels(signal?: AbortSignal): Promise<MapVesselMarker[]> {
  return request<MapVesselMarker[]>("/map/vessels", { signal });
}

export function fetchVessels(params: { q?: string; limit?: number } = {}): Promise<VesselListResponse> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  const suffix = qs.toString().length > 0 ? `?${qs.toString()}` : "";
  return request<VesselListResponse>(`/vessels${suffix}`);
}

export function fetchVessel(id: string, signal?: AbortSignal): Promise<VesselDetail> {
  return request<VesselDetail>(`/vessels/${encodeURIComponent(id)}`, { signal });
}

type CreateObservationResponse = {
  observation: Observation;
  recompute:
    | { kind: "updated"; observationId: number; status: string; ageMinutes: number; confidence: number }
    | { kind: "no_observations" };
};

export function createObservation(body: CreateObservationRequest): Promise<CreateObservationResponse> {
  return request<CreateObservationResponse>("/admin/observations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
