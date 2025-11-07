export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    fearGreed: 27,          // 0-100
    pcrTotal: 0.88,         // total Cboe PCR snapshot
    vix: 20.1,
    aaiiBulls: 28,          // AAII % Bulls (mock)
    aaiiBears: 42,          // AAII % Bears (mock)
    note: "Cautious risk tone into NFP",
    stale: false
  });
}
