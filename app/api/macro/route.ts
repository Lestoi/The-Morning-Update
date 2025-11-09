// /app/api/macro/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// --- Types are intentionally loose to be resilient to provider changes ---
type MarketAuxCalendarRow = {
  id?: string | number;
  country?: string;
  title?: string;
  event?: string;                // some variants use event/title
  date?: string;                 // ISO timestamp
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
  unit?: string | null;
  importance?: string | number | null; // "low/medium/high" or numeric
  category?: string | null;
  source?: string | null;
  [key: string]: any;
};

type MacroRow = {
  time: string;       // "HH:MM UK" after we convert
  country: string;
  release: string;
  actual: string | null;
  previous: string | null;
  consensus: string | null;
  forecast: string | null;
  tier: "T1" | "T2" | "T3";
};

function toUKTimeLabel(iso?: string): string {
  if (!iso) return "—";
  try {
    const dt = new Date(iso);
    // show UK time HH:MM; hide seconds
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(dt);
  } catch {
    return "—";
  }
}

function fmt(x: unknown): string | null {
  if (x === undefined || x === null) return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  // keep integers as ints; decimals to 1–2 dp
  return Math.abs(n - Math.trunc(n)) < 1e-6 ? String(Math.trunc(n)) : n.toFixed(2);
}

// A tiny importance map so key US prints are always T1 (you can expand later)
const T1_KEYWORDS = [
  "nonfarm payroll", "nfp", "unemployment rate",
  "cpi", "core cpi", "pce", "core pce",
  "ism manufacturing", "ism services",
  "u. of michigan", "university of michigan", "consumer sentiment",
  "baker hughes", "rig count",
  "gdp", "advance gdp", "retail sales", "core retail sales",
];
function toTier(name: string | undefined, importance?: string | number | null): "T1" | "T2" | "T3" {
  const n = (name || "").toLowerCase();
  if (T1_KEYWORDS.some(k => n.includes(k))) return "T1";
  if (typeof importance === "string" && importance.toLowerCase() === "high") return "T1";
  if (typeof importance === "number" && importance >= 3) return "T1";
  if (typeof importance === "string" && importance.toLowerCase() === "medium") return "T2";
  if (typeof importance === "number" && importance === 2) return "T2";
  return "T3";
}

export async function GET() {
  const apiKey = process.env.MARKETAUX_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { items: [], stale: true, source: "MarketAux", error: "Missing MARKETAUX_KEY" },
      { status: 200 }
    );
  }

  // date range = "today" (UTC) to avoid 404 on empty days we'll still return empty list gracefully
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;

  // MarketAux calendar endpoint (kept flexible; they allow filters like countries=us)
  // NOTE: If your plan limits params, the minimal working query is countries=us & date=today.
  const url = new URL("https://api.marketaux.com/v1/economy/calendar");
  url.searchParams.set("countries", "us");
  // Some accounts use 'date' while others use start/end; support both by trying date first
  url.searchParams.set("date", today);
  url.searchParams.set("api_token", apiKey);

  let raw: any;
  let rows: MarketAuxCalendarRow[] = [];
  let errorMsg: string | undefined;

  try {
    const res = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      errorMsg = `HTTP ${res.status}`;
    } else {
      raw = await res.json().catch(() => ({}));
      // MarketAux typically returns { data: [...] } or { calendar: [...] }
      rows = (raw?.data ?? raw?.calendar ?? []) as MarketAuxCalendarRow[];
    }

    // If provider uses start/end instead, retry once with that pattern when we got no rows and no hard error
    if (!errorMsg && rows.length === 0) {
      const url2 = new URL("https://api.marketaux.com/v1/economy/calendar");
      url2.searchParams.set("countries", "us");
      url2.searchParams.set("start_date", today);
      url2.searchParams.set("end_date", today);
      url2.searchParams.set("api_token", apiKey);
      const res2 = await fetch(url2.toString(), { next: { revalidate: 0 } });
      if (!res2.ok) {
        errorMsg = `HTTP ${res2.status}`;
      } else {
        const raw2 = await res2.json().catch(() => ({}));
        rows = (raw2?.data ?? raw2?.calendar ?? []) as MarketAuxCalendarRow[];
      }
    }
  } catch (e: any) {
    errorMsg = `fetch failed: ${e?.message ?? "unknown"}`;
  }

  // Map to your table shape
  const items: MacroRow[] = rows.map((r) => {
    const name = (r.title ?? r.event ?? "").toString();
    return {
      time: toUKTimeLabel(r.date),
      country: (r.country ?? "US").toString(),
      release: name || "Unnamed release",
      actual: fmt(r.actual),
      previous: fmt(r.previous),
      consensus: fmt(r.consensus),
      forecast: fmt(r.forecast),
      tier: toTier(name, r.importance),
    };
  })
  // Only US and only items that have at least a name or actual/consensus/forecast
  .filter(x =>
    (x.country.toUpperCase() === "US" || x.country.toUpperCase() === "UNITED STATES") &&
    (x.release || x.actual || x.consensus || x.forecast)
  )
  // Stable ordering by time then name
  .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : a.release.localeCompare(b.release)));

  return NextResponse.json(
    {
      items,
      stale: Boolean(errorMsg || !rows.length),   // mark stale when provider returned nothing or errored
      source: "MarketAux",
      ...(errorMsg ? { error: errorMsg } : {}),
    },
    { status: 200 }
  );
}
