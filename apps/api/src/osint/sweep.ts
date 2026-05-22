import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { pool } from "../db/client.js";

type CandidateVessel = {
  id: string;
  name: string;
  country: string;
  navy: string | null;
  vesselType: string;
  className: string | null;
  pennantNumber: string | null;
  mmsi: string | null;
  homePort: string | null;
  lastLat: number | null;
  lastLon: number | null;
  lastObservedAt: Date | null;
  lastStatus: string | null;
  lastSourceType: string | null;
};

type Proposal = {
  found: boolean;
  lat: number | null;
  lon: number | null;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  confidence: number;
  summary: string;
  observedAt: string;
};

type SweepResult =
  | { kind: "no_data"; reason: string }
  | { kind: "invalid"; reason: string; raw: unknown }
  | { kind: "inserted"; proposal: Proposal };

const MODEL = process.env.OSINT_MODEL ?? "claude-opus-4-7";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:6732/api";
const MAX_PAUSE_RESUMES = 5;
const ALLOWED_SOURCE_TYPES = new Set([
  "news",
  "official_release",
  "satellite",
  "port_sighting",
  "manual_osint",
]);

const client = new Anthropic();

const submitObservationTool: Anthropic.Tool = {
  name: "submit_observation",
  description:
    "Submit your final assessment of the vessel's recent location. Call this exactly once as your terminal action after you have finished researching. There is no tool_result to follow — your turn ends after this call.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "found",
      "lat",
      "lon",
      "sourceType",
      "sourceName",
      "sourceUrl",
      "confidence",
      "summary",
      "observedAt",
    ],
    properties: {
      found: {
        type: "boolean",
        description:
          "true if you found credible sourced information about the vessel's recent location; false if no usable information was found (do not invent or guess).",
      },
      lat: {
        type: ["number", "null"],
        description:
          "Best estimate of latitude in decimal degrees, in the range [-90, 90]. null if found=false. If sources name a port or yard without precise coords, use the published coordinates of that facility.",
      },
      lon: {
        type: ["number", "null"],
        description:
          "Best estimate of longitude in decimal degrees, in the range [-180, 180]. null if found=false.",
      },
      sourceType: {
        type: "string",
        enum: ["news", "official_release", "satellite", "port_sighting", "manual_osint"],
        description:
          "Primary category of source: news=major outlet article, official_release=navy/government press release, satellite=open satellite imagery analysis, port_sighting=photo of vessel in port, manual_osint=other open-source evidence (forums, ship-spotting communities).",
      },
      sourceName: {
        type: "string",
        description:
          "Short label naming the source(s), e.g. 'US Navy press release / Navy Times / USNI News (multi-source)'. Keep under 200 chars.",
      },
      sourceUrl: {
        type: ["string", "null"],
        description:
          "URL to the single most canonical source you used (typically official navy release or top-tier defense outlet).",
      },
      confidence: {
        type: "number",
        description:
          "Confidence 0-1. Calibration: 0.8+ = specific coords + multiple sources; 0.55-0.75 = general area (e.g. 'in the Caribbean'); 0.35-0.5 = vague but credible single source; <0.3 = speculative (set found=false instead).",
      },
      summary: {
        type: "string",
        description:
          "1-2 sentence narrative summary suitable for a map popup. Max 280 chars. Include source date when relevant.",
      },
      observedAt: {
        type: "string",
        description:
          "ISO 8601 timestamp of when the cited source places the vessel at this location. Must not be in the future. If the source date is approximate (e.g. 'this week'), use the article publication date. If found=false, use the current time.",
      },
    },
  },
};

