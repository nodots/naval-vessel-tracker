import { pool } from "../db.js";

export type RunStats = {
  seen: number;
  inserted: number;
  skipped: number;
};

export async function startRun(source: string): Promise<number> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO ingestion_runs (source, status) VALUES ($1, 'running') RETURNING id`,
    [source],
  );
  const row = result.rows[0];
  if (!row) throw new Error("ingestion_runs insert returned no row");
  return Number(row.id);
}

export async function finishRun(
  id: number,
  outcome: "success" | "failure",
  stats: RunStats,
  message?: string,
): Promise<void> {
  await pool.query(
    `UPDATE ingestion_runs
       SET finished_at = now(),
           status = $2,
           message = $3,
           records_seen = $4,
           records_inserted = $5,
           records_skipped = $6
     WHERE id = $1`,
    [id, outcome, message ?? null, stats.seen, stats.inserted, stats.skipped],
  );
}
