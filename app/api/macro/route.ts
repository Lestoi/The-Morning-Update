export const dynamic = "force-dynamic";

function toUKTime(iso: string) {
  // FMP returns times in ET; many calendar rows include "date" only.
  // We'll show just the UK time if available, else "—".
  try {
    const d = new Date(iso);
    const uk = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    return uk || "—";
  } catch { return "—"; }
}

export async function GET() {
  const key = process.env.FMP_API_KEY!;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const from = `${yyyy}-${mm}-${dd}`;
  const to = from;

  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${from}&to=${to}&apikey=${key}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const raw = await r.json();

    // Keep **US** releases; elevate a few well-known Tier 1 names
    const tier1 = new Set([
      "Nonfarm Payrolls", "Unemployment Rate", "CPI", "Core CPI", "PCE Price Index", "Retail Sales",
      "ISM Manufacturing PMI", "ISM Services PMI", "FOMC Economic Projections", "Fed Interest Rate Decision"
    ]);

    const items = (raw ?? [])
      .filter((x: any) => (x?.country || "").toUpperCase() === "UNITED STATES")
      .map((x: any) => {
        const title = String(x?.event || x?.name || "Release");
        const t: 1|2|3 = tier1.has(title) ? 1 : /PMI|Michigan|PPI|GDP|JOLTS|Claims/i.test(title) ? 2 : 3;
        return {
          timeUK: x?.date ? toUKTime(x.date) : "—",
          country: "US",
          release: title,
          tier: t,
          actual: x?.actual?.toString() ?? "—",
          previous: x?.previous?.toString() ?? "—",
          consensus: x?.consensus?.toString() ?? "—",
          forecast: x?.forecast?.toString() ?? "—"
        };
      })
      // sort by UK time where available
      .sort((a: any, b: any) => (a.timeUK > b.timeUK ? 1 : -1));

    return Response.json({ items, stale: false });
  } catch (e) {
    return Response.json({ items: [], stale: true });
  }
}
