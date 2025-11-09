// /app/api/macro/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

// --- Types you already expect on the page ---
type MacroRow = {
  time: string;        // e.g., "13:30"
  country: string;     // e.g., "US"
  release: string;     // name
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
  tier?: 'T1' | 'T2' | 'T3';
};

function toUKTimeLabel(isoOrDate: string) {
  // EconDB sends date + time (UTC). We show UK time label.
  const d = new Date(isoOrDate);
  // Format HH:MM (24h) UK
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
    hour12: false,
  }).format(d);
}

// Optional: Light normalization to numeric where safe
function numOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(
    String(v)
      .replace(/[,%]/g, '') // strip commas and %
      .trim()
  );
  return Number.isFinite(n) ? n : null;
}

// --- Tier override map (you can tweak anytime) ---
const TIER_OVERRIDES: Record<string, 'T1' | 'T2' | 'T3'> = {
  'Nonfarm Payrolls': 'T1',
  'Unemployment Rate': 'T1',
  'CPI (YoY)': 'T1',
  'CPI (MoM)': 'T1',
  'Core CPI (YoY)': 'T1',
  'Core CPI (MoM)': 'T1',
  'Core PCE Price Index (YoY)': 'T1',
  'Core PCE Price Index (MoM)': 'T1',
  'ISM Manufacturing PMI': 'T1',
  'ISM Services PMI': 'T1',
  'Michigan Consumer Sentiment': 'T2',
  'Baker Hughes Rig Count': 'T3',
};

// EconDB → our label harmonizer. You can add mappings as you see them.
function mapEconDBNameToRelease(e: any): string {
  const raw = (e?.event || e?.name || '').trim();

  // A few fast paths:
  if (/nonfarm payroll/i.test(raw)) return 'Nonfarm Payrolls';
  if (/unemployment rate/i.test(raw)) return 'Unemployment Rate';
  if (/core pce/i.test(raw) && /yoy/i.test(raw)) return 'Core PCE Price Index (YoY)';
  if (/core pce/i.test(raw) && /mom/i.test(raw)) return 'Core PCE Price Index (MoM)';
  if (/core cpi/i.test(raw) && /yoy/i.test(raw)) return 'Core CPI (YoY)';
  if (/core cpi/i.test(raw) && /mom/i.test(raw)) return 'Core CPI (MoM)';
  if (/cpi/i.test(raw) && /yoy/i.test(raw)) return 'CPI (YoY)';
  if (/cpi/i.test(raw) && /mom/i.test(raw)) return 'CPI (MoM)';
  if (/ism.*manufact/i.test(raw)) return 'ISM Manufacturing PMI';
  if (/ism.*services/i.test(raw)) return 'ISM Services PMI';
  if (/michigan/i.test(raw) && /sentiment/i.test(raw)) return 'Michigan Consumer Sentiment';
  if (/baker.*rig/i.test(raw)) return 'Baker Hughes Rig Count';

  return raw || 'Unnamed release';
}

function tierForRelease(name: string): 'T1' | 'T2' | 'T3' {
  return TIER_OVERRIDES[name] ?? 'T3';
}

function todayISO() {
  // one calendar day in UTC
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = `${now.getUTCMonth() + 1}`.padStart(2, '0');
  const d = `${now.getUTCDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function GET() {
  const token = process.env.ECONDB_API_KEY;
  const items: MacroRow[] = [];

  if (!token) {
    return NextResponse.json(
      { items, stale: true, source: 'EconDB', error: 'Missing ECONDB_API_KEY' },
      { status: 200 },
    );
  }

  try {
    // EconDB calendar — US for today
    // Docs: https://www.econdb.com/api/calendar/
    const date = todayISO();
    const url = new URL('https://www.econdb.com/api/calendar/');
    url.searchParams.set('countries', 'US');
    url.searchParams.set('date_from', date);
    url.searchParams.set('date_to', date);
    url.searchParams.set('token', token);

    const resp = await fetch(url.toString(), {
      // small cache so the route doesn’t hammer EconDB if many users open at once
      next: { revalidate: 90 },
    });

    if (!resp.ok) {
      return NextResponse.json(
        { items: [], stale: true, source: 'EconDB', error: `HTTP ${resp.status}` },
        { status: 200 },
      );
    }

    const json = await resp.json();

    // EconDB returns { data: [ ...events ] } (shape can vary; we guard safely)
    const arr = Array.isArray(json?.data) ? json.data : [];

    for (const e of arr) {
      // EconDB often has fields like:
      // e.datetime (UTC timestamp), e.country, e.event, e.actual, e.previous, e.consensus, e.forecast
      const releaseName = mapEconDBNameToRelease(e);
      const timeLabel = e?.datetime ? toUKTimeLabel(e.datetime) : '—';

      items.push({
        time: timeLabel,
        country: e?.country || 'US',
        release: releaseName,
        actual: e?.actual ?? null,
        previous: e?.previous ?? null,
        consensus: e?.consensus ?? null,
        forecast: e?.forecast ?? null,
        tier: tierForRelease(releaseName),
      });
    }

    // Sort by (1) time, (2) tier (T1 → T3), then name
    const tierRank: Record<'T1'|'T2'|'T3', number> = { T1: 1, T2: 2, T3: 3 };
    items.sort((a, b) => {
      const tA = a.time ?? '';
      const tB = b.time ?? '';
      if (tA !== tB) return tA.localeCompare(tB);
      const rA = tierRank[a.tier ?? 'T3'];
      const rB = tierRank[b.tier ?? 'T3'];
      if (rA !== rB) return rA - rB;
      return (a.release || '').localeCompare(b.release || '');
    });

    return NextResponse.json({ items, stale: false, source: 'EconDB' }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { items: [], stale: true, source: 'EconDB', error: String(err?.message || err) },
      { status: 200 },
    );
  }
}
