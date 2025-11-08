// /app/api/sentiment-snapshot/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ensure Node runtime on Vercel

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
    const url = "https://stooq.com/q/d/l/?s=%5Evix&i=d";
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`VIX HTTP ${res.status}`);
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const last = lines[lines.length - 1].split(",");
    const close = parseFloat(last[4]);
    return Number.isFinite(close) ? close : null;
  } catch {
    return null;
  }
}

async function fetchPutCall(): Promise<number | null> {
  try {
    const url = "https://cdn.cboe.com/api/global/us_indices/pc_ratio_historical.csv";
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`PCR HTTP ${res.status}`);
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2) return null;
    const last = lines[lines.length - 1].split(",");
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
    aaii: null,
    fearGreed: null,
    stale: false,
    sources: [
      "Stooq (^VIX daily CSV)",
      "CBOE total put/call CSV",
    ],
    updated: new Date().toISOString(),
  };

  return Response.json(out);
}
