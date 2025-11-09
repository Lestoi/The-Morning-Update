// /app/api/macro/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type EconDbItem = {
  date: string;            // ISO date (UTC)
  country: string;         // e.g. "US"
  ticker: string | null;   // econ series code
  event: string;           // event name
  actual: number | string | null;
  previous: number | string | null;
  consensus: number | string | null;
  forecast: number | string | null;
  importance: number | null; // 1..3 typically
  time?: string | null;      // HH:MM in UTC if present
};

type MacroRow = {
  time: string | null;
  country: string;
  release: string;
  actual: string | null;
  previous: string | null;
  consensus: string | null;
  forecast: string | null;
  tier: 'T1' | 'T2' | 'T3' | null;
};

function toUKClockLabel(dateISO: string, timeUTC?: string | null): string | null {
  // If API provides a time (UTC), render local (UK) clock label like "13:30"
  try {
    if (!timeUTC) return null;
    const [h, m] = timeUTC.split(':').map(Number);
    const d = new Date(dateISO);
    d.setUTCHours(h, m || 0, 0, 0);
    // UK is Europe/London; let the browser/env format to HH:MM using locale en-GB
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  } catch {
    return null;
  }
}

function toTier(importance: number | null): MacroRow['tier'] {
  if (importance == null) return null;
  if (importance >= 3) return 'T1';
  if (importance === 2) return 'T2';
  return 'T3';
}

function fmt(val: unknown): string | null {
  if (val == null) return null;
  const s = String(val).trim();
  return s.length ? s : null;
}

export async function GET() {
  const apiKey = process.env.ECONDB_API_KEY;
  const today = new Date();
  const yyyy = today.getUTCFullYear();
  const mm = String(today.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(today.getUTCDate()).padStart(2, '0');
  const iso = `${yyyy}-${mm}-${dd}`;

  const items: MacroRow[] = [];
  let error: string | null = null;
  let source = 'EconDB';

  try {
    if (!apiKey) {
      throw new Error('Missing ECONDB_API_KEY');
    }

    // EconDB calendar endpoint: US releases on the given date
    const url = `https://www.econdb.com/api/calendar/?countries=US&start=${iso}&end=${iso}&format=json&api_key=${apiKey}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`EconDB HTTP ${res.status}`);
    }
    const data = (await res.json()) as { data?: EconDbItem[] };

    const rows = (data?.data ?? [])
      .filter(x => (x.country || '').toUpperCase() === 'US')
      .map<MacroRow>((x) => ({
        time: toUKClockLabel(x.date, x.time ?? null),
        country: 'US',
        release: x.event,
        actual: fmt(x.actual),
        previous: fmt(x.previous),
        consensus: fmt(x.consensus),
        forecast: fmt(x.forecast),
        tier: toTier(x.importance),
      }));

    // Sort: T1 first, by time
    const tierRank = (t: MacroRow['tier']) => (t === 'T1' ? 0 : t === 'T2' ? 1 : t === 'T3' ? 2 : 3);
    rows.sort((a, b) => {
      const tr = tierRank(a.tier) - tierRank(b.tier);
      if (tr !== 0) return tr;
      // time ascending (nulls last)
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.release.localeCompare(b.release);
    });

    items.push(...rows);
  } catch (e: any) {
    error = e?.message || 'calendar fetch failed';
  }

  return NextResponse.json({
    items,
    stale: !!error,
    source,
    error: error || undefined,
  });
}
