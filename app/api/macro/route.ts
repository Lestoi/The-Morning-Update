// /app/api/macro/route.ts  — FRED-based macro calendar
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FredReleaseDate = { date: string; release_id: number };
type FredReleaseDatesResp = { release_dates?: FredReleaseDate[] };

type FredRelease = { id: number; name: string; press_release: boolean; link?: string };
type FredReleaseListResp = { releases?: FredRelease[] };

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

const IMPORTANT_KEYWORDS = [
  // Tier-1 words
  "nonfarm payroll", "employment situation",
  "consumer price index", "cpi", "core cpi",
  "pce", "core pce",
  "gdp", "gross domestic product",
  "fomc", "interest rate decision", "fed funds",
  "producer price index", "ppi", "core ppi",
  "retail sales",
  "ism manufacturing", "ism services",
  "michigan sentiment", "consumer sentiment",
  "jobless claims",
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

function inferTier(name: string): "T1" | "T2" | "T3" {
  const nm = name.toLowerCase();
  if (IMPORTANT_KEYWORDS.some(k => nm.includes(k))) return "T1";
  // You can expand here for T2 logic
  return "T3";
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { items: [], stale: true, source: "FRED", error: "Missing FRED_API_KEY" },
      { status: 200 }
    );
  }

  const today = toISODate(new Date());

  // 1) Which FRED release IDs have a release on 'today'?
  const datesUrl = `https://api.stlouisfed.org/fred/releases/dates?api_key=${apiKey}&file_type=json&realtime_start=${today}&realtime_end=${today}&include_release_ids=true&offset=0&limit=1000`;
  try {
    const datesRes = await fetch(datesUrl, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!datesRes.ok) {
      const t = await datesRes.text().catch(() => "");
      return Response.json(
        { items: [], stale: true, source: "FRED", error: `HTTP ${datesRes.status} ${t.slice(0,300)}` },
        { status: 200 }
      );
    }
    const datesJson = (await datesRes.json()) as FredReleaseDatesResp;
    const ids = (datesJson.release_dates || [])
      .filter(d => d.date === today)
      .map(d => d.release_id);

    if (!ids.length) {
      return Response.json({ items: [], stale: false, source: "FRED" });
    }

    // 2) Pull details of all releases and filter to US/high-signal
    const releaseListUrl = `https://api.stlouisfed.org/fred/releases?api_key=${apiKey}&file_type=json&limit=1000`;
    const relRes = await fetch(releaseListUrl, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!relRes.ok) {
      const t = await relRes.text().catch(() => "");
      return Response.json(
        { items: [], stale: true, source: "FRED", error: `HTTP ${relRes.status} ${t.slice(0,300)}` },
        { status: 200 }
      );
    }
    const relJson = (await relRes.json()) as FredReleaseListResp;
    const byId = new Map<number, FredRelease>((relJson.releases || []).map(r => [r.id, r]));

    const items: Row[] = ids
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(r => {
        const name = (r as FredRelease).name || "US release";
        const tier = inferTier(name);
        return {
          timeUK: toUKTime(new Date(`${today}T13:30:00Z`)), // FRED doesn’t always give a time; default NY 8:30am → 13:30 UK (adjust as you like)
          country: "US",
          release: name,
          actual: "—",
          previous: "—",
          consensus: "—",
          forecast: "—",
          tier,
        };
      })
      // Keep only Tier1/Tier2-ish names (you can widen later)
      .filter(r => r.tier !== "T3")
      .sort((a, b) => a.release.localeCompare(b.release));

    return Response.json({ items, stale: false, source: "FRED" });
  } catch (e) {
    return Response.json(
      { items: [], stale: true, source: "FRED", error: (e as Error).message },
      { status: 200 }
    );
  }
}
