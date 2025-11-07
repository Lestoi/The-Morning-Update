export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    items: [
      // time UK, ISO2 country, release name, tier, actual/prev/cons/fcst (strings so we can show %/bps etc)
      { timeUK: "13:30", country: "US", release: "Nonfarm Payrolls (OCT)", tier: 1, actual: "—", previous: "254k", consensus: "178k", forecast: "180k" },
      { timeUK: "13:30", country: "US", release: "Unemployment Rate (OCT)", tier: 1, actual: "—", previous: "3.8%", consensus: "3.9%", forecast: "3.9%" },
      { timeUK: "15:00", country: "US", release: "U. Michigan Sentiment (prelim)", tier: 2, actual: "—", previous: "68.4", consensus: "67.0", forecast: "67.0" },
      { timeUK: "18:00", country: "US", release: "Baker Hughes Rig Count", tier: 3, actual: "—", previous: "624", consensus: "—",   forecast: "—" }
    ],
    stale: false
  });
}
