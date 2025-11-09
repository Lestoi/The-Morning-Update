// /app/api/macro/route.ts
export const dynamic = 'force-dynamic';

type MacroRow = {
  time: string;
  country: string;
  release: string;
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
  tier?: 'T1' | 'T2' | 'T3';
};

type MacroResp = { items: MacroRow[]; stale: boolean; source: string; error?: string };

function todayYMD_UK(): string {
  // UK “day” display; the API itself doesn’t care about timezone for YYYY-MM-DD
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function safeNum(x: any): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(String(x).replace(/[,%]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function importanceToTier(imp?: number | string): 'T1' | 'T2' | 'T3' | undefined {
  const n = typeof imp === 'string' ? Number(imp) : imp;
  if (n === 3) return 'T1';
  if (n === 2) return 'T2';
  if (n === 1) return 'T3';
  return undefined;
}

async function tryEconDB(url: string, token: string) {
  const r = await fetch(url, {
    headers: { Authorization: `Token ${token}` },
    // We don’t cache calendar
    cache: 'no-store',
  });
  return r;
}

function mapEconDBItems(raw: any[]): MacroRow[] {
  // EconDB calendar commonly returns fields like:
  // date, time, country, name, actual, previous, consensus, forecast, importance
  return (raw || []).map((x: any) => ({
    time: x?.time ?? '—',
    country: x?.country ?? 'US',
    release: x?.name ?? x?.release ?? '—',
    actual: x?.actual ?? null,
    previous: x?.previous ?? null,
    consensus: x?.consensus ?? null,
    forecast: x?.forecast ?? null,
    tier: importanceToTier(x?.importance),
  }));
}

export async function GET() {
  const token = process.env.ECONDB_API_KEY || '';
  const date = todayYMD_UK();

  if (!token) {
    const empty: MacroResp = {
      items: [],
      stale: true,
      source: 'EconDB',
      error: 'Missing ECONDB_API_KEY',
    };
    return Response.json(empty, { status: 200 });
  }

  const bases = [
    // single-day query
    `https://www.econdb.com/api/calendar/?date=${date}&country=United%20States`,
    `https://www.econdb.com/api/calendar/?date=${date}&country=US`,

    // start/end window (some installs prefer this)
    `https://www.econdb.com/api/calendar/?start_date=${date}&end_date=${date}&country=United%20States`,
    `https://www.econdb.com/api/calendar/?start_date=${date}&end_date=${date}&country=US`,
  ];

  let lastErr: string | undefined;
  for (const url of bases) {
    try {
      const res = await tryEconDB(url, token);

      if (res.status === 404) {
        // Often means “no items for that day” on EconDB’s calendar
        lastErr = `EconDB 404 (no items for ${date} at ${url})`;
        continue;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        lastErr = `HTTP ${res.status}: ${text || 'fetch failed'}`;
        continue;
      }

      const json = await res.json().catch(() => null);
      // EconDB often wraps as { results: [...] } or { data: [...] } depending on endpoint version
      const arr = Array.isArray(json) ? json : (json?.results ?? json?.data ?? []);
      const items = mapEconDBItems(arr);

      const ok: MacroResp = {
        items,
        stale: false,
        source: 'EconDB',
        ...(items.length === 0 ? { error: `No items for ${date}` } : {}),
      };
      return Response.json(ok, { status: 200 });
    } catch (e: any) {
      lastErr = e?.message || 'fetch error';
      continue;
    }
  }

  // If all attempts fail, return a graceful empty/stale payload so the UI stays up.
  const fail: MacroResp = {
    items: [],
    stale: true,
    source: 'EconDB',
    error: lastErr || 'Unknown error',
  };
  return Response.json(fail, { status: 200 });
}
