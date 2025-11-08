export const dynamic = "force-dynamic";

// Yahoo Finance VIX last close
async function fetchVIX() {
  try {
    const u = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d";
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const j = await r.json();
    const close = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0];
    return (typeof close === "number" && isFinite(close)) ? Number(close.toFixed(2)) : null;
  } catch { return null; }
}

export async function GET() {
  const vix = await fetchVIX();

  // PCR + AAII will be added in the next pass with stable sources.
  return Response.json({
    fearGreed: null,
    pcrTotal: null,
    vix,
    aaiiBulls: null,
    aaiiBears: null,
    note: "Live VIX wired. PCR & AAII coming next.",
    stale: false
  });
}
