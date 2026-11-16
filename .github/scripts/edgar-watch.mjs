#!/usr/bin/env node
/**
 * Weekly EDGAR watcher for FINWIRE's IPO tab.
 *
 * Reads SEC's own daily form index for the last N days, keeps the forms that
 * start an IPO registration (S-1 and F-1, plus their amendments, because a
 * price range usually appears in the /A), and writes a Markdown issue body.
 * The workflow around it opens that as a GitHub issue; nothing else is needed,
 * no API key and no Cloudflare account.
 *
 * Why the daily index rather than full-text search: it is one small static
 * file per day, it names every filing with its form type, company, CIK and
 * date, and it does not depend on a query that can silently match nothing.
 *
 * SEC's fair-access rules: identify yourself in the User-Agent with a contact
 * address (SEC_CONTACT) and stay under 10 requests a second — this asks for
 * seven files and pauses between them.
 *
 * Testable without the network: set EDGAR_FIXTURE_DIR to a directory of
 * `form.YYYYMMDD.idx` files and they are read instead of fetched.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FORMS = new Set(["S-1", "S-1/A", "F-1", "F-1/A"]);
const DAYS = Math.max(1, Math.min(31, Number(process.env.DAYS || 7)));
const CONTACT = process.env.SEC_CONTACT || "unknown@example.com";
const FIXTURE_DIR = process.env.EDGAR_FIXTURE_DIR || "";
const USER_AGENT = `FINWIRE-IPO-watch/1.0 (${CONTACT})`;
const MAX_ROWS = 80;
const INDEX_ROOT = "https://www.sec.gov/Archives/edgar/daily-index";

/** The last `days` calendar days, newest first, as YYYYMMDD in UTC. */
function recentDays(days) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}

function indexUrl(day) {
  const year = day.slice(0, 4);
  const month = Number(day.slice(4, 6));
  return `${INDEX_ROOT}/${year}/Q${Math.ceil(month / 3)}/form.${day}.idx`;
}

/**
 * Rows look like:
 *   S-1   SOME COMPANY INC   1234567   2026-11-13   edgar/data/1234567/0001234567-26-000001.txt
 * Columns are separated by two or more spaces, and company names contain
 * single spaces, so splitting on runs of spaces is what keeps this honest.
 */
const ROW = /^(.+?)\s{2,}(.+?)\s{2,}(\d+)\s{2,}(\d{4}-\d{2}-\d{2})\s{2,}(\S+)$/;

function parseIndex(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = ROW.exec(line);
    if (!m) continue;
    const form = m[1].trim();
    if (!FORMS.has(form)) continue;
    rows.push({
      form,
      company: m[2].trim(),
      cik: m[3],
      filed: m[4],
      url: filingUrl(m[5].trim()),
      amendment: form.endsWith("/A"),
    });
  }
  return rows;
}

/** edgar/data/1234567/0001234567-26-000001.txt -> the filing's index page. */
function filingUrl(fileName) {
  const clean = fileName.replace(/\.(txt|html?)$/i, "");
  const cut = clean.lastIndexOf("/");
  const dir = clean.slice(0, cut);
  const accession = clean.slice(cut + 1);
  return `https://www.sec.gov/Archives/${dir}/${accession.replace(/-/g, "")}/${accession}-index.htm`;
}

