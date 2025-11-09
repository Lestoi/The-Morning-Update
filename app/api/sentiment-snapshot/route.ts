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
  fearGreed: number | null; // placeholder if you later wire one in
  stale: boolean;
  sources: string[];
  updated: string;
  error?: string;
};

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return await r.text();
}

function parseStooqVIX(csv: string): number | null {
  // stooq CSV: Date,Open,High,Low,Close,Volume
  // last line is the latest; Close is col index 4
  const lines = csv.trim().split("\n");
  const last = lines[lines.length - 1];
  const parts = last.split(",");
  const close = parts[4];
  const v = Number(close);
  return Number.isFinite(v) ? v : null;
}

function parseCboePutCall(csv: string): number | null {
  // Very small/robust parser – find first cell that looks like a float < 5
  // Many CBOE CSVs include a header row, then values.
  const lines = csv.trim().split("\n");
  for (const line of lines.slice(1)) {
    const cols = line.split(/,|;|\t/).map((s) => s.trim());
    for (const cell of cols) {
      const maybe = Number(cell);
      if (Number.isFinite(maybe) && maybe > 0 && maybe < 5) return maybe;
    }
  }
  return null;
}

async function readLocalCSV(fileName: string): Promise<string> {
  const full = path.join(process.cwd(), "public", fileName);
  return await fs.readFile(full, "utf8");
}

function parseAAII(csv: string): { bull: number | null; bear: number | null } | null {
  // Accepts headers like: DATE,BULLISH,NEUTRAL,BEARISH (case-insensitive)
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const bullIdx = header.findIndex((h) => h.includes("bull"));
  const bearIdx = header.findIndex((h) => h.includes("bear"));

  if (bullIdx === -1 || bearIdx === -1) return null;

  // Use last row (assume latest is at bottom)
  const last = lines[lines.length - 1].split(",").map((c) => c.trim());
  const bull = Number(last[bullIdx]);
  const bear = Number(last[bearIdx]);

  return {
    bull: Number.isFinite(bull) ? bull : null,
    bear: Number.isFinite(bear) ? bear : null,
  };
}

// Multiple CBOE CSV candidates – we try in order until one works.
// (These change sometimes; this keeps it resilient.)
const CBOE_CSV_CANDIDATES = [
  // Total put/call daily CSV (commonly mirrored/formatted by CBOE)
  "https://cdn.cboe.com/data/us/options/volume-ratios/totalpc.csv",
  "https://cdn.cboe.com/data/us/equity/pc-ratio.csv",
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
  let error: string | undefined;

  // 1) VIX (Stooq)
  try {
    const vixCSV = await fetchText("https://stooq.com/q/d/l/?s=^vix&i=d");
    vix = parseStooqVIX(vixCSV);
  } catch (e: any) {
    stale = true;
    error = (error ? error + " | " : "") + `VIX: ${e?.message ?? "fetch failed"}`;
  }

  // 2) Put/Call (CBOE; try multiple mirrors/endpoints)
  if (!putCall) {
    for (const url of CBOE_CSV_CANDIDATES) {
      try {
        const pc = await fetchText(url);
        putCall = parseCboePutCall(pc);
        if (putCall != null) break;
      } catch (e) {
        // try next
      }
    }
    if (putCall == null) {
      stale = true;
      error = (error ? error + " | " : "") + "Put/Call: no CSV parsed";
    }
  }

  // 3) AAII (local public CSV: /public/aaii.csv)
  try {
    const aaiiCSV = await readLocalCSV("aaii.csv");
    aaii = parseAAII(aaiiCSV);
  } catch (e: any) {
    // Not fatal—just leave tile blank
    stale = true;
    error = (error ? error + " | " : "") + "AAII CSV not found or invalid";
  }

  const body: Snapshot = {
    vix,
    putCall,
    aaii,
    fearGreed: null,
    stale,
    sources,
    updated: new Date().toISOString(),
    ...(error ? { error } : {}),
  };

  return NextResponse.json(body, { status: 200 });
}
