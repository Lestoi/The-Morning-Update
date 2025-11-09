// /app/api/earnings-yday/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type FinnhubEps = {
  symbol: string;
  date: string;          // YYYY-MM-DD
  epsActual: number | null;
  epsEstimate: number | null;
  hour: 'bmo' | 'amc' | 'dmh' | null; // before/after/open; Finnhub uses bmo/amc in calendar API
};

type FinnhubCalendar = {
  earningsCalendar: Array<{
    date: string;        // YYYY-MM-DD
    symbol: string;
    epsActual: number | null;
    epsEstimate: number | null;
    hour: string | null; // "bmo"/"amc"/"dmh"
  }>;
};

type Row = {
  time: 'BMO' | 'AMC' | 'TBD';
  symbol: string;
  companyName: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
  mktCap: number | null;
};

function bucket(hour: string | null): Row['time'] {
  const h = (hour || '').toLowerCase();
  if (h === 'bmo') return 'BMO'; // Before Market Open
  if (h === 'amc') return 'AMC'; // After Market Close
  return 'TBD';                  // time not specified
}

function pctSurprise(act: number | null, est: number | null): number | null {
  if (act == null || est == null || est === 0) return null;
  return Number(((act - est) / Math.abs(est) * 100).toFixed(1));
}

async function fetchNameAndCap(symbol: string, finnhubKey: string): Promise<{ name: string | null; cap: number | null }> {
  try {
    const prof = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${finnhubKey}`, { cache: 'no-store' });
    if (!prof.ok) throw new Error('profile http ' + prof.status);
    const j = await prof.json() as { name?: string; marketCapitalization?: number };
    return { name: j?.name ?? null, cap: (typeof j?.marketCapitalization === 'number' ? j.marketCapitalization * 1e6 : null) };
  } catch {
    return { name: null, cap: null };
  }
}

export async function GET() {
  const key = process.env.FINNHUB_API_KEY;
  const out: Row[] = [];
  let error: string | null = null;
  let source = 'Finnhub';

  try {
    if (!key) throw new Error('Missing FINNHUB_API_KEY');

    // Yesterday in UTC (Finnhub uses date boundaries)
    const now = new Date();
    const y = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const yyyy = y.getUTCFullYear();
    const mm = String(y.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(y.getUTCDate()).padStart(2, '0');
    const iso = `${yyyy}-${mm}-${dd}`;

    // Earnings calendar for the day
    const url = `https://finnhub.io/api/v1/calendar/earnings?from=${iso}&to=${iso}&token=${key}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Finnhub HTTP ${r.status}`);
    const data = await r.json() as FinnhubCalendar;

    const raw = data?.earningsCalendar ?? [];

    // Keep US listings only (heuristic: symbol without dot suffix and has letters)
    const usOnly = raw.filter(x => /^[A-Z]+$/.test(x.symbol));

    // Fetch names + market caps in small batches
    const results: Row[] = [];
    for (const rec of usOnly) {
      const sym = rec.symbol;
      const { name, cap } = await fetchNameAndCap(sym, key);
      results.push({
        time: bucket(rec.hour || null),
        symbol: sym,
        companyName: name,
        epsActual: (typeof rec.epsActual === 'number' ? rec.epsActual : null),
        epsEstimate: (typeof rec.epsEstimate === 'number' ? rec.epsEstimate : null),
        surprisePct: pctSurprise(rec.epsActual ?? null, rec.epsEstimate ?? null),
        mktCap: cap,
      });
    }

    // Optional: keep only larger names (Top 10 by market cap)
    results.sort((a, b) => (b.mktCap ?? 0) - (a.mktCap ?? 0));
    out.push(...results.slice(0, 10));
  } catch (e: any) {
    error = e?.message || 'earnings fetch failed';
  }

  return NextResponse.json({
    items: out,
    stale: !!error,
    source,
    error: error || undefined,
  });
}
