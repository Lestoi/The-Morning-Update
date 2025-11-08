// /app/api/macro/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // ensure Node runtime on Vercel

type FmpCal = {
  date?: string;
  country?: string;
  event?: string;
  actual?: string | number;
  previous?: string | number;
  estimate?: string | number;
  impact?: string;
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

function toUKTime(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function pickTier(e?: string, impact?: string): "T1" | "T2" | "T3" {
  const name = (e || "").toLowerCase();
  if (TIER1.some(x => name.includes(x.toLowerCase()))) return "T1";
  const imp = (impact || "").toLowerCase();
  if (imp.includes("high")) return "T1";
  if (imp.includes("medium")) return "T2";
  return "T3";
}

function asStr(v: any) {
  if (v === null || v === undefined) return "—";
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY || "";
  const today = toISODate(new Date());
  const url = `https://financialmodelingprep.com/api/v3/economic_calendar?from=${today}&to=${today}&apikey=${apiKey || "demo"}`;

  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return Response.json(
        { items: [], stale: true, source: "FMP", error: `HTTP ${res.status} ${txt.slice(0,200)}` },
        { status: 200 }
      );
    }

    const json = (await res.json()) as FmpCal[];

    const items: Row[] = (json || [])
      .filter(x => (x.country || "").toUpperCase() === "US")
      .map(x => {
        // FMP sometimes omits time; we can keep only date and show UK time as "--"
        const d = x.date ? new Date(`${x.date}T00:00:00Z`) : new Date();
        return {
          timeUK: toUKTime(d),
          country: x.country || "US",
          release: x.event || "Unnamed release",
          actual: asStr(x.actual),
          previous: asStr(x.previous),
          consensus: asStr(x.estimate),
          forecast: asStr(x.estimate),
          tier: pickTier(x.event, x.impact),
        };
      })
      .filter((r, i, arr) => arr.findIndex(k => k.release === r.release && k.timeUK === r.timeUK) === i)
      .sort((a, b) => a.timeUK.localeCompare(b.timeUK));

    return Response.json({ items, stale: false, source: "FMP" });
  } catch (e) {
    return Response.json(
      { items: [], stale: true, source: "FMP", error: (e as Error).message },
      { status: 200 }
    );
  }
}
