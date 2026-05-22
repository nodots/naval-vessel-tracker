import type { AisMessage } from "../services/ingest.js";
import type { AisSource } from "./types.js";

const TOKEN_URL = "https://id.barentswatch.no/connect/token";
// modelType=Simple returns flat NDJSON (one JSON object per line) and never
// terminates the response — it streams positions continuously until you
// close the connection. Do NOT call res.json() on it.
const COMBINED_URL = "https://live.ais.barentswatch.no/v1/combined?modelType=Simple";
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const MAX_BUFFER = 10_000;
const RECONNECT_BACKOFF_MS = 5_000;

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type RawPosition = {
  mmsi?: number;
  latitude?: number;
  longitude?: number;
  msgtime?: string;
  courseOverGround?: number | null;
  speedOverGround?: number | null;
  trueHeading?: number | null;
  name?: string | null;
  shipType?: number | null;
};

export class BarentsWatchSource implements AisSource {
  readonly name = "barentswatch.no";
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private buffer: AisMessage[] = [];
  private droppedSinceLastPoll = 0;
  private streamController: AbortController | null = null;
  private streamPromise: Promise<void> | null = null;
  private shuttingDown = false;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  async connect(): Promise<void> {
    await this.ensureToken();
    this.startStream();
  }

  async close(): Promise<void> {
    this.shuttingDown = true;
    this.streamController?.abort();
    this.streamController = null;
    this.streamPromise = null;
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async poll(): Promise<AisMessage[]> {
    if (!this.streamPromise && !this.shuttingDown) {
      await this.ensureToken();
      this.startStream();
    }
    const drained = this.buffer;
    this.buffer = [];
    if (this.droppedSinceLastPoll > 0) {
      console.warn(
        `[barentswatch] dropped ${this.droppedSinceLastPoll} messages this window (buffer overflow)`,
      );
      this.droppedSinceLastPoll = 0;
    }
    return drained;
  }

  private startStream(): void {
    const controller = new AbortController();
    this.streamController = controller;
    this.streamPromise = this.streamLoop(controller.signal)
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[barentswatch] stream ended: ${message}`);
      })
      .finally(() => {
        if (this.streamController === controller) {
          this.streamController = null;
          this.streamPromise = null;
        }
        if (!this.shuttingDown) {
          setTimeout(() => {
            if (!this.shuttingDown && !this.streamPromise) {
              console.log("[barentswatch] reconnecting...");
              this.startStream();
            }
          }, RECONNECT_BACKOFF_MS);
        }
      });
  }

  private async streamLoop(signal: AbortSignal): Promise<void> {
    await this.ensureToken();
    const res = await fetch(COMBINED_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ Downsample: true }),
      signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`barentswatch /v1/combined ${res.status}: ${detail.slice(0, 200)}`);
    }
    if (!res.body) {
      throw new Error("barentswatch /v1/combined returned no body");
    }

    console.log("[barentswatch] stream connected");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, idx).trim();
        pending = pending.slice(idx + 1);
        if (line.length === 0) continue;
        this.handleLine(line);
      }
    }
  }

  private handleLine(line: string): void {
    let obj: RawPosition;
    try {
      obj = JSON.parse(line) as RawPosition;
    } catch {
      return;
    }
    const msg = this.normalize(obj);
    if (!msg) return;
    if (this.buffer.length >= MAX_BUFFER) {
      this.buffer.shift();
      this.droppedSinceLastPoll++;
    }
    this.buffer.push(msg);
  }

  private normalize(obj: RawPosition): AisMessage | null {
    if (typeof obj.mmsi !== "number") return null;
    if (typeof obj.latitude !== "number" || typeof obj.longitude !== "number") return null;
    const observedAt = obj.msgtime ? new Date(obj.msgtime) : new Date();
    if (Number.isNaN(observedAt.getTime())) return null;
    return {
      mmsi: String(obj.mmsi),
      observedAt,
      lat: obj.latitude,
      lon: obj.longitude,
      speedKnots: typeof obj.speedOverGround === "number" ? obj.speedOverGround : null,
      courseDeg: typeof obj.courseOverGround === "number" ? obj.courseOverGround : null,
      headingDeg: typeof obj.trueHeading === "number" ? obj.trueHeading : null,
      rawPayload: obj,
    };
  }

  private async ensureToken(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiresAt - TOKEN_REFRESH_BUFFER_MS) {
      return;
    }
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: this.clientId,
      client_secret: this.clientSecret,
      scope: "ais",
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`barentswatch token request ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as TokenResponse;
    if (!json.access_token || !json.expires_in) {
      throw new Error("barentswatch token response missing access_token or expires_in");
    }
    this.token = json.access_token;
    this.tokenExpiresAt = Date.now() + json.expires_in * 1000;
  }
}
