export const dynamic = "force-dynamic";

// Yahoo Finance VIX last close (simple)
async function fetchVIX() {
  try {
    const u = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1d&interval=1d";
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    const j = await r.json();
    const close = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.[0];
    return (typeof close === "number" && isFinite(close)) ? Number(close.toFixed(2)) : null;
  } catch {
    return null;
  }
}

export async function GET() {
  // Fetch in parallel
  const [vix, pcrRes, aaiiRes] = await Promise.all([
    fetchVIX(),
    fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/pcr`, { cache: "no-store" })
      .then(r => r.json())
      .catch(() => ({ pcr: null })),
    fetch(`${process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : ""}/api/aaii`, { cache: "no-store" })
      .then(r => r.json())
      .catch(() => ({ bulls: null, bears: null })),
  ]);

  // Fallback for local dev (no VERCEL_URL)
  const pcr = pcrRes?.pcr ?? null;
  const aaiiBulls = aaiiRes?.bulls ?? null;
  const aaiiBears = aaiiRes?.bears ?? null;

  return Response.json({
    fearGreed: null,          // (optional; add later if you want)
    pcrTotal: pcr,
    vix,
    aaiiBulls,
    aaiiBears,
    note: "VIX + PCR + AAII live (best-effort from public CSV sources).",
    stale: (vix == null) || (pcr == null) || (aaiiBulls == null) || (aaiiBears == null)
  });
}
