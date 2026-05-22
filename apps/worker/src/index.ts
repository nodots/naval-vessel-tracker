import "dotenv/config";
import { pool } from "./db.js";
import { ingestMessage } from "./services/ingest.js";
import { recomputeForVessels } from "./services/recompute.js";
import { finishRun, startRun, type RunStats } from "./services/runs.js";
import { AisStreamSource } from "./sources/aisstream.js";
import { MockAisSource } from "./sources/mock.js";
import type { AisSource } from "./sources/types.js";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 30_000);
const AISSTREAM_ENABLED = process.env.AISSTREAM_ENABLED === "true";

let stopping = false;
let currentSource: AisSource | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCuratedMmsis(): Promise<string[]> {
  const result = await pool.query<{ mmsi: string }>(
    `SELECT mmsi FROM vessels WHERE mmsi IS NOT NULL`,
  );
  return result.rows.map((r) => r.mmsi);
}

async function buildSource(): Promise<AisSource> {
  if (!AISSTREAM_ENABLED) {
    console.log("[worker] AISSTREAM_ENABLED is not true — using mock source");
    return new MockAisSource();
  }
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    throw new Error("AISSTREAM_ENABLED=true but AISSTREAM_API_KEY is not set");
  }
  const mmsiAllowlist = await loadCuratedMmsis();
  if (mmsiAllowlist.length === 0) {
    throw new Error("aisstream source needs curated MMSIs but vessels.mmsi is empty");
  }
  console.log(`[worker] using aisstream.io source (filter: ${mmsiAllowlist.length} MMSIs)`);
  return new AisStreamSource(apiKey, mmsiAllowlist);
}

async function runOneTick(source: AisSource): Promise<void> {
  const runId = await startRun(source.name);
  const stats: RunStats = { seen: 0, inserted: 0, skipped: 0 };
  const touched = new Set<string>();

  try {
    const messages = await source.poll();
    stats.seen = messages.length;
    for (const msg of messages) {
      const result = await ingestMessage(msg);
      if (result.kind === "inserted") {
        stats.inserted++;
        touched.add(result.vesselId);
      } else {
        stats.skipped++;
      }
    }

    if (touched.size > 0) {
      await recomputeForVessels(touched);
    }

    await finishRun(runId, "success", stats);
    console.log(
      `[worker] run ${runId} ok — seen=${stats.seen} inserted=${stats.inserted} skipped=${stats.skipped} recomputed=${touched.size}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failure", stats, message).catch((finishErr) => {
      console.error("[worker] also failed to update run row", finishErr);
    });
    console.error(`[worker] run ${runId} failed`, err);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] starting; interval=${POLL_INTERVAL_MS}ms`);
  const source = await buildSource();
  currentSource = source;
  await source.connect();

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (!stopping) {
    await runOneTick(source);
    if (stopping) break;
    await sleep(POLL_INTERVAL_MS);
  }

  console.log("[worker] loop exited; cleaning up");
  await source.close();
  await pool.end();
  console.log("[worker] bye");
}

function shutdown(): void {
  if (stopping) return;
  stopping = true;
  console.log("[worker] shutdown signal received");
  currentSource?.close().catch((err) => console.error("[worker] source close failed", err));
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
