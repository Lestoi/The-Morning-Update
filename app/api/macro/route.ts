// /app/api/macro/route.ts — FRED calendar with smart fallback to the next release day
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type FredReleaseDate = { date: string; release_id: number };
type FredReleaseDatesResp = { release_dates?: FredReleaseDate[] };

type FredRelease = { id: number; name: string; press_release: boolean; link?: string };
type FredReleaseListResp = { releases?: FredRelease[] };

type Row = {
  timeUK: string;     // shown in your table
  country: string;    // "US"
  release: string;    // e.g., "CPI (2025-11-10)" on fallback days
  actual: string;
  previous: string;
  consensus: string;
  forecast: string;
  tier: "T1" | "T2" | "T3";
};

const IMPORTANT_KEYWORDS = [
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

function addDaysUTC(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
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
  return "T3";
}

async function fetchFred<T>(url: string) {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

async function getReleaseIdsForDate(apiKey: string, isoDate: string) {
  const url = `https://api.stlouisfed.org/fred/releases/dates?api_key=${apiKey}&file_type=json&realtime_start=${isoDate}&realtime_end=${isoDate}&include_release_ids=true&offset=0&limit=1000`;
  const json = await fetchFred<FredReleaseDatesResp>(url);
  return (json.release_dates || [])
    .filter(d => d.date === isoDate)
    .map(d => d.release_id);
}

async function getReleaseDirectory(apiKey: string) {
  const url = `https://api.stlouisfed.org/fred/releases?api_key=${apiKey}&file_type=json&limit=1000`;
  const json = await fetchFred<FredReleaseListResp>(url);
  return new Map<number, FredRelease>((json.releases || []).map(r => [r.id, r]));
}

function mapRows(
  dateISO: string,
  ids: number[],
  dir: Map<number, FredRelease>,
  isToday: boolean
): Row[] {
  const rows: Row[] = [];
  for (const id of ids) {
    const rel = dir.get(id);
    if (!rel) continue;
    const name = rel.name || "US release";
    const tier = inferTier(name);
    if (tier === "T3") continue; // keep it tight for your morning view

    rows.push({
      timeUK: isToday ? toUKTime(new Date(`${dateISO}T13:30:00Z`)) : "—",
      country: "US",
      release: isToday ? name : `${name} (${dateISO})`,
      actual: "—",
      previous: "—",
      consensus: "—",
      forecast: "—",
      tier,
    });
  }
  return rows.sort((a, b) => a.release.localeCompare(b.release));
}

export async function GET() {
  const apiKey = process.env.FRED_API_KEY || "";
  if (!apiKey) {
    return Response.json(
      { items: [], stale: true, source: "FRED", error: "Missing FRED_API_KEY" },
      { status: 200 }
    );
  }

  try {
    const today = toISODate(new Date());
    const dir = await getReleaseDirectory(apiKey);

    // 1) Try TODAY first
    const todayIds = await getReleaseIdsForDate(apiKey, today);
    let items = mapRows(today, todayIds, dir, true);

    // 2) If empty, find the NEXT release day in the next 7 days
    if (items.length === 0) {
      for (let i = 1; i <= 7; i++) {
        const dISO = toISODate(addDaysUTC(new Date(), i));
        const ids = await getReleaseIdsForDate(apiKey, dISO);
        const nextItems = mapRows(dISO, ids, dir, false);
        if (nextItems.length) {
          items = nextItems;
          break;
        }
      }
    }

    return Response.json({ items, stale: false, source: "FRED" });
  } catch (e) {
    return Response.json(
      { items: [], stale: true, source: "FRED", error: (e as Error).message },
      { status: 200 }
    );
  }
}
