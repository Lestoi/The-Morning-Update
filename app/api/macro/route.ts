export const dynamic = "force-dynamic";

/**
 * EconDB macro calendar (public & free)
 * Endpoint: https://www.econdb.com/api/calendar/?country=US&limit=50
 * Outputs rows for your table: timeUK, country, release, actual, previous, consensus, forecast, tier.
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

// EconDB result typing (best-effort; they may add fields)
type EconDBItem = {
  date: string;                    // ISO date/time string (UTC)
  event?: string | null;
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
};

type EconDBResponse = {
  results?: EconDBItem[];
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
  if (/nonfarm|payroll|cpi|pce|fomc|fed|core inflation|core cpi|jobs report|unemployment/i.test(s)) return 1;
  if (/pmi|ism|retail|gdp|ppi|housing|sentiment|confidence|durable/i.test(s)) return 2;
  return 3;
}

function fmt(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

export async function GET() {
  try {
    const url = "https://www.econdb.com/api/calendar/?country=US&limit=50";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error(`EconDB HTTP ${res.status}`);
    }

    const data: EconDBResponse = await res.json();
    const items: EconDBItem[] = Array.isArray(data?.results) ? (data!.results as EconDBItem[]) : [];

    const mapped: MacroRow[] = items
      .filter((x: EconDBItem) => Boolean(x?.date && x?.event))
      .map((x: EconDBItem) => {
        const release = (x.event ?? "").toString().trim() || "Unnamed release";
        const timeUK = toUKTimeLabel(x.date);
        const actual = fmt(x.actual);
        const previous = fmt(x.previous);
        const consensus = fmt(x.consensus);
        const forecast = fmt(x.forecast);
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
      .sort((a: MacroRow, b: MacroRow) => (a.timeUK > b.timeUK ? 1 : a.timeUK < b.timeUK ? -1 : 0));

    return Response.json({ items: mapped, stale: false, source: "EconDB" });
  } catch (err) {
    return Response.json({
      items: [],
      stale: true,
      error: (err as Error)?.message ?? "Unknown error",
      source: "EconDB",
    });
  }
}
