// app/api/sentiment-snapshot/route.ts
import { NextResponse } from "next/server";

/**
 * Force Node runtime (some public CSV endpoints reject Edge fetches).
 */
export const runtime = "nodejs";
// Always run live (no ISR cache).
export const dynamic = "force-dynamic";

// ---------- Helpers ----------
type AAIIReading = { bull: number | null; bear: number | null };

function toNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Number(String(s).trim().replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseCSV(text: string): string[][] {
  // Tiny, permissive CSV parser (handles simple quoted fields)
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const out: string[][] = [];
  for (const line of lines) {
    const row: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && (i === 0 || line[i - 1] !== "\\")) {
        q = !q;
        continue;
      }
      if (ch === "," && !q) {
        row.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    out.push(row.map((c) => c.trim()));
  }
  return out;
}

// ---------- Sources (proxy/UA safe) ----------
async function getVIX(): Promise<number | null> {
  // Stooq supports HTTPS but may 403 on headless UAs; set a browser UA.
  const url = "https://stooq.com/q/d/l/?s=^vix&i=d";
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const text = await r.text();
  const rows = parseCSV(text);
  // rows like: Date,Open,High,Low,Close,Volume
  const body = rows.slice(1).filter((r) => r.length >= 5);
  if (!body.length) return null;
  const last = body[body.length - 1];
  return toNumber(last[4]);
}

async function getPutCall(): Promise<number | null> {
  // CBOE has a CDN endpoint that’s fetch-friendly from serverless.
  const url = "https://cdn.cboe.com/api/global/us_indices/daily_statistics/all.csv";
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!r.ok) return null;
  const csv = await r.text();
  const rows = parseCSV(csv);
  const lc = (s: string) => s.toLowerCase();

  // Look for "Total Put/Call Ratio" row; last numeric cell on that row is the value.
  for (const row of rows) {
    if (row.some((c) => lc(c).includes("total put/call ratio"))) {
      for (let i = row.length - 1; i >= 0; i--) {
        const n = toNumber(row[i]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

async function getAAII(url: string | undefined): Promise<AAIIReading> {
  if (!url) return { bull: null, bear: null };
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!r.ok) return { bull: null, bear: null };
  const csv = await r.text();
  const rows = parseCSV(csv);
  if (!rows.length) return { bull: null, bear: null };

  const header = rows[0].map((h) => h.toLowerCase());
  const bullIdx = header.findIndex((h) => h.includes("bull"));
  const bearIdx = header.findIndex((h) => h.includes("bear"));

  if (bullIdx === -1 || bearIdx === -1) return { bull: null, bear: null };

  const dataRows = rows.slice(1).filter((r) => r.length > Math.max(bullIdx, bearIdx));
  if (!dataRows.length) return { bull: null, bear: null };

  const last = dataRows[dataRows.length - 1];
  return { bull: toNumber(last[bullIdx]), bear: toNumber(last[bearIdx]) };
}

// ---------- Route ----------
export async function GET(req: Request) {
  try {
    // Build AAII fallback URL to your own deployment if env not set.
    const proto = req.headers.get("x-forwarded-proto") || "https";
    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const origin = host ? `${proto}://${host}` : "";
    const aaiiUrl = process.env.AAII_CSV_URL || (origin ? `${origin}/aaii.csv` : undefined);

    const [vix, putCall, aaii] = await Promise.all([getVIX(), getPutCall(), getAAII(aaiiUrl)]);

    const res = {
      vix,
      putCall,
      aaii,
      stale: false,
      sources: [
        "Stooq (^VIX daily CSV)",
        "CBOE total put/call CSV",
        aaiiUrl ? "AAII (public CSV)" : "AAII (not configured)",
      ],
      updated: new Date().toISOString(),
    };

    return NextResponse.json(res, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (err) {
    const res = {
      vix: null,
      putCall: null,
      aaii: { bull: null, bear: null },
      stale: true,
      sources: ["Stooq", "CBOE", "AAII"],
      error: String(err),
      updated: new Date().toISOString(),
    };
    return NextResponse.json(res, { status: 200 });
  }
}