function buildPrompt(v: CandidateVessel): string {
  const lines: string[] = [];
  lines.push("You are an OSINT analyst tracking the location of a naval vessel.");
  lines.push("");
  lines.push("Vessel:");
  lines.push(`- Name: ${v.name}`);
  if (v.pennantNumber) lines.push(`- Pennant: ${v.pennantNumber}`);
  lines.push(`- Country: ${v.country}${v.navy ? ` (${v.navy})` : ""}`);
  lines.push(`- Type: ${v.vesselType.replace(/_/g, " ")}`);
  if (v.className) lines.push(`- Class: ${v.className}`);
  if (v.mmsi) lines.push(`- MMSI: ${v.mmsi}`);
  if (v.homePort) lines.push(`- Home port: ${v.homePort}`);

  if (v.lastLat !== null && v.lastLon !== null && v.lastObservedAt) {
    lines.push("");
    lines.push(
      `Last known position in our database: ${v.lastLat.toFixed(3)}, ${v.lastLon.toFixed(3)} ` +
        `as of ${v.lastObservedAt.toISOString().slice(0, 10)} (status: ${v.lastStatus ?? "?"}, source: ${v.lastSourceType ?? "?"}).`,
    );
  } else {
    lines.push("");
    lines.push("No current position in our database.");
  }

  lines.push("");
  lines.push("Task: research this vessel's recent location using the web_search tool. Focus on news from the last 60 days. Cross-reference at least 2 sources where possible.");
  lines.push("");
  lines.push("Then call submit_observation exactly once with your assessment.");
  lines.push("");
  lines.push("Important guidelines:");
  lines.push("- If multiple sources agree on a general area but not specific coords, pick a plausible centroid and lower confidence (0.5-0.65).");
  lines.push("- 'Position unchanged' is a valid observation. If sources confirm the vessel is in an extended refit/RCOH/port stay (e.g. Stennis at Newport News, Kuznetsov at Severomorsk), submit with sourceType=news and the date of the most recent confirming article — even if she has not moved.");
  lines.push("- If you cannot find credible sourced info, set found=false and lat/lon=null. Do not invent locations or coordinates.");
  lines.push("- Calibrate confidence honestly. The product depends on uncertainty being represented faithfully — over-confident proposals are worse than declining to submit.");
  lines.push("- Naval vessels typically do not broadcast AIS for security reasons. Movements are reported via official press releases, defense news outlets (USNI News, Navy Times, Naval News, Janes), and OSINT communities.");
  lines.push("- Set sourceUrl to the single most authoritative URL you actually found and read.");
  lines.push("");
  lines.push("Begin by issuing web searches, then call submit_observation as your final action.");
  return lines.join("\n");
}

async function fetchCandidates(opts: { vesselName?: string }): Promise<CandidateVessel[]> {
  const params: unknown[] = [];
  let where = `NOT EXISTS (
      SELECT 1 FROM observations o
      WHERE o.vessel_id = v.id
        AND o.source_type = 'ais'
        AND o.observed_at > now() - interval '6 hours'
    )`;
  if (opts.vesselName) {
    params.push(opts.vesselName);
    where += ` AND v.name = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT
       v.id, v.name, v.country, v.navy, v.vessel_type, v.class_name,
       v.pennant_number, v.mmsi, v.home_port,
       cp.lat AS last_lat, cp.lon AS last_lon,
       cp.observed_at AS last_observed_at,
       cp.status AS last_status, cp.source_type AS last_source_type
     FROM vessels v
     LEFT JOIN current_positions cp ON cp.vessel_id = v.id
     WHERE ${where}
     ORDER BY v.country, v.name`,
    params,
  );
  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    navy: r.navy,
    vesselType: r.vessel_type,
    className: r.class_name,
    pennantNumber: r.pennant_number,
    mmsi: r.mmsi,
    homePort: r.home_port,
    lastLat: r.last_lat,
    lastLon: r.last_lon,
    lastObservedAt: r.last_observed_at ? new Date(r.last_observed_at) : null,
    lastStatus: r.last_status,
    lastSourceType: r.last_source_type,
  }));
}

function validateProposal(p: unknown): { ok: true; value: Proposal } | { ok: false; reason: string } {
  if (typeof p !== "object" || p === null) return { ok: false, reason: "not an object" };
  const r = p as Record<string, unknown>;
  if (typeof r.found !== "boolean") return { ok: false, reason: "found not boolean" };
  if (!r.found) return { ok: true, value: r as unknown as Proposal };

  if (typeof r.lat !== "number" || r.lat < -90 || r.lat > 90) return { ok: false, reason: "bad lat" };
  if (typeof r.lon !== "number" || r.lon < -180 || r.lon > 180) return { ok: false, reason: "bad lon" };
  if (typeof r.sourceType !== "string" || !ALLOWED_SOURCE_TYPES.has(r.sourceType)) {
    return { ok: false, reason: `sourceType=${String(r.sourceType)}` };
  }
  if (typeof r.confidence !== "number" || r.confidence < 0 || r.confidence > 1) {
    return { ok: false, reason: "bad confidence" };
  }
  if (typeof r.observedAt !== "string") return { ok: false, reason: "observedAt not string" };
  const t = Date.parse(r.observedAt);
  if (Number.isNaN(t)) return { ok: false, reason: "observedAt unparsable" };
  if (t - Date.now() > 5 * 60_000) return { ok: false, reason: "observedAt in future" };

  return { ok: true, value: r as unknown as Proposal };
}

