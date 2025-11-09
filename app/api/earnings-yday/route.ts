// /app/api/earnings-yday/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/** Previous US market day (ignores holidays, good enough for now). */
function previousUSMarketDay(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // go back one day until Mon–Fri
  do {
    t.setUTCDate(t.getUTCDate() - 1);
  } while ([0, 6].includes(t.getUTCDay())); // Sun=0, Sat=6
  return t.toISOString().slice(0, 10);
}

type Item = {
  time: "BMO" | "AMC" | "TBD";
  symbol: string;
  companyName: string;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
  mktCap: number | null; // not supplied by AV; we leave null for now
};

async function fetchAlphaVantage() {
  const key = process.env.ALPHA_VANTAGE_KEY;
  if (!key) {
    return { items: [], stale: true, source: "Alpha Vantage", error: "Missing ALPHA_VANTAGE_KEY" };
  }

  // calendar docs: https://www.alphavantage.co/documentation/#earnings-calendar
  // returns the next horizon (3/6/12 months); we filter by date == yesterday
  const url = `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&horizon=3month&apikey=${key}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    next: { revalidate: 600 },
  });
  if (!r.ok) {
    return { items: [], stale: true, source: "Alpha Vantage", error: `HTTP ${r.status}` };
  }
  const data = await r.json();
  const raw = Array.isArray(data?.earningsCalendar) ? data.earningsCalendar : [];

  const yday = previousUSMarketDay();
  const rows = raw.filter((x: any) => x?.reportDate === yday);

  // Map to our display model. Alpha Vantage does not supply BMO/AMC reliably -> set TBD
  const items: Item[] = rows.slice(0, 30).map((x: any) => {
    const est = x?.estimate != null ? Number(x.estimate) : null;
    const act = x?.eps != null ? Number(x.eps) : null;
    const surprisePct =
      est != null && act != null && est !== 0 ? ((act - est) / Math.abs(est)) * 100 : null;
    return {
      time: "TBD",
      symbol: x?.symbol ?? "",
      companyName: x?.name ?? x?.symbol ?? "",
      epsActual: Number.isFinite(act) ? act : null,
      epsEstimate: Number.isFinite(est) ? est : null,
      surprisePct: Number.isFinite(surprisePct) ? Number(surprisePct.toFixed(1)) : null,
      mktCap: null,
    };
  });

  return { items, stale: false, source: "Alpha Vantage" };
}

export async function GET() {
  const res = await fetchAlphaVantage();
  return NextResponse.json(res, { headers: { "Cache-Control": "no-store" } });
}
