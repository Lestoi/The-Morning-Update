// /app/api/earnings-yday/route.ts
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

type FinnhubEarnings = {
  date: string;              // "2025-11-07"
  symbol: string;            // "AAPL"
  epsActual: number | null;  // may be null
  epsEstimate: number | null;
  surprise: number | null;         // absolute
  surprisePercent: number | null;  // %
  time?: 'bmo' | 'amc' | 'tbd' | string; // sometimes provided
  name?: string;              // company name (sometimes present)
};

type OutRow = {
  time: 'BMO' | 'AMC' | 'TBD';
  symbol: string;
  companyName: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
  result: string | null; // "beat"/"miss"/"in-line" or null
};

function toISODate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// crude “yesterday” in UTC; good enough for daily snapshots
function yesterdayUTC() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d;
}

function classifyResult(act: number | null, est: number | null): string | null {
  if (typeof act !== 'number' || !Number.isFinite(act)) return null;
  if (typeof est !== 'number' || !Number.isFinite(est)) return null;
  if (Math.abs(est) < 1e-12) return 'in-line';
  const diff = act - est;
  // 1% band as “in-line”
  const pct = (diff / Math.abs(est)) * 100;
  if (pct > 1) return 'beat';
  if (pct < -1) return 'miss';
  return 'in-line';
}

export async function GET() {
  try {
    const token = process.env.FINNHUB_API_KEY;
    if (!token) {
      return NextResponse.json(
        { items: [], stale: true, source: 'Finnhub', error: 'Missing FINNHUB_API_KEY' },
        { status: 200 }
      );
    }

    const y = toISODate(yesterdayUTC());

    const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
    url.searchParams.set('from', y);
    url.searchParams.set('to', y);
    url.searchParams.set('token', token);

    const r = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!r.ok) {
      return NextResponse.json(
        { items: [], stale: true, source: 'Finnhub', error: `HTTP ${r.status}` },
        { status: 200 }
      );
    }

    const data: { earningsCalendar?: FinnhubEarnings[] } = await r.json();

    const rows: OutRow[] = (data.earningsCalendar ?? [])
      // filter obvious non-US if Finnhub includes them (most are US anyway)
      .map((e) => {
        const time =
          e.time?.toLowerCase() === 'bmo' ? 'BMO' :
          e.time?.toLowerCase() === 'amc' ? 'AMC' : 'TBD';

        const epsAct = (typeof e.epsActual === 'number' && Number.isFinite(e.epsActual))
          ? Number(e.epsActual.toFixed(2)) : null;
        const epsEst = (typeof e.epsEstimate === 'number' && Number.isFinite(e.epsEstimate))
          ? Number(e.epsEstimate.toFixed(2)) : null;

        let surprisePct: number | null = null;
        if (typeof e.surprisePercent === 'number' && Number.isFinite(e.surprisePercent)) {
          surprisePct = Number(e.surprisePercent.toFixed(1));
        } else if (epsAct !== null && epsEst !== null && Math.abs(epsEst) > 1e-12) {
          surprisePct = Number((((epsAct - epsEst) / Math.abs(epsEst)) * 100).toFixed(1));
        }

        const result = classifyResult(epsAct, epsEst);

        return {
          time,
          symbol: e.symbol,
          companyName: e.name ?? null,
          epsActual: epsAct,
          epsEstimate: epsEst,
          surprisePct,
          result,
        };
      })
      // keep it tidy: most notable first (has EPS + bigger surprise)
      .sort((a, b) => {
        const ap = Math.abs(a.surprisePct ?? 0);
        const bp = Math.abs(b.surprisePct ?? 0);
        return bp - ap;
      });

    return NextResponse.json(
      { items: rows, stale: false, source: 'Finnhub' },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { items: [], stale: true, source: 'Finnhub', error: err?.message ?? 'unknown error' },
      { status: 200 }
    );
  }
}
