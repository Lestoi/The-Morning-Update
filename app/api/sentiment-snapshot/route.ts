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
  error?: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119 Safari/537.36";

async function fetchTextWithUA(url: string, timeoutMs = 12000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}

function lastNumericInTail(csv: string, tailLines = 5): number | null {
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const tail = lines.slice(Math.max(1, lines.length - tailLines)); // skip header
  for (let i = tail.length - 1; i >= 0; i--) {
    const parts = tail[i].split(/,|;|\t/).map((s) => s.trim());
    for (let j = parts.length - 1; j >= 0; j--) {
      const n = Number(parts[j]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function parseStooqVIX(csv: string): number | null {
  // Date,Open,High,Low,Close,Volume — use Close from last data row
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  const last = lines[lines.length - 1].split(",");
  const v = Number(last[4]);
  return Number.isFinite(v) ? v : null;
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

// Multiple CBOE CSV mirrors (they move these occasionally)
const CBOE_CSV_CANDIDATES = [
  "https://cdn.cboe.com/data/us/options/volume-ratios/totalpc.csv",
  "https://cdn.cboe.com/data/us/options/volume-ratios/equitypc.csv",
  // Old paths occasionally still work; keep as last resorts:
  "https://cdn.cboe.com/data/us/equity/pc-ratio.csv",
];

async function getPutCall(): Promise<number | null> {
  for (const url of CBOE_CSV_CANDIDATES) {
    try {
      const csv = await fetchTextWithUA(url);
      const n = lastNumericInTail(csv, 6);
      if (n != null && n > 0 && n < 5) return n;
    } catch {
      // try next
    }
  }
  return null;
}

async function getVIX(): Promise<number | null> {
  // primary: Stooq (fast)
  try {
    const stooq = await fetchTextWithUA("https://stooq.com/q/d/l/?s=^vix&i=d");
    const v = parseStooqVIX(stooq);
    if (v != null) return v;
  } catch {
    // fall through to Yahoo
  }

  // fallback: Yahoo Finance CSV (historic download)
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/download/^VIX?period1=0&period2=${nowSec}&interval=1d&events=history&includeAdjustedClose=true`;
    const csv = await fetchTextWithUA(yahooUrl);
    const v = lastNumericInTail(csv, 6); // last close will be among final cells
    return v;
  } catch {
    return null;
  }
}

export async function GET() {
  const sources: string[] = [
    "Stooq (^VIX daily CSV) + Yahoo fallback",
    "CBOE total/equity put/call CSV (multi-mirror)",
    "AAII (public CSV)",
  ];

  let vix: number | null = null;
  let putCall: number | null = null;
  let aaii: { bull: number | null; bear: number | null } | null = null;
  let stale = false;

  // VIX
  vix = await getVIX();
  if (vix == null) stale = true;

  // Put/Call
  putCall = await getPutCall();
  if (putCall == null) stale = true;

  // AAII from /public/aaii.csv
  try {
    const csv = await readLocalCSV("aaii.csv");
    aaii = parseAAII(csv);
    if (!aaii) stale = true;
  } catch {
    stale = true;
  }

  const allFailed =
    vix == null && putCall == null && (!aaii || (aaii.bull == null && aaii.bear == null));

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
