export const dynamic = "force-dynamic";

async function fetchVIX(): Promise<{ vix: number | null; asOf?: string | null }> {
  try {
    const u = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=5d&interval=1d";
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" });
    if (!r.ok) throw new Error("bad status");
    const j = await r.json();
    const result = j?.chart?.result?.[0];
    const closeArr: number[] | undefined = result?.indicators?.quote?.[0]?.close;
    const tsArr: number[] | undefined = result?.timestamp;
    if (!closeArr || !tsArr || closeArr.length === 0) throw new Error("no data");
    const lastIdx = closeArr.length - 1;
    const last = closeArr[lastIdx];
    const ts = tsArr[lastIdx]; // seconds
    const asOf = ts ? new Date(ts * 1000).toUTCString() : null;
    return { vix: typeof last === "number" && isFinite(last) ? Number(last.toFixed(2)) : null, asOf };
  } catch {
    return { vix: null, asOf: null };
  }
}

async function fetchPCR(): Promise<{ pcr: number | null; asOf?: string | null }> {
  try {
    const base =
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    const r = await fetch(`${base}/api/pcr`, { cache: "no-store" });
    const j = await r.json();
    return { pcr: j?.pcr ?? null, asOf: j?.asOf ?? null };
  } catch {
    return { pcr: null, asOf: null };
  }
}

async function fetchAAII(): Promise<{ bulls: number | null; bears: number | null; asOf?: string | null }> {
  try {
    const base =
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
    const r = await fetch(`${base}/api/aaii`, { cache: "no-store" });
    const j = await r.json();
    return { bulls: j?.bulls ?? null, bears: j?.bears ?? null, asOf: j?.asOf ?? null };
  } catch {
    return { bulls: null, bears: null, asOf: null };
  }
}

export async function GET() {
  const [vixRes, pcrRes, aaiiRes] = await Promise.all([fetchVIX(), fetchPCR(), fetchAAII()]);

  return Response.json({
    fearGreed: null, // optional future addition
    pcrTotal: pcrRes.pcr,
    pcrAsOf: pcrRes.asOf ?? null,
    vix: vixRes.vix,
    vixAsOf: vixRes.asOf ?? null,
    aaiiBulls: aaiiRes.bulls,
    aaiiBears: aaiiRes.bears,
    aaiiAsOf: aaiiRes.asOf ?? null,
    note: "VIX + PCR + AAII live with resilient fallbacks.",
    stale:
      vixRes.vix == null ||
      pcrRes.pcr == null ||
      aaiiRes.bulls == null ||
      aaiiRes.bears == null,
  });
}
