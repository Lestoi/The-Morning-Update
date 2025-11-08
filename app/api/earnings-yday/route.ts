export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.FMP_API_KEY!;
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const date = `${yyyy}-${mm}-${dd}`;

  const url = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${date}&to=${date}&apikey=${key}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const raw = await r.json();

    // Compute EPS surprise % = (actual - estimate) / |estimate| * 100
    const us = (raw ?? [])
      .filter((x: any) => (x?.country || "US") === "US")
      .map((x: any) => {
        const est = Number(x?.epsEstimated);
        const act = Number(x?.eps);
        const surprise = isFinite(est) && est !== 0 ? ((act - est) / Math.abs(est)) * 100 : null;
        return { symbol: x.symbol, name: x.company || x.symbol, epsSurprisePct: surprise ?? 0 };
      });

    // keep a handful of larger names (quick heuristic: sort by abs surprise)
    us.sort((a: any, b: any) => Math.abs(b.epsSurprisePct) - Math.abs(a.epsSurprisePct));
    const items = us.slice(0, 8);

    return Response.json({ items, stale: false });
  } catch {
    return Response.json({ items: [], stale: true });
  }
}
