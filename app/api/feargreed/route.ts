export const dynamic = "force-dynamic";

/**
 * Fear & Greed Index (alternative.me)
 * API docs: https://api.alternative.me/fng/
 * Returns { score, label, asOf } and never throws.
 */
type FngOut = {
  score: number | null;
  label?: string | null;
  asOf?: string | null;
  source?: string;
  stale?: boolean;
};

function classify(n: number): string {
  if (n >= 0 && n <= 25) return "Extreme Fear";
  if (n <= 44) return "Fear";
  if (n <= 55) return "Neutral";
  if (n <= 74) return "Greed";
  return "Extreme Greed";
}

export async function GET() {
  try {
    const url = "https://api.alternative.me/fng/?limit=1&format=json";
    const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error("bad status");
    const j = await r.json();

    const row = j?.data?.[0];
    const val = Number(row?.value);
    const ok = isFinite(val) && val >= 0 && val <= 100;
    const ts = row?.timestamp ? new Date(Number(row.timestamp) * 1000) : null;

    const out: FngOut = {
      score: ok ? Math.round(val) : null,
      label: ok ? (row?.value_classification || classify(val)) : null,
      asOf: ts ? ts.toUTCString() : null,
      source: "alternative.me",
      stale: !ok,
    };
    return Response.json(out);
  } catch {
    const miss: FngOut = { score: null, label: null, asOf: null, source: "alternative.me", stale: true };
    return Response.json(miss);
  }
}
