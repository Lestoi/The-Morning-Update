export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    items: [
      // name, ticker, EPS surprise vs consensus (positive = beat; negative = miss)
      { symbol: "NVDA", name: "NVIDIA",  epsSurprisePct: +6.2 },
      { symbol: "AAPL", name: "Apple",   epsSurprisePct: -2.4 },
      { symbol: "MSFT", name: "Microsoft", epsSurprisePct: +3.1 },
      { symbol: "AMZN", name: "Amazon",  epsSurprisePct: +1.8 },
    ],
    stale: false
  });
}
