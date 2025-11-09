// /app/api/sentiment-snapshot/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/** Tiny CSV -> array of rows. Skips empty lines, trims cells. */
function parseCSV(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l =>
      // naive split, OK for our simple sources
      l.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    );
}

async function fetchText(url: string) {
  const r = await fetch(url, {
    // try to avoid over-aggressive bot blocking
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept": "text/csv, text/plain, */*",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
    },
    // revalidate periodically, but allow manual refresh
    next: { revalidate: 300 },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

async function getVIX(): Promise<number | null> {
  try {
    // Stooq daily quote CSV
    // Header example: Symbol,Date,Time,Open,High,Low,Close,Volume
    const url = "https://stooq.com/q/l/?s=%5Evix&f=sd2t2ohlcv&h&e=csv";
    const csv = parseCSV(await fetchText(url));
    if (csv.length < 2) return null;
    const header = csv[0].map(h => h.toLowerCase());
    const rows = csv.slice(1);
    const last = rows[rows.length - 1];
    // try to find column "close"
    const closeIdx = header.findIndex(h => h === "close");
    if (closeIdx === -1) return null;
    const v = Number(last[closeIdx]);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

async function getPutCall(): Promise<number | null> {
  try {
    // CBOE total put/call CSV
    // https://cdn.cboe.com/api/put_call_ratio/total.csv
    const url = "https://cdn.cboe.com/api/put_call_ratio/total.csv";
    const csv = parseCSV(await fetchText(url));
    if (csv.length < 2) return null;

    const header = csv[0].map(h => h.toLowerCase());
    const rows = csv.slice(1);
    // Find last non-empty data row
    const data = [...rows].reverse().find(r => r.every(c => c !== "")) ?? null;
    if (!data) return null;

    // CBOE header often has: date,total,index,equity, ...
    let idx = header.findIndex(h => h === "total");
    if (idx < 0 && data.length > 1) idx = 1; // fallback: second column

    const val = Number(data[idx]);
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

async function getAAII(): Promise<{ bulls: number; bears: number } | null> {
  try {
    // AAII CSV; sometimes rate-limited / member-only; we just try gracefully
    const url = "https://www.aaii.com/files/surveys/sentiment.csv";
    const csv = parseCSV(await fetchText(url));
    if (csv.length < 2) return null;

    // Find columns that look like "Bullish %" and "Bearish %"
    const header = csv[0].map(h => h.toLowerCase());
    const rows = csv.slice(1);
    const last = rows[rows.length - 1];

    const bullIdx =
      header.findIndex(h => h.includes("bull") && h.includes("%")) ??
      header.findIndex(h => h.includes("bull"));
    const bearIdx =
      header.findIndex(h => h.includes("bear") && h.includes("%")) ??
      header.findIndex(h => h.includes("bear"));

    if (bullIdx < 0 || bearIdx < 0) return null;

    const bulls = Number(String(last[bullIdx]).replace("%", ""));
    const bears = Number(String(last[bearIdx]).replace("%", ""));
    if (!Number.isFinite(bulls) || !Number.isFinite(bears)) return null;
    return { bulls, bears };
  } catch {
    return null;
  }
}

export async function GET() {
  const [vix, putCall, aaii] = await Promise.all([
    getVIX(),
    getPutCall(),
    getAAII(),
  ]);

  const body = {
    vix,
    putCall,
    aaii,            // { bulls, bears } | null
    fearGreed: null, // proprietary; we’ll leave null until we add a safe source
    stale: false,
    sources: [
      "Stooq (^VIX daily/quote CSV)",
      "CBOE total put/call CSV",
      "AAII sentiment CSV (best-effort)",
    ],
    updated: new Date().toISOString(),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
