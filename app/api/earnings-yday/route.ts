// app/api/earnings-yday/route.ts
export const runtime = "edge";
export const dynamic = "force-dynamic";

type CsvRow = Record<string, string>;

type OutItem = {
  time: "BMO" | "AMC" | "TBD" | null;
  symbol: string | null;
  companyName: string | null;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
};

function toNum(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function isYdayISO(dateStr?: string | null) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.valueOf())) return false;
  // Compare calendar day in UTC
  const today = new Date();
  const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yday = new Date(utc);
  yday.setUTCDate(yday.getUTCDate() - 1);

  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dd.getTime() === yday.getTime();
}

function tagSessionHint(name?: string | null): "BMO" | "AMC" | "TBD" | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("pre") || n.includes("before open") || n.includes("bmo")) return "BMO";
  if (n.includes("after") || n.includes("post") || n.includes("amc")) return "AMC";
  return "TBD";
}

/** extremely small CSV parser (no nested quotes), good enough for AV CSV */
function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  const out: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = [];
    let cur = "";
    let inQ = false;
    const s = lines[i];
    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (ch === '"') {
        // toggle quote unless escaped
        if (inQ && s[j + 1] === '"') { cur += '"'; j++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        row.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    const obj: CsvRow = {};
    headers.forEach((h, idx) => { obj[h] = (row[idx] ?? "").trim(); });
    out.push(obj);
  }
  return out;
}

export async function GET() {
  try {
    const key = process.env.ALPHA_VANTAGE_KEY;
    if (!key) {
      return new Response(
        JSON.stringify({ items: [], stale: true, source: "Alpha Vantage", error: "Missing ALPHA_VANTAGE_KEY" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // Force CSV so we always know what we’re parsing.
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "EARNINGS_CALENDAR");
    url.searchParams.set("horizon", "3month");
    url.searchParams.set("datatype", "csv"); // <- key line
    url.searchParams.set("apikey", key);

    const res = await fetch(url.toString(), { cache: "no-store", next: { revalidate: 0 } });
    const text = await res.text();
    const ct = res.headers.get("content-type") || "";

    // Rate limit / error notes can be text or HTML. Detect those first.
    const plainErr =
      /thank you for using alpha vantage/i.test(text) ||
      /standard api call frequency/i.test(text) ||
      /invalid api call/i.test(text) ||
      /error/i.test(text);

    // Try CSV first (we requested csv)
    let rows: CsvRow[] = [];
    if (!plainErr) {
      try {
        rows = parseCsv(text);
      } catch {
        // If CSV parsing somehow fails, try JSON as fallback
        try {
          const j = JSON.parse(text);
          // normalize to array if JSON
          rows = Array.isArray(j?.earningsCalendar) ? j.earningsCalendar :
                 Array.isArray(j?.EarningsCalendar) ? j.EarningsCalendar :
                 Array.isArray(j) ? j : [];
        } catch {
          // neither CSV nor JSON
        }
      }
    }

    const mapped: OutItem[] = rows
      .filter(r => isYdayISO(r.reportDate ?? (r as any).report_date))
      .map(r => {
        const epsAct = toNum(r.epsReported ?? (r as any).eps_reported);
        const epsEst = toNum(r.epsEstimated ?? (r as any).eps_estimated);
        let surprise = toNum((r as any).surprisePercentage ?? (r as any).surprise_percentage);
        if (surprise === null && epsAct !== null && epsEst !== null && epsEst !== 0) {
          surprise = Number(((epsAct - epsEst) / Math.abs(epsEst) * 100).toFixed(1));
        }

        return {
          time: tagSessionHint(r.name),
          symbol: (r.symbol ?? "").trim() || null,
          companyName: (r.name ?? "").trim() || null,
          epsActual: epsAct,
          epsEstimate: epsEst,
          surprisePct: surprise,
        };
      });

    // Build response
    const errorMsg = plainErr
      ? "Alpha Vantage note/limit or non-CSV response"
      : (rows.length === 0 ? "No rows parsed (CSV/JSON empty or horizon too short)" : undefined);

    return new Response(
      JSON.stringify({
        items: mapped,
        stale: !!errorMsg || mapped.length === 0,
        source: "Alpha Vantage",
        ...(errorMsg ? { error: errorMsg } : {}),
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ items: [], stale: true, source: "Alpha Vantage", error: err?.message ?? "Unhandled error" }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
}
