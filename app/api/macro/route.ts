export const dynamic = "force-dynamic";

/**
 * EconDB macro calendar (public & free)
 * Example endpoint: https://www.econdb.com/api/calendar/?country=US&limit=20
 * Produces time, country, release, actual, previous, consensus, forecast, and tier.
 */

type Tier = 1 | 2 | 3;

type MacroRow = {
  timeUK: string;
  country: string;
  release: string;
  tier: Tier;
  actual?: string;
  previous?: string;
  consensus?: string;
  forecast?: string;
};

function toUKTimeLabel(iso: string | number | Date): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/London",
    }).format(d);
  } catch {
    return "—";
  }
}

function classifyTier(name: string): Tier {
  const s = name.toLowerCase();
  if (
    /nonfarm|payroll|cpi|pce|fomc|fed|core inflation|core cpi|jobs report|unemployment/i.test(s)
  )
    return 1;
  if (/pmi|ism|retail|gdp|ppi|housing|sentiment|confidence|durable/i.test(s))
    return 2;
  return 3;
}

export async function GET() {
  try {
    // EconDB provides daily economic calendar JSON
    const url = "https://www.econdb.com/api/calendar/?country=US&limit=50";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error("Failed to fetch EconDB calendar");
    }

    const data = await res.json();
    const items = Array.isArray(data?.results) ? data.results : [];

    const mapped: MacroRow[] = items
      .filter((x) => x?.date && x?.event)
      .map((x) => {
        const release = x.event?.trim() || "Unnamed release";
        const timeUK = toUKTimeLabel(x.date);
        const actual = x.actual || undefined;
        const previous = x.previous || undefined;
        const consensus = x.consensus || undefined;
        const forecast = x.forecast || undefined;
        const tier = classifyTier(release);

        return {
          timeUK,
          country: "United States",
          release,
          actual,
          previous,
          consensus,
          forecast,
          tier,
        };
      })
      .sort((a, b) => (a.timeUK > b.timeUK ? 1 : -1));

    return Response.json({ items: mapped, stale: false, source: "EconDB" });
  } catch (err) {
    return Response.json({
      items: [],
      stale: true,
      error: (err as Error).message,
      source: "EconDB",
    });
  }
}
