// app/api/earnings-yday/route.ts
export const dynamic = 'force-dynamic';

type FinnhubEarning = {
  date: string;                 // "2025-11-07"
  symbol: string;               // "AAPL"
  epsActual: number | null;     // may be null
  epsEstimate: number | null;   // may be null
  time?: string | null;         // "bmo", "amc", "tbd", sometimes undefined
  surprise?: number | null;     // Finnhub sometimes provides this
  surprisePercent?: number | null;
};

type OutRow = {
  time: 'BMO' | 'AMC' | 'TBD';
  symbol: string;
  companyName: string | null;   // we can enrich later
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
  mktCap: number | null;        // enrichment later
};

function toUSDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Normalise Finnhub "time" → our enum
function normaliseSession(t?: string | null): 'BMO' | 'AMC' | 'TBD' {
  const v = (t ?? '').toLowerCase();
  if (v === 'bmo') return 'BMO';
  if (v === 'amc') return 'AMC';
  return 'TBD';
}

// Safe numeric parse → number | null
function asNum(n: unknown): number | null {
  const v = typeof n === 'string' ? Number(n) : (typeof n === 'number' ? n : NaN);
  return Number.isFinite(v) ? v : null;
}

export async function GET() {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return Response.json(
      { items: [], stale: true, source: 'Finnhub', error: 'Missing FINNHUB_API_KEY' },
      { status: 200 }
    );
  }

  try {
    // Yesterday in UTC (Finnhub calendar is date-based; yesterday is what we want)
    const now = new Date();
    const yday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
    const from = toUSDate(yday);
    const to = from;

    const url = new URL('https://finnhub.io/api/v1/calendar/earnings');
    url.searchParams.set('from', from);
    url.searchParams.set('to', to);
    url.searchParams.set('token', token);

    const r = await fetch(url.toString(), { cache: 'no-store' });
    if (!r.ok) {
      return Response.json(
        { items: [], stale: true, source: 'Finnhub', error: `HTTP ${r.status}` },
        { status: 200 }
      );
    }

    const j = await r.json() as { earningsCalendar?: FinnhubEarning[] } | unknown;

    const arr: FinnhubEarning[] = Array.isArray((j as any)?.earningsCalendar)
      ? (j as any).earningsCalendar
      : [];

    // Map to our unified shape
    const rows: OutRow[] = arr.map((e: FinnhubEarning): OutRow => {
      const time = normaliseSession(e.time);
      const epsActual = asNum(e.epsActual);
      const epsEstimate = asNum(e.epsEstimate);

      // Prefer provider surprisePct if present, else compute
      const surprisePct =
        asNum((e as any).surprisePercent) ??
        (Number.isFinite(epsActual) && Number.isFinite(epsEstimate) && epsEstimate! !== 0
          ? Number((((epsActual! - epsEstimate!) / Math.abs(epsEstimate!)) * 100).toFixed(1))
          : null);

      return {
        time,
        symbol: e.symbol,
        companyName: null, // enrichment later to avoid extra calls/rate limits
        epsActual,
        epsEstimate,
        surprisePct,
        mktCap: null
      };
    });

    // Light post-filter: keep plausible US tickers (reduce noise)
    const filtered: OutRow[] = rows.filter(r => /^[A-Z.\-]{1,6}$/.test(r.symbol));

    // Sort (optional): AMC last, BMO first, TBD in middle
    const order = { BMO: 0, TBD: 1, AMC: 2 } as const;
    filtered.sort((a, b) => (order[a.time] - order[b.time]) || a.symbol.localeCompare(b.symbol));

    return Response.json(
      { items: filtered, stale: false, source: 'Finnhub' },
      { status: 200 }
    );
  } catch (err: any) {
    return Response.json(
      { items: [], stale: true, source: 'Finnhub', error: err?.message ?? 'fetch failed' },
      { status: 200 }
    );
  }
}
