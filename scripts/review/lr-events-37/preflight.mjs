#!/usr/bin/env node
// Read-only date eligibility check for the exact 37-row review candidate.
// This does not confer source authority, query production or publish events.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const expectedColumns = [
  "slug", "name", "start_date", "county", "city", "course_name",
  "event_type", "source_key", "external_id", "source_url"
];

function csvRow(line) {
  const fields = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      fields.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  fields.push(field);
  return fields;
}

function pacificToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const arg = process.argv.slice(2);
if (arg.length > 1 || (arg.length === 1 && !/^--as-of=\d{4}-\d{2}-\d{2}$/.test(arg[0]))) {
  throw new Error("Usage: node preflight.mjs [--as-of=YYYY-MM-DD]");
}
const asOf = arg.length ? arg[0].slice("--as-of=".length) : pacificToday();
const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "occurrences.csv"), "utf8");
const lines = source.trim().split(/\r?\n/);
const header = csvRow(lines.shift());
if (JSON.stringify(header) !== JSON.stringify(expectedColumns)) throw new Error("Unexpected CSV schema");

const rows = lines.map((line) => {
  const cells = csvRow(line);
  if (cells.length !== expectedColumns.length) throw new Error("Wrong field count in CSV row");
  return Object.fromEntries(header.map((name, index) => [name, cells[index]]));
});
if (rows.length !== 37) throw new Error(`Expected exactly 37 rows, got ${rows.length}`);
if (new Set(rows.map((row) => row.slug)).size !== 37) throw new Error("Duplicate slug");
if (new Set(rows.map((row) => `${row.source_key}|${row.external_id}`)).size !== 37) {
  throw new Error("Duplicate source identity");
}
if (rows.some((row) => !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date))) {
  throw new Error("Invalid start date");
}
const expired = rows.filter((row) => row.start_date < asOf);
const eligible = rows.length - expired.length;
console.log(`Pacific date: ${asOf}; candidate: ${rows.length}; eligible: ${eligible}; past: ${expired.length}`);
for (const row of expired) console.log(`PAST ${row.start_date} ${row.slug}`);
if (expired.length) {
  console.error("BLOCKED: the all-or-none 37-row admit.sql would reject past occurrences. Re-scope and regrade; do not override the guard.");
  process.exitCode = 2;
} else {
  console.log("DATE CHECK PASS. Production admission still requires every independent source, scope, duplicate and release check.");
}
