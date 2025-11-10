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

// ---------------- CSV helpers ----------------

function splitRow(raw: string): string[] {
  // Accept comma, semicolon or tab as separators
  return raw.split(/,|;|\t/).map((s) => s.trim());
}

function lastDataRow(lines: string[]): string[] | null {
  for (let i = lines.length - 1; i >= 1; i--) {
    const parts = splitRow(lines[i]);
    if (parts.some((p) => Number.isFinite(Number(p)))) return parts;
  }
  return null;
}

function parseTwoColLatest(csv: string): number | null {
  // For legacy CBOE files like totalpc.csv (Date,Value)
  const lines = csv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const row = lastDataRow(lines);
  if (!row) return null;
  // take last numeric in the row
  for (let i = row.length - 1; i >= 0; i--) {
    const n = Number(row[i]);
    if (Number.isFinite(n)) return n;
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
  // Yahoo: Date,Open,High,Low,Close,Adj Close,Volume
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

function parseCboePCR(pcCsv: string): { total?: number; equity?: number; index?: number } | null {
  const lines = pcCsv
    .trim()
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;

  const header = splitRow(lines[0]).map((h) => h.toLowerCase());
  const row = lastDataRow(lines);
  if (!row) return null;

  // Try to map headers first
  const nameToIdx: Record<string, number> = {};
  header.forEach((h, i) => (nameToIdx[h] = i));

  const candidates = [
    ["total", "all"],
    ["equity"],
    ["index"],
    ["total put/call ratio"], // sometimes appears verbatim
    ["put/call ratio total"],
  ];

  const out: { total?: number; equity?: number; index?: number } = {};

  const pick = (keys: string[]): number | null => {
    for (const k of keys) {
      const idx = header.findIndex((h) => h.includes(k));
      if (idx >= 0) {
        const n = Number(row[idx]);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  };

  const total = pick(candidates[0]) ?? pick(candidates[3]) ?? pick(candidates[4]);
  if (Number.isFinite(total as number)) out.total = total as number;

  const equity = pick(candidates[1]);
  if (Number.isFinite(equity as number)) out.equity = equity as number;

  const index = pick(candidates[2]);
  if (Number.isFinite(index as number)) out.index = index as number;

  // If we still got nothing, try “best numeric guess” from last row:
  if (!out.total && !out.equity && !out.index) {
    for (let i = row.length - 1; i >= 0; i--) {
      const n = Number(row[i]);
      if (Number.isFinite(n) && n > 0 && n < 5) {
        out.total = n;
        break;
      }
    }
  }

  return Object.keys(out).length ? out : null;
}

// ---- Local / HTTP access to /public/aaii.csv

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

// ---------------- External sources ----------------

const CBOE_CSV_CANDIDATES = [
  // Newer multi-column file
  "https://cdn.cboe.com/data/us/equity/pc-ratio.csv",
];

const CBOE_LEGACY = [
  "https://cdn.cboe.com/data/us/options/volume-ratios/totalpc.csv",
  "https://cdn.cboe.com/data/us/options/volume-ratios/equitypc.csv",
];

async function getPutCall(): Promise<number | null> {
  // 1) Newer pc-ratio.csv (total/equity/index in one file)
  for (const url of CBOE_CSV_CANDIDATES) {
    try {
      const csv = await fetchText(url);
      const parsed = parseCboePCR(csv);
      if (parsed?.total && parsed.total > 0 && parsed.total < 5) return parsed.total;
      if (parsed?.equity && parsed.equity > 0 && parsed.equity < 5) return parsed.equity;
    } catch {
      // try next
    }
  }

  // 2) Legacy simple two-column files
  for (const url of CBOE_LEGACY) {
    try {
      const csv = await fetchText(url);
      const n = parseTwoColLatest(csv);
      if (Number.isFinite(n) && n! > 0 && n! < 5) return n!;
    } catch {
      // try next
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
  } catch {}
  // 2) Yahoo (^VIX -> %5EVIX)
  try {
    const nowSec = Math.floor(Date.now() / 1000);
    const symbol = encodeURIComponent("^VIX");
    const yahooUrl = `https://query1.finance.yahoo.com/v7/finance/download/${symbol}?period1=0&period2=${nowSec}&interval=1d&events=history&includeAdjustedClose=true`;
    const csv = await fetchText(yahooUrl);
    const v = parseYahooLatestClose(csv);
    if (v != null) return v;
  } catch {}
  // 3) FRED VIXCLS
  try {
    const key = process.env.FRED_API_KEY;
    if (key) {
      const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&api_key=${encodeURIComponent(
        key
      )}&file_type=json&observation_start=2000-01-01`;
      const data = await fetchJSON<{ observations: { value: string }[] }>(fredUrl);
      for (let i = data.observations.length - 1; i >= 0; i--) {
        const n = Number(data.observations[i].value);
        if (Number.isFinite(n)) return n;
      }
    }
  } catch {}

  return null;
}

async function getAAII(): Promise<{ bull: number | null; bear: number | null } | null> {
  try {
    const csv = await readLocalCSV("aaii.csv");
    const parsed = parseAAII(csv);
    if (parsed) return parsed;
  } catch {}
  try {
    const csv = await readPublicCSVOverHttp("aaii.csv");
    const parsed = parseAAII(csv);
    if (parsed) return parsed;
  } catch {}
  return null;
}

// ---------------- Handler ----------------

export async function GET() {
  const sources: string[] = [
    "Stooq (^VIX daily CSV) + Yahoo fallback + FRED VIXCLS (if FRED_API_KEY)",
    "CBOE daily put/call CSV (pc-ratio.csv, mirrors) + legacy totalpc.csv/equitypc.csv",
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
