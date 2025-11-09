// app/api/sentiment-snapshot/route.ts
export const dynamic = 'force-dynamic';

type AAIISnapshot = {
  bulls: number | null;
  bears: number | null;
  asOf: string | null;
};

type Snapshot = {
  vix: number | null;
  putCall: number | null;
  aaii: AAIISnapshot | null;
  fearGreed: number | null; // placeholder if you wire it later
  stale: boolean;
  sources: string[];
  updated?: string;
};

// ---- helpers ---------------------------------------------------------------

function asNum(n: unknown): number | null {
  const v = typeof n === 'string' ? Number(n) : (typeof n === 'number' ? n : NaN);
  return Number.isFinite(v) ? v : null;
}

// CSV splitter that handles quoted commas (simple but robust enough here)
function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (c === ',' && !inQ) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseAAIICSV(csv: string): AAIISnapshot | null {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const header = splitCSVLine(lines[0]).map(h => h.toLowerCase());
  const iBull = header.findIndex(h => h.includes('bull'));
  const iBear = header.findIndex(h => h.includes('bear'));
  const iDate = header.findIndex(h => h.includes('date'));
  if (iBull === -1 || iBear === -1) return null;

  // Use the last valid row
  for (let i = lines.length - 1; i >= 1; i--) {
    const cols = splitCSVLine(lines[i]);
    const bulls = asNum(cols[iBull]);
    const bears = asNum(cols[iBear]);
    if (bulls !== null && bears !== null) {
      const asOf = (iDate !== -1 && cols[iDate]) ? String(cols[iDate]) : null;
      return { bulls, bears, asOf };
    }
  }
  return null;
}

// Build absolute origin from request headers
function originFromHeaders(): string {
  // These are available in the Edge/Node runtime request context
  // but we don't have direct access here, so we infer from env+headers
  // We'll read standard proxy vars via globalThis (Next will inject them)
  const h = (globalThis as any)?.headers?.();
  let host: string | null = null;
  let proto: string | null = null;
  try {
    host = h?.get?.('x-forwarded-host') || h?.get?.('host') || process.env.VERCEL_URL || null;
    proto = h?.get?.('x-forwarded-proto') || (host && host.includes('localhost') ? 'http' : 'https') || 'https';
  } catch {
    host = process.env.VERCEL_URL || 'localhost:3000';
    proto = host.includes('localhost') ? 'http' : 'https';
  }
  return `${proto}://${host}`;
}

// ---- fetchers --------------------------------------------------------------

// Stooq VIX daily CSV
async function fetchVIX(): Promise<{ v: number | null; src: string }> {
  try {
    const u = 'https://stooq.com/q/d/l/?s=^vix&i=d';
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) return { v: null, src: 'Stooq (^VIX daily CSV)' };
    const csv = await r.text();
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return { v: null, src: 'Stooq (^VIX daily CSV)' };
    const last = lines[lines.length - 1].split(',');
    const close = asNum(last[4]); // Date,Open,High,Low,Close,Volume
    return { v: close, src: 'Stooq (^VIX daily CSV)' };
  } catch {
    return { v: null, src: 'Stooq (^VIX daily CSV)' };
  }
}

// CBOE total put/call ratio CSV
async function fetchPutCall(): Promise<{ v: number | null; src: string }> {
  try {
    const u = 'https://cdn.cboe.com/api/global/delayed_quotes/osc/pc.csv';
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) return { v: null, src: 'CBOE total put/call CSV' };
    const csv = await r.text();
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return { v: null, src: 'CBOE total put/call CSV' };
    // Find last numeric on the last line
    const last = lines[lines.length - 1].split(',').map(s => s.trim()).reverse();
    for (const cell of last) {
      const n = asNum(cell);
      if (n !== null) return { v: n, src: 'CBOE total put/call CSV' };
    }
    return { v: null, src: 'CBOE total put/call CSV' };
  } catch {
    return { v: null, src: 'CBOE total put/call CSV' };
  }
}

// AAII from your app's public CSV: /public/aaii.csv
async function fetchAAII(): Promise<{ a: AAIISnapshot | null; src: string }> {
  try {
    const origin = originFromHeaders();
    const url = `${origin}/aaii.csv`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return { a: null, src: '/aaii.csv (fetch failed)' };
    const csv = await r.text();
    const snap = parseAAIICSV(csv);
    return { a: snap, src: '/aaii.csv' };
  } catch {
    return { a: null, src: '/aaii.csv (fetch failed)' };
  }
}

// ---- route -----------------------------------------------------------------

export async function GET() {
  const [vix, pcr, aaii] = await Promise.all([fetchVIX(), fetchPutCall(), fetchAAII()]);

  const stale = (vix.v === null && pcr.v === null && aaii.a === null);
  const sources = [vix.src, 'CBOE total put/call CSV', aaii.src];
  const updated = new Date().toISOString();

  const body: Snapshot = {
    vix: vix.v,
    putCall: pcr.v,
    aaii: aaii.a,
    fearGreed: null,
    stale,
    sources,
    updated
  };

  return Response.json(body, { status: 200 });
}
