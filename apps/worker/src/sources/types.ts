import type { AisMessage } from "../services/ingest.js";

export interface AisSource {
  readonly name: string;
  connect(): Promise<void>;
  poll(): Promise<AisMessage[]>;
  close(): Promise<void>;
}
