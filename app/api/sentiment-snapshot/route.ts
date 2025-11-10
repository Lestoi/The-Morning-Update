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

async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
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

async function fetchJSON<T = any>(url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": UA },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

// ---- CSV helpers ------------------------------------------------------------

function splitRow(raw: string): string[] {
  // Accept comma, semicolon or tab as separators
  return raw.split(/,|;|\t/).map((s) => s.trim());
}

function lastDataRow(lines: string[]): string[] | null {
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = splitRow(lines[i]);
    // any numeric in this row? treat as data
    if (parts.some((p) => Number.isFinite(Number(p)))) return parts;
  }
  return null;
}

function parseStooqVIX(csv: string): number | null {
  // Date,Open,High,Low,Close,Volume — take Close from last data row
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const row = lastDataRow(lines);
  if (!row) return null;
  const close = Number(row[4]);
  return Number.isFinite(close) ? close : null;
}

function parseYahooLatestClose(csv: string): number | null {
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const row = lastDataRow(lines);
  if (!row) return null;
  // Yahoo columns: Date,Open,High,Low,Close,Adj Close,Volume
  // Prefer Close (index 4), else try Adj Close (index 5)
  for (const idx of [4, 5]) {
    const n = Number(row[idx]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseAAII(csv: string): { bull: number | null; bear: number | null } | null {
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const bullIdx = header.findIndex((h) => h.includes("bull"));
  const bearIdx = header.findIndex((h) => h.includes("bear"));
  if (bullIdx === -1 || bearIdx === -1) return null;

  const row = lastDataRow(lines);
  if (!row) return null;

  const bull = Number(row[bullIdx]);
  const bear = Number(row[bearIdx]);
  return {
    bull: Number.isFinite(bull) ? bull : null,
    bear: Number.isFinite(bear) ? bear : null,
  };
}

function parseCboePCR(csv: string): { total?: number; equity?: number; index?: number } | null {
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const header = splitRow(lines[0]).map((h) => h.toLowerCase());

  // Try to find columns for total/equity/index (CBOE headers vary)
  const totalIdx =
    header.findIndex((h) => h.includes("total")) ??
    header.findIndex((h) => h.includes("all"));
  const equityIdx = header.findIndex((h) => h.includes("equity"));
  const indexIdx = header.findIndex((h) => h.includes("index"));

  const row = lastDataRow(lines);
  if (!row) return null;

  const out: { total?: number; equity?: number; index?: number } = {};
  if (totalIdx >= 0) {
    const n = Number(row[totalIdx]);
    if (Number.isFinite(n)) out.total = n;
  }
  if (equityIdx >= 0) {
    const n = Number(row[equityIdx]);
    if (Number.isFinite(n)) out.equity = n;
  }
  if (indexIdx >= 0) {
    const n = Number(row[indexIdx]);
    if (Number.isFinite(n)) out.index = n;
  }
  return Object.keys(out).length ? out : null;
}

// ---- Local / HTTP access to /public/aaii.csv --------------------------------

async function readLocalCSV(fileName: string): Promise<string> {
  const full = path.join(process.cwd(), "public", fileName);
  return await fs.readFile(full, "utf8");
}

async function readPublicCSVOverHttp(fileName: string): Promise<string> {
  const base =
    process.env.VERCEL_URL && !process.env.VERCEL_URL.startsWith("http")
      ? `https://${process.env.VERCEL_URL}`
      : process.env.VERCEL_URL || "";
  const url = `${base}/${fileName}`;
  return await fetchText(url);
}

// ---- External sources -------------------------------------------------------

const CBOE_CSV_CANDIDATES = [
  // Newer “pc-ratio.csv” with total,index,equity
  "https://cdn.cboe.com/data/us/equity/pc-ratio.csv",
  // Historical variants that still work in some regions
  "https://cdn.cboe.com/data/us/options/volume-ratios/totalpc.csv",
  "https://cdn.cboe.com/data/us/options/volume-ratios/equitypc.csv",
];

async function getPutCall(): Promise<number | null> {
  for (const url of CBOE_CSV_CANDIDATES) {
    try {
      const csv = await fetchText(url);
      const parsed = parseCboePCR(csv);
      if (parsed?.total && parsed.total > 0 && parsed.total < 5) return parsed.total;
      // Fallback to equity if total not present
      if (parsed?.equity && parsed.equity > 0 && parsed.equity < 5) return parsed.equity;
    } catch {
      // try next mirror
    }
  }
  return null;
}

async function getVIX(): Promise<number | null> {
  // 1) Stooq (^VIX)
  try {
    const stooq = await fetchText("https://stooq.com/q/d/l/?s=^vix&i=d");
    const v = parseStooqVIX(stooq);
    if (v != null) return v;
  } catch {
    // continue
  }

  // 2) Yahoo Finance (make sure ^ is encoded)
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const symbol = encodeURIComponent("^VIX"); // %5EVIX
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=0&period2=${nowSec}&interval=1d&events=history&includeAdjustedClose=true`;
    const csv = await fetchText(yahooUrl);
    const v = parseYahooLatestClose(csv);
    if (v != null) return v;
  } catch {
    // continue
  }

  // 3) FRED VIXCLS (requires FRED_API_KEY)
  try {
    const key = process.env.FRED_API_KEY;
    if (key) {
      const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${encodeURIComponent(
        key
      )}&file_type=json&observation_start=2000-01-01`;
      const data = await fetchJSON<{
        observations: { value: string }[];
      }>(fredUrl);

      // Find the last observation with a numeric value
      for (let i = data.observations.length - 1; i >= 0; i--) {
        const n = Number(data.observations[i].value);
        if (Number.isFinite(n)) return n;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

async function getAAII(): Promise<{ bull: number | null; bear: number | null } | null> {
  // Try filesystem
  try {
    const csv = await readLocalCSV("aaii.csv");
    const parsed = parseAAII(csv);
    if (parsed) return parsed;
  } catch {}
  // Try HTTP
  try {
    const csv = await readPublicCSVOverHttp("aaii.csv");
    const parsed = parseAAII(csv);
    if (parsed) return parsed;
  } catch {}
  return null;
}

// ---- Handler ----------------------------------------------------------------

export async function GET() {
  const sources: string[] = [
    "Stooq (^VIX daily CSV) + Yahoo fallback + FRED VIXCLS (if FRED_API_KEY)",
    "CBOE daily put/call CSV (pc-ratio.csv, mirrors)",
    "AAII (public CSV)",
  ];

  let vix: number | null = null;
  let putCall: number | null = null;
  let aaii: { bull: number | null; bear: number | null } | null = null;
  let stale = false;

  vix = await getVIX();
  if (vix == null) stale = true;

  putCall = await getPutCall();
  if (putCall == null) stale = true;

  aaii = await getAAII();
  if (!aaii || (aaii.bull == null && aaii.bear == null)) stale = true;

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
