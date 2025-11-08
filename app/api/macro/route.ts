// /app/api/macro/route.ts
export const dynamic = "force-dynamic";

type FmpCal = {
  date?: string;           // "2025-11-08"
  country?: string;        // "US"
  event?: string;          // "Nonfarm Payrolls"
  actual?: string | number;
  previous?: string | number;
  change?: string | number;
  changePercentage?: string | number;
  estimate?: string | number;
  impact?: string;         // sometimes: "High" | "Medium" | "Low"
  time?: string;           // sometimes available
};

type Row = {
  timeUK: string;
  country: string;
  release: string;
  actual: string;
  previous: string;
  consensus: string;
  forecast: string;
  tier: "T1" | "T2" | "T3";
};

const TIER1 = [
  "Nonfarm Payrolls", "Unemployment Rate", "CPI", "Core CPI",
  "PCE Price Index", "Core PCE", "FOMC Rate Decision", "GDP", "Core PPI"
];

function toISODate(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function asStr(v: any) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

function pickTier(item: FmpCal): "T1" | "T2" | "T3" {
  const name = (item.event || "").toLowerCase();
  if (TIER1.some(x => name.includes(x.toLowerCase()))) return "T1";
  const impact = (item.impact || "").toLowerCase();
  if (impact.includes("high")) return "T1";
  if (impact.includes("medium")) return "T2";
  return "T3";
}

function toUKTime(d: Date) {
  // UK time regardless of server location
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  return fmt.format(d);
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY || "demo";
  // FMP economic calendar supports date range
  const today = toISODate(new Date());
  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${today}&to=${today}&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`FMP economic_calendar HTTP ${res.status}`);
    const data = (await res.json()) as FmpCal[];

    const items: Row[] = data
      .filter(x => (x.country || "").toUpperCase() === "US")
      .map(x => {
        // Build a Date in UTC from date + time if FMP gives both; else assume 13:30 UTC (common release time) to avoid blank
        const when = (() => {
          const base = x.date ? `${x.date}T00:00:00Z` : new Date().toISOString();
          const d = new Date(base);
          return d;
        })();

        return {
          timeUK: toUKTime(when),
          country: x.country || "US",
          release: x.event || "Unnamed release",
          actual: asStr(x.actual),
          previous: asStr(x.previous),
          consensus: asStr(x.estimate),
          forecast: asStr(x.estimate), // FMP uses estimate; we mirror to forecast column
          tier: pickTier(x),
        };
      })
      // simple de-dup + sort by UK time
      .filter((r, idx, arr) => arr.findIndex(k => k.release === r.release && k.timeUK === r.timeUK) === idx)
      .sort((a, b) => a.timeUK.localeCompare(b.timeUK));

    return Response.json({ items, stale: false, source: "FMP" });
  } catch (e) {
    return Response.json({ items: [], stale: true, error: (e as Error).message, source: "FMP" }, { status: 200 });
  }
}
