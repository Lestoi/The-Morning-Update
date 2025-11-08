export const dynamic = "force-dynamic";

/**
 * Total market Put/Call Ratio (daily).
 * We try several public CSV/HTML endpoints (Cboe & mirrors). We parse the most
 * recent numeric and return { pcr, asOf }. If everything fails we return nulls.
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
      const maybeDate = cols[0];
      return { value: Number(num.toFixed(2)), date: maybeDate || null };
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

/** Very liberal HTML fallback: scan page for a float like 0.83, 1.04 etc. */
async function tryHtml(url: string): Promise<PcrResult> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("bad status");
  const html = await r.text();
  const m = html.match(/(\d+\.\d{2})/g);
  if (!m) throw new Error("no numbers");
  // pick a plausible ratio between 0 and 5
  const num = m.map(x => Number(x)).find(n => isFinite(n) && n > 0 && n < 5);
  if (!num) throw new Error("no plausible");
  return { pcr: Number(num.toFixed(2)), asOf: null, source: url, stale: false };
}

export async function GET() {
  const candidatesCsv = [
    "https://cdn.cboe.com/data/put_call_ratio/daily_total_pcr.csv",
    "https://cdn.cboe.com/api/global/us_indices/daily_prices/total_pcr.csv",
    "https://cdn.cboe.com/data/put_call_ratio/total_pc.csv",
  ];

  const candidatesHtml = [
    // lightweight pages that sometimes show the latest total PCR
    "https://www.cboe.com/us/options/market_statistics/daily/put_call_ratio/",
  ];

  for (const u of candidatesCsv) {
    try {
      const out = await tryCsv(u);
      return Response.json(out);
    } catch {}
  }

  for (const u of candidatesHtml) {
    try {
      const out = await tryHtml(u);
      return Response.json(out);
    } catch {}
  }

  const miss: PcrResult = { pcr: null, asOf: null, stale: true };
  return Response.json(miss);
}
