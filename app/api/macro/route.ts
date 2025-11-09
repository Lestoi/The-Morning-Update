// /app/api/macro/route.ts
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type MarketAuxCalendarRow = {
  id?: string | number;
  country?: string;
  title?: string;
  event?: string;
  date?: string;
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
  importance?: string | number | null;
  [key: string]: any;
};

type MacroRow = {
  time: string;
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
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function fmt(x: unknown): string | null {
  if (x === undefined || x === null) return null;
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x);
  return Math.abs(n - Math.trunc(n)) < 1e-6 ? String(Math.trunc(n)) : n.toFixed(2);
}

const T1_KEYWORDS = [
  "nonfarm payroll",
  "nfp",
  "unemployment rate",
  "cpi",
  "core cpi",
  "pce",
  "core pce",
  "ism manufacturing",
  "ism services",
  "u. of michigan",
  "consumer sentiment",
  "baker hughes",
  "gdp",
  "retail sales",
];
function toTier(name: string | undefined, importance?: string | number | null): "T1" | "T2" | "T3" {
  const n = (name || "").toLowerCase();
  if (T1_KEYWORDS.some((k) => n.includes(k))) return "T1";
  if (typeof importance === "string" && importance.toLowerCase() === "high") return "T1";
  if (typeof importance === "number" && importance >= 3) return "T1";
  if (typeof importance === "string" && importance.toLowerCase() === "medium") return "T2";
  if (typeof importance === "number" && importance === 2) return "T2";
  return "T3";
}

// Helper to format YYYY-MM-DD
function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

// Add days to a Date
function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

async function fetchMarketAux(date: string, apiKey: string) {
  const url = new URL("https://api.marketaux.com/v1/economy/calendar");
  url.searchParams.set("countries", "us");
  url.searchParams.set("date", date);
  url.searchParams.set("api_token", apiKey);
  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  const json = await res.json().catch(() => ({}));
  const rows = (json?.data ?? json?.calendar ?? []) as MarketAuxCalendarRow[];
  return { ok: res.ok, rows, status: res.status };
}

export async function GET() {
  const apiKey = process.env.MARKETAUX_KEY;
  if (!apiKey)
    return NextResponse.json({ items: [], stale: true, source: "MarketAux", error: "Missing MARKETAUX_KEY" });

  const today = new Date();
  const date1 = dateStr(today);
  const res1 = await fetchMarketAux(date1, apiKey);

  let usedDate = date1;
  let usedRows = res1.rows;
  let errorMsg: string | undefined;

  // Fallback: if today is empty or 404, try the next 2 weekdays
  if ((!usedRows.length || res1.status === 404) && res1.ok) {
    for (let i = 1; i <= 3; i++) {
      const nextDate = dateStr(addDays(today, i));
      const resNext = await fetchMarketAux(nextDate, apiKey);
      if (resNext.rows.length) {
        usedDate = nextDate;
        usedRows = resNext.rows;
        break;
      }
    }
  }

  if (!usedRows.length) errorMsg = `HTTP ${res1.status}`;

  const items: MacroRow[] = usedRows
    .map((r) => {
      const name = r.title ?? r.event ?? "";
      return {
        time: toUKTimeLabel(r.date),
        country: r.country ?? "US",
        release: name || "Unnamed release",
        actual: fmt(r.actual),
        previous: fmt(r.previous),
        consensus: fmt(r.consensus),
        forecast: fmt(r.forecast),
        tier: toTier(name, r.importance),
      };
    })
    .filter((x) => x.country.toUpperCase().includes("US") && x.release)
    .sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : a.release.localeCompare(b.release)));

  return NextResponse.json({
    items,
    stale: !usedRows.length,
    source: "MarketAux",
    dateUsed: usedDate,
    ...(errorMsg ? { error: errorMsg } : {}),
  });
}
