// /app/api/sentiment-snapshot/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Out = {
  vix: number | null;
  putCall: number | null;
  aaii: { bullsPct: number | null; bearsPct: number | null } | null;
  fearGreed: number | null;
  stale: boolean;
  sources: string[];
  updated: string;
};

async function fetchVIX(): Promise<number | null> {
  // Try daily CSV first
  try {
    const u1 = "https://stooq.com/q/d/l/?s=%5Evix&i=d";
    const r1 = await fetch(u1, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (r1.ok) {
      const txt = await r1.text();
      const lines = txt.trim().split(/\r?\n/);
      if (lines.length > 1) {
        const last = lines[lines.length - 1].split(",");
        const close = parseFloat(last[4]);
        if (Number.isFinite(close)) return close;
      }
    }
  } catch {}

  // Fallback: stooq lightweight quote CSV
  try {
    const u2 = "https://stooq.com/q/l/?s=%5Evix&f=sd2t2ohlcv&h&e=csv";
    const r2 = await fetch(u2, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r2.ok) throw new Error();
    const txt = await r2.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length >= 2) {
      const row = lines[1].split(",");
      const close = parseFloat(row[row.length - 1]);
      if (Number.isFinite(close)) return close;
    }
  } catch {}

  return null;
}

async function fetchPutCall(): Promise<number | null> {
  try {
    const url = "https://cdn.cboe.com/api/global/us_indices/pc_ratio_historical.csv";
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error();
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    // find last non-header line
    for (let i = lines.length - 1; i >= 1; i--) {
      const cols = lines[i].split(",");
      const ratio = parseFloat(cols[1]);
      if (Number.isFinite(ratio)) return ratio;
    }
  } catch {}
  return null;
}

export async function GET() {
  const [vix, pcr] = await Promise.all([fetchVIX(), fetchPutCall()]);

  return Response.json({
    vix,
    putCall: pcr,
    aaii: null,          // (still manual weekly; we can wire later)
    fearGreed: null,     // (CNN gate; we leave null)
    stale: false,
    sources: [
      "Stooq (^VIX daily/quote CSV)",
      "CBOE total put/call CSV",
    ],
    updated: new Date().toISOString(),
  });
}