async function loadIndex(day) {
  if (FIXTURE_DIR) {
    const path = join(FIXTURE_DIR, `form.${day}.idx`);
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }
  const url = indexUrl(day);
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/plain, */*",
      "Accept-Encoding": "gzip, deflate",
    },
    signal: AbortSignal.timeout(20000),
  });
  // Weekends and holidays simply have no file, which is not a failure.
  if (response.status === 404) return null;
  if (response.status === 403) {
    throw new Error(
      `${url} returned 403: SEC refused the request. It requires a User-Agent with a contact address ` +
        `(set the SEC_CONTACT secret), and it blocks some datacentre ranges — GitHub-hosted runners ` +
        `are usually allowed, but if this persists the IP is blocked rather than the header missing.`
    );
  }
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

function markdown(rows, days, failures) {
  const from = days[days.length - 1];
  const to = days[0];
  const fmt = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const lines = [];

  lines.push(
    `Companies that filed a **new IPO registration** with the SEC between ${fmt(from)} and ${fmt(to)}.`,
    "",
    "Found by the scheduled EDGAR watcher (`Actions → EDGAR IPO watch`). It reads SEC's daily form index, so the list is every S-1, S-1/A, F-1 and F-1/A filed in that window — amendments included on purpose, because a price range usually appears in an `/A`.",
    "",
    "**Only a filing is detected here.** No range, valuation or financials: those live inside the prospectus, and the IPO tab's `js/ipos-data.js` is where they get written down.",
    ""
  );

  if (!rows.length) {
    lines.push("No new S-1 or F-1 filings in this window.", "");
  } else {
    lines.push("| Company | Form | CIK | Filed | Filing |", "| --- | --- | --- | --- | --- |");
    rows.slice(0, MAX_ROWS).forEach((r) => {
      const company = r.company.replace(/\|/g, "\\|");
      lines.push(
        `| ${company} | ${r.form} | [${r.cik}](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${r.cik}&type=${encodeURIComponent(
          r.form.replace("/A", "")
        )}) | ${r.filed} | [index](${r.url}) |`
      );
    });
    if (rows.length > MAX_ROWS) lines.push("", `_${rows.length - MAX_ROWS} more rows were trimmed; rerun the workflow with a shorter \`days\` input to see them._`);
    lines.push("");
  }

  const originals = rows.filter((r) => !r.amendment).length;
  lines.push(
    `${rows.length} filing(s): ${originals} original registration(s), ${rows.length - originals} amendment(s).`,
    "",
    "To add one to the site, append an entry to [`js/ipos-data.js`](../blob/main/js/ipos-data.js) with the terms, the financials the prospectus reports, what is still unsettled, and a dated source for each number — the rules are at the top of that file.",
    ""
  );

  if (failures.length) {
    lines.push("<details><summary>Days that could not be read</summary>", "");
    failures.forEach((f) => lines.push(`- ${f}`));
    lines.push("", "</details>", "");
  }
  lines.push("_Generated from public SEC filings. Not investment advice._");
  return { body: lines.join("\n"), from: fmt(from), to: fmt(to) };
}

const days = recentDays(DAYS);
const rows = [];
const failures = [];

for (const day of days) {
  try {
    const text = await loadIndex(day);
    if (text) rows.push(...parseIndex(text));
  } catch (error) {
    failures.push(`${day}: ${error.message}`);
  }
  if (!FIXTURE_DIR) await new Promise((r) => setTimeout(r, 200));
}

if (failures.length === days.length) {
  console.error("Every day failed, so nothing was scanned:\n" + failures.join("\n"));
  process.exit(1);
}

// One company can appear twice for the same form and day; keep the first.
const seen = new Set();
const unique = rows
  .filter((r) => {
    const key = `${r.cik}|${r.form}|${r.filed}|${r.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .sort((a, b) => (a.filed === b.filed ? a.company.localeCompare(b.company) : b.filed.localeCompare(a.filed)));

const { body, from, to } = markdown(unique, days, failures);
const title = `IPO watch: new S-1/F-1 filings, ${from} to ${to}`;
const bodyPath = join(process.env.RUNNER_TEMP || ".", "edgar-ipo-watch.md");
writeFileSync(bodyPath, body);

if (process.env.GITHUB_OUTPUT) {
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    [`count=${unique.length}`, `title=${title}`, `body_file=${bodyPath}`, ""].join("\n"),
    { flag: "a" }
  );
}

console.log(`${unique.length} filing(s) between ${from} and ${to}`);
unique.slice(0, 10).forEach((r) => console.log(`  ${r.filed}  ${r.form.padEnd(6)} ${r.company} (CIK ${r.cik})`));
if (unique.length > 10) console.log(`  … ${unique.length - 10} more`);
if (failures.length) console.warn(`Skipped ${failures.length} day(s): ${failures.join("; ")}`);
if (!process.env.GITHUB_OUTPUT) console.log("\n" + body);
