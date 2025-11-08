export const dynamic = "force-dynamic";

/**
 * Total market Put/Call Ratio (daily, most recent).
 * Tries a few known Cboe CSV endpoints; returns { pcr:number|null, asOf?:string }.
 * If all sources fail, returns pcr=null (UI will show "—").
 */
async function fetchFromCandidates(): Promise<{ pcr: number | null; asOf?: string }> {
  const candidates = [
    // Common Cboe CSV endpoints seen historically; format: date,value
    "https://cdn.cboe.com/data/put_call_ratio/daily_total_pcr.csv",
    "https://cdn.cboe.com/api/global/us_indices/daily_prices/total_pcr.csv",
    "https://cdn.cboe.com/data/put_call_ratio/total_pc.csv",
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) continue;
      const text = await res.text();
      // Find the last non-empty line containing a numeric value
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      // Skip header if present; search from bottom up
      for (let i = lines.length - 1; i >= 0; i--) {
        const row = lines[i].split(/,|;|\t/).map(s => s.trim());
        if (row.length < 2) continue;
        const maybeDate = row[0];
        const maybeVal = row[row.length - 1];
        const num = Number(String(maybeVal).replace(/[^\d.\-]/g, ""));
        if (isFinite(num) && num > 0 && num < 10) {
          return { pcr: Number(num.toFixed(2)), asOf: maybeDate };
        }
      }
    } catch {
      // try next candidate
    }
  }
  return { pcr: null };
}

export async function GET() {
  const data = await fetchFromCandidates();
  return Response.json({ ...data, stale: data.pcr == null });
}
