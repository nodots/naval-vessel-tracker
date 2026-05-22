import WebSocket from "ws";
import type { AisMessage } from "../services/ingest.js";
import type { AisSource } from "./types.js";

const AISSTREAM_URL = "wss://stream.aisstream.io/v0/stream";

type PositionReportEnvelope = {
  MessageType?: string;
  MetaData?: {
    MMSI?: number | string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: {
      Sog?: number;
      Cog?: number;
      TrueHeading?: number;
    };
  };
};

export class AisStreamSource implements AisSource {
  readonly name = "aisstream.io";
  private ws: WebSocket | null = null;
  private buffer: AisMessage[] = [];

  constructor(
    private readonly apiKey: string,
    private readonly mmsiAllowlist: string[],
  ) {}

  async connect(): Promise<void> {
    if (!this.apiKey) {
      throw new Error("AISSTREAM_API_KEY is required to use the aisstream.io source");
    }

    const ws = new WebSocket(AISSTREAM_URL);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.off("error", onError);
        const subscription = {
          APIKey: this.apiKey,
          BoundingBoxes: [
            [
              [-90, -180],
              [90, 180],
            ],
          ],
          FiltersShipMMSI: this.mmsiAllowlist,
          FilterMessageTypes: ["PositionReport"],
        };
        ws.send(JSON.stringify(subscription));
        resolve();
      };
      const onError = (err: Error) => {
        ws.off("open", onOpen);
        reject(err);
      };
      ws.once("open", onOpen);
      ws.once("error", onError);
    });

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as PositionReportEnvelope;
        const m = this.normalize(parsed);
        if (m) this.buffer.push(m);
      } catch (err) {
        console.warn("[aisstream] parse failed", err);
      }
    });

    ws.on("error", (err) => {
      console.warn("[aisstream] socket error", err);
    });

    ws.on("close", () => {
      console.warn("[aisstream] socket closed");
    });
  }

  async poll(): Promise<AisMessage[]> {
    const drained = this.buffer;
    this.buffer = [];
    return drained;
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private normalize(env: PositionReportEnvelope): AisMessage | null {
    if (env.MessageType !== "PositionReport") return null;
    const meta = env.MetaData;
    const pos = env.Message?.PositionReport;
    if (!meta || !pos) return null;
    if (typeof meta.latitude !== "number" || typeof meta.longitude !== "number") return null;
    if (meta.MMSI === undefined) return null;

    const observedAt = meta.time_utc ? new Date(meta.time_utc) : new Date();
    if (Number.isNaN(observedAt.getTime())) return null;

    return {
      mmsi: String(meta.MMSI),
      observedAt,
      lat: meta.latitude,
      lon: meta.longitude,
      speedKnots: typeof pos.Sog === "number" ? pos.Sog : null,
      courseDeg: typeof pos.Cog === "number" ? pos.Cog : null,
      headingDeg: typeof pos.TrueHeading === "number" ? pos.TrueHeading : null,
      rawPayload: env,
    };
  }
}
