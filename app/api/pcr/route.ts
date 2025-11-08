export const dynamic = "force-dynamic";

/**
 * Total market Put/Call Ratio (daily).
 * Strategy:
 *  1) Try multiple Cboe CSV endpoints (preferred).
 *  2) Fallback: scrape lightweight HTML pages that often display the latest total PCR.
 * Returns { pcr, asOf, source, stale } and NEVER throws.
 */

type PcrResult = { pcr: number | null; asOf?: string | null; source?: string; stale?: boolean };

function parseLastNumericLine(text: string): { value: number | null; date?: string | null } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const cols = lines[i].split(/,|;|\t/).map(s => s.trim());
    if (cols.length < 2) continue;
    const raw = cols[cols.length - 1];
    const num = Number(String(raw).replace(/[^\d.\-]/g, ""));
    if (isFinite(num) && num > 0 && num < 10) {
      const maybeDate = cols[0] || null;
      return { value: Number(num.toFixed(2)), date: maybeDate };
    }
  }
  return { value: null, date: null };
}

async function tryCsv(url: string): Promise<PcrResult> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("bad status");
  const text = await r.text();
  const { value, date } = parseLastNumericLine(text);
  if (value == null) throw new Error("no value");
  return { pcr: value, asOf: date ?? null, source: url, stale: false };
}

/** Very liberal HTML fallback: scan page for plausible floats like 0.83, 1.04, etc. */
async function tryHtml(url: string): Promise<PcrResult> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("bad status");
  const html = await r.text();

  // Heuristic: look near "Put/Call" phrases if present; otherwise scan whole page.
  const target =
    html.match(/put[^<]{0,40}call[^<]{0,40}ratio[\s\S]{0,200}/i)?.[0] ?? html;

  const matches = target.match(/(\d+\.\d{2})/g) || [];
  const num = matches.map(s => Number(s)).find(n => isFinite(n) && n > 0 && n < 5);
  if (!num) throw new Error("no plausible number");
  return { pcr: Number(num.toFixed(2)), asOf: null, source: url, stale: false };
}

export async function GET() {
  const csvCandidates = [
    "https://cdn.cboe.com/data/put_call_ratio/daily_total_pcr.csv",
    "https://cdn.cboe.com/api/global/us_indices/daily_prices/total_pcr.csv",
    "https://cdn.cboe.com/data/put_call_ratio/total_pc.csv",
  ];
  const htmlCandidates = [
    // Cboe stats page (often contains the "Total Put/Call Ratio")
    "https://www.cboe.com/us/options/market_statistics/daily/put_call_ratio/",
    // MarketWatch market data page (occasionally lists total PCR)
    "https://www.marketwatch.com/market-data",
  ];

  for (const u of csvCandidates) {
    try {
      const out = await tryCsv(u);
      return Response.json(out);
    } catch {}
  }
  for (const u of htmlCandidates) {
    try {
      const out = await tryHtml(u);
      return Response.json(out);
    } catch {}
  }

  const miss: PcrResult = { pcr: null, asOf: null, stale: true };
  return Response.json(miss);
}
