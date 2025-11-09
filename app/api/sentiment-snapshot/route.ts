// app/api/sentiment-snapshot/route.ts
// Runtime: Edge (fast, cold-start friendly)
export const runtime = "edge";

type AAII = { bull: number | null; bear: number | null };

type Snap = {
  vix: number | null;
  putCall: number | null;
  aaii: AAII | null;
  fearGreed: number | null; // placeholder for future
  stale: boolean;
  sources: string[];
  updated: string;
};

// -------------------- tiny in-memory cache --------------------
type CacheEntry<T> = { data: T; exp: number; stale: boolean };
const CACHE = new Map<string, CacheEntry<Snap>>();
const TTL_MS = 90_000; // 90s soft cache to ride out transient feed hiccups

function getCache(k: string): Snap | null {
  const hit = CACHE.get(k);
  if (!hit) return null;
  const now = Date.now();
  if (hit.exp > now) return { ...hit.data, stale: hit.stale }; // fresh
  // soft-stale: serve once while we refetch on next request
  return { ...hit.data, stale: true };
}
function putCache(k: string, v: Snap, fresh = true) {
  CACHE.set(k, { data: v, exp: Date.now() + TTL_MS, stale: !fresh });
}

// -------------------- utils --------------------
function toNumber(s: unknown): number | null {
  if (s == null) return null;
  const n = Number(String(s).trim().replace(/[^0-9.+-eE]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// very small CSV splitter that copes with commas/quotes/newlines
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        row.push(cell);
        cell = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = "";
      } else cell += c;
    }
  }
  // last cell
  row.push(cell);
  rows.push(row);
  // strip trailing blank row(s)
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  return rows;
}

async function fetchText(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; text?: string }> {
  try {
    const r = await fetch(url, {
      // edge-friendly, no caching between requests; we do our own tiny cache above
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MorningUpdate/1.0)" },
      ...init,
    });
    if (!r.ok) return { ok: false };
    return { ok: true, text: await r.text() };
  } catch {
    return { ok: false };
  }
}

// -------------------- data sources --------------------

// 1) VIX — Yahoo Finance CSV mirror (stable)
async function getVIX(): Promise<{ val: number | null; src: string }> {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/download/^VIX?period1=0&period2=9999999999&interval=1d&events=history";
  const r = await fetchText(url);
  if (!r.ok || !r.text) return { val: null, src: "Yahoo Finance CSV (VIX) — failed" };

  const rows = parseCSV(r.text);
  if (rows.length < 2) return { val: null, src: "Yahoo Finance CSV (VIX) — empty" };
  // last non-header row
  const body = rows.slice(1).filter((r) => r.length >= 5);
  if (!body.length) return { val: null, src: "Yahoo Finance CSV (VIX) — no body" };
  const last = body[body.length - 1];
  const close = toNumber(last[4]); // Close column
  return { val: close, src: "Yahoo Finance CSV (VIX daily)" };
}

// 2) TOTAL put/call — CBOE CDN daily CSV (stable mirror)
async function getPutCall(): Promise<{ val: number | null; src: string }> {
  const url = "https://cdn.cboe.com/api/global/us_indices/daily_statistics/pc.csv";
  const r = await fetchText(url);
  if (!r.ok || !r.text) return { val: null, src: "CBOE daily pc.csv — failed" };

  const rows = parseCSV(r.text);
  const lc = (s: string) => s.toLowerCase();

  // Look for a row containing "total put/call ratio" and take its last numeric cell
  for (const row of rows) {
    if (row.some((c) => lc(c).includes("total put/call ratio"))) {
      for (let i = row.length - 1; i >= 0; i--) {
        const n = toNumber(row[i]);
        if (n !== null) return { val: n, src: "CBOE total put/call CSV" };
      }
    }
  }
  return { val: null, src: "CBOE total put/call CSV — not found" };
}

// 3) AAII — from a public CSV (env override or your /public/aaii.csv)
function resolveAAIISource(req: Request): string {
  const fromEnv = process.env.AAII_CSV_URL?.trim();
  if (fromEnv) return fromEnv;

  // Build absolute URL to /aaii.csv in /public when no env provided
  const u = new URL(req.url);
  u.pathname = "/aaii.csv";
  u.search = "";
  u.hash = "";
  return u.toString();
}
async function getAAII(req: Request): Promise<{ val: AAII | null; src: string }> {
  const url = resolveAAIISource(req);
  const r = await fetchText(url);
  if (!r.ok || !r.text) return { val: null, src: "AAII (public CSV) — fetch failed" };

  const rows = parseCSV(r.text);
  if (rows.length < 2) return { val: null, src: "AAII (public CSV) — empty" };

  // Find headers, then last row with values
  const hdr = rows[0].map((h) => h.trim().toLowerCase());
  const bullIdx =
    hdr.findIndex((h) => h === "bull" || h === "bullish") ?? -1;
  const bearIdx =
    hdr.findIndex((h) => h === "bear" || h === "bearish") ?? -1;

  if (bullIdx < 0 || bearIdx < 0)
    return { val: null, src: "AAII (public CSV) — missing bull/bear headers" };

  const body = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (!body.length) return { val: null, src: "AAII (public CSV) — no rows" };

  const last = body[body.length - 1];
  const bull = toNumber(last[bullIdx]);
  const bear = toNumber(last[bearIdx]);

  return { val: { bull, bear }, src: "AAII (public CSV)" };
}

// -------------------- handler --------------------
export async function GET(req: Request): Promise<Response> {
  const cacheKey = "sentiment-snapshot";
  const cached = getCache(cacheKey);
  if (cached) {
    return Response.json(cached, { headers: { "Cache-Control": "no-store" } });
  }

  const [vix, pcr, aaii] = await Promise.all([getVIX(), getPutCall(), getAAII(req)]);

  const snap: Snap = {
    vix: vix.val,
    putCall: pcr.val,
    aaii: aaii.val,
    fearGreed: null,
    stale: false,
    sources: [vix.src, pcr.src, aaii.src],
    updated: new Date().toISOString(),
  };

  // if any feed failed, mark stale=false (fresh fetch) but cache still helps avoid flakiness
  putCache(cacheKey, snap, /*fresh*/ true);

  return Response.json(snap, { headers: { "Cache-Control": "no-store" } });
}
