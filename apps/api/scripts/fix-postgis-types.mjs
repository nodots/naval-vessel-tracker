#!/usr/bin/env node
// drizzle-kit emits `"geography(point, 4326)"` as a quoted identifier for
// custom types. Postgres parses that as a type literally named with parens
// and rejects it. This rewrites the quoted form to the bare PostGIS type
// declaration in every migration .sql file.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "drizzle");

const patterns = [
  [/"geography\(point, 4326\)"/g, "geography(point, 4326)"],
  [/"geography\(polygon, 4326\)"/g, "geography(polygon, 4326)"],
];

let changed = 0;
for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"))) {
  const path = join(migrationsDir, file);
  const before = readFileSync(path, "utf8");
  let after = before;
  for (const [from, to] of patterns) after = after.replace(from, to);
  if (after !== before) {
    writeFileSync(path, after);
    console.log(`[fix-postgis-types] patched ${file}`);
    changed++;
  }
}

if (changed === 0) console.log("[fix-postgis-types] nothing to patch");
