export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.FMP_API_KEY!;
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const from = `${yyyy}-${mm}-${dd}`;
  const to = from;

  // FMP earnings calendar for today
  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const raw = await r.json();

    // Keep US tickers only; pick 8 “larger” names by mcap (extra fetch per symbol)
    const us = (raw ?? []).filter((x: any) => (x?.country || "US") === "US");

    // fetch simple profile with marketCap to sort
    async function withMcap(it: any) {
      try {
        const pr = await fetch(`https://financialmodelingprep.com/api/v3/profile/${it.symbol}?apikey=${key}`, { cache: "no-store" });
        const prof = await pr.json();
        const mcap = prof?.[0]?.mktCap ?? prof?.[0]?.marketCap ?? null;
        return { ...it, mcap };
      } catch { return { ...it, mcap: null }; }
    }

    const enriched = await Promise.all(us.map(withMcap));
    enriched.sort((a: any, b: any) => (b.mcap ?? 0) - (a.mcap ?? 0));

    const pick = enriched.slice(0, 8).map((x: any) => {
      const session: "BMO"|"AMC"|"TBD" =
        /before market/i.test(x?.time || "") ? "BMO" :
        /after market/i.test(x?.time || "")  ? "AMC" :
        "TBD";
      const tUK = x?.date ? new Date(x.date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }) : "—";
      return {
        timeUK: tUK,
        symbol: x.symbol,
        name: x.company || x.symbol,
        session,
        mcap: x.mcap ? Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(x.mcap).replace("G","B") : "—"
      };
    });

    return Response.json({ items: pick, stale: false });
  } catch {
    return Response.json({ items: [], stale: true });
  }
}