async function proposeForVessel(vessel: CandidateVessel): Promise<SweepResult> {
  const prompt = buildPrompt(vessel);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  let response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [
      { type: "web_search_20260209", name: "web_search" },
      submitObservationTool,
    ],
    messages,
  });

  messages.push({ role: "assistant", content: response.content });

  let resumes = 0;
  while (response.stop_reason === "pause_turn" && resumes < MAX_PAUSE_RESUMES) {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      tools: [
        { type: "web_search_20260209", name: "web_search" },
        submitObservationTool,
      ],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });
    resumes++;
  }

  const submission = response.content.find(
    (b): b is Extract<typeof b, { type: "tool_use" }> =>
      b.type === "tool_use" && b.name === "submit_observation",
  );
  if (!submission) {
    return {
      kind: "no_data",
      reason: `no submit_observation tool_use (stop_reason=${response.stop_reason})`,
    };
  }

  const validation = validateProposal(submission.input);
  if (!validation.ok) {
    return { kind: "invalid", reason: validation.reason, raw: submission.input };
  }
  const proposal = validation.value;
  if (!proposal.found) {
    return { kind: "no_data", reason: "model reported no data" };
  }

  // POST through the existing admin route — reuses validation and recompute
  const postRes = await fetch(`${API_BASE}/admin/observations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      vesselId: vessel.id,
      observedAt: proposal.observedAt,
      lat: proposal.lat,
      lon: proposal.lon,
      sourceType: proposal.sourceType,
      sourceName: proposal.sourceName,
      sourceUrl: proposal.sourceUrl ?? undefined,
      confidence: proposal.confidence,
      notes: `[osint-sweep] ${proposal.summary}`,
    }),
  });

  if (!postRes.ok) {
    const detail = await postRes.text().catch(() => "");
    return { kind: "invalid", reason: `admin POST ${postRes.status}: ${detail.slice(0, 200)}`, raw: proposal };
  }

  return { kind: "inserted", proposal };
}

async function startRun(): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO ingestion_runs (source, status) VALUES ('osint-sweep', 'running') RETURNING id`,
  );
  const row = result.rows[0];
  if (!row) throw new Error("ingestion_runs insert returned no row");
  return Number(row.id);
}

async function finishRun(
  id: number,
  outcome: "success" | "failure",
  stats: { seen: number; inserted: number; skipped: number },
  message?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ingestion_runs
       SET finished_at = now(), status = $2, message = $3,
           records_seen = $4, records_inserted = $5, records_skipped = $6
     WHERE id = $1`,
    [id, outcome, message ?? null, stats.seen, stats.inserted, stats.skipped],
  );
}

function parseArgs(): { vesselName?: string; limit?: number } {
  const args: { vesselName?: string; limit?: number } = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--vessel" && process.argv[i + 1]) {
      args.vesselName = process.argv[++i];
    } else if (arg === "--limit" && process.argv[i + 1]) {
      args.limit = Number.parseInt(process.argv[++i] ?? "0", 10);
    }
  }
  return args;
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[osint-sweep] ANTHROPIC_API_KEY is required");
    process.exit(1);
  }

  const args = parseArgs();
  console.log(`[osint-sweep] model=${MODEL}${args.vesselName ? ` vessel=${args.vesselName}` : ""}${args.limit ? ` limit=${args.limit}` : ""}`);

  let candidates = await fetchCandidates({ vesselName: args.vesselName });
  if (args.limit) candidates = candidates.slice(0, args.limit);
  console.log(`[osint-sweep] ${candidates.length} candidate vessels`);

  if (candidates.length === 0) {
    console.log("[osint-sweep] nothing to sweep — every vessel has recent AIS or the filter excluded them all.");
    await pool.end();
    return;
  }

  const runId = await startRun();
  const stats = { seen: 0, inserted: 0, skipped: 0 };
  const startedAt = Date.now();

  try {
    for (const v of candidates) {
      stats.seen++;
      const tag = `${v.country} ${v.name}`.padEnd(36);
      try {
        const result = await proposeForVessel(v);
        if (result.kind === "inserted") {
          stats.inserted++;
          const p = result.proposal;
          const lat = p.lat?.toFixed(2) ?? "?";
          const lon = p.lon?.toFixed(2) ?? "?";
          console.log(
            `[osint-sweep] ${tag} ok    lat=${lat} lon=${lon} conf=${p.confidence.toFixed(2)} src=${p.sourceType}`,
          );
        } else if (result.kind === "no_data") {
          stats.skipped++;
          console.log(`[osint-sweep] ${tag} pass  (${result.reason})`);
        } else {
          stats.skipped++;
          console.log(`[osint-sweep] ${tag} skip  (${result.reason})`);
        }
      } catch (err) {
        stats.skipped++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[osint-sweep] ${tag} error ${msg.slice(0, 160)}`);
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(0);
    await finishRun(runId, "success", stats);
    console.log(
      `[osint-sweep] run ${runId} done — seen=${stats.seen} inserted=${stats.inserted} skipped=${stats.skipped} elapsed=${elapsed}s`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failure", stats, message).catch(() => undefined);
    throw err;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[osint-sweep] fatal", err);
  process.exit(1);
});
