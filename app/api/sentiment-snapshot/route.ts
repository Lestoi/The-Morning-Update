// app/api/sentiment-snapshot/route.ts
import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Snapshot = {
  vix: number | null;
  putCall: number | null;
  aaii: { bull: number | null; bear: number | null } | null;
  fearGreed: number | null;
  stale: boolean;
  sources: string[];
  updated: string;
  error?: string; // now only added if *everything* failed
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

async function fetchTextWithUA(url: string, timeoutMs = 10000): Promise<string> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const r = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(to);
  }
}

function parseStooqVIX(csv: string): number | null {
  // Date,Open,High,Low,Close,Volume  (latest is last row)
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1].split(",");
  const v = Number(last[4]);
  return Number.isFinite(v) ? v : null;
}

function parseCboePutCall(csv: string): number | null {
  // try to find first float in a plausible range
  const lines = csv.trim().split("\n");
  for (const line of lines.slice(1)) {
    const cells = line.split(/,|;|\t/).map((s) => s.trim());
    for (const c of cells) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0 && n < 5) return n;
    }
  }
  return null;
}

async function readLocalCSV(fileName: string): Promise<string> {
  const full = path.join(process.cwd(), "public", fileName);
  return await fs.readFile(full, "utf8");
}

function parseAAII(csv: string): { bull: number | null; bear: number | null } | null {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const bullIdx = header.findIndex((h) => h.includes("bull"));
  const bearIdx = header.findIndex((h) => h.includes("bear"));

  if (bullIdx === -1 || bearIdx === -1) return null;

  const last = lines[lines.length - 1].split(",").map((c) => c.trim());
  const bull = Number(last[bullIdx]);
  const bear = Number(last[bearIdx]);

  return {
    bull: Number.isFinite(bull) ? bull : null,
    bear: Number.isFinite(bear) ? bear : null,
  };
}

// Try several CBOE CSV endpoints (they change formats/locations occasionally)
const CBOE_CSV_CANDIDATES = [
  "https://cdn.cboe.com/data/us/options/volume-ratios/totalpc.csv",
  "https://cdn.cboe.com/data/us/equity/pc-ratio.csv",
  // add more mirrors here if needed later
];

export async function GET() {
  const sources: string[] = [
    'Stooq (^VIX daily CSV)',
    'CBOE total put/call CSV',
    'AAII (public CSV)',
  ];

  let vix: number | null = null;
  let putCall: number | null = null;
  let aaii: { bull: number | null; bear: number | null } | null = null;
  let stale = false;

  // 1) VIX
  try {
    const vixCSV = await fetchTextWithUA("https://stooq.com/q/d/l/?s=^vix&i=d");
    vix = parseStooqVIX(vixCSV);
    if (vix == null) stale = true;
  } catch {
    stale = true;
  }

  // 2) Put/Call – try multiple mirrors
  for (const url of CBOE_CSV_CANDIDATES) {
    try {
      const pc = await fetchTextWithUA(url);
      putCall = parseCboePutCall(pc);
      if (putCall != null) break;
    } catch {
      // try next
    }
  }
  if (putCall == null) stale = true;

  // 3) AAII from /public/aaii.csv
  try {
    const csv = await readLocalCSV("aaii.csv");
    aaii = parseAAII(csv);
    if (!aaii) stale = true;
  } catch {
    stale = true;
  }

  // Only set `error` if everything failed (so partial data doesn't show a scary banner)
  const allFailed =
    vix == null &&
    putCall == null &&
    (!aaii || (aaii.bull == null && aaii.bear == null));

  const body: Snapshot = {
    vix,
    putCall,
    aaii,
    fearGreed: null,
    stale,
    sources,
    updated: new Date().toISOString(),
    ...(allFailed ? { error: "All sources unavailable right now." } : {}),
  };

  return NextResponse.json(body, { status: 200 });
}
