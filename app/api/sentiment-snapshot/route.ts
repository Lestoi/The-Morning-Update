// /app/api/sentiment-snapshot/route.ts
export const dynamic = "force-dynamic";

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
  try {
    // Stooq daily CSV for ^VIX
    const url = "https://stooq.com/q/d/l/?s=%5Evix&i=d";
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`VIX HTTP ${res.status}`);
    const txt = await res.text();

    // CSV header: Date,Open,High,Low,Close,Volume
    const lines = txt.trim().split(/\r?\n/);
    const last = lines[lines.length - 1].split(",");
    const close = parseFloat(last[4]);
    return Number.isFinite(close) ? close : null;
  } catch {
    return null;
  }
}

async function fetchPutCall(): Promise<number | null> {
  try {
    // CBOE historical total put/call ratio (public CSV)
    const url = "https://cdn.cboe.com/api/global/us_indices/pc_ratio_historical.csv";
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`PCR HTTP ${res.status}`);
    const txt = await res.text();

    // Expect lines like: date,ratio
    const lines = txt.trim().split(/\r?\n/);
    const last = lines[lines.length - 1].split(",");
    // last[1] may be like "0.88"
    const ratio = parseFloat(last[1]);
    return Number.isFinite(ratio) ? ratio : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [vix, pcr] = await Promise.all([fetchVIX(), fetchPutCall()]);

  const out: Out = {
    vix: vix ?? null,
    putCall: pcr ?? null,
    aaii: null,         // can wire later if you want a weekly AAII CSV
    fearGreed: null,    // CNN has no public API; we can compute a proxy later
    stale: false,
    sources: [
      "Stooq (^VIX daily CSV)",
      "CBOE total put/call CSV",
    ],
    updated: new Date().toISOString(),
  };

  return Response.json(out);
}
