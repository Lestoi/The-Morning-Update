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

function isYdayISO(dateStr?: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (Number.isNaN(d.valueOf())) return false;

  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yday = new Date(utcToday);
  yday.setUTCDate(yday.getUTCDate() - 1);

  const dUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dUTC.getTime() === yday.getTime();
}

function tagSessionHint(name?: string | null): "BMO" | "AMC" | "TBD" | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("pre") || n.includes("before open") || n.includes("bmo")) return "BMO";
  if (n.includes("after") || n.includes("post") || n.includes("amc")) return "AMC";
  return "TBD";
}

/** tiny CSV parser (quoted fields supported; no multi-line fields) */
function parseCsv(text: string): CsvRow[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines: string[] = normalized.split("\n");
  if (lines.length === 0) return [];

  const headers: string[] = lines[0].split(",").map(h => h.trim());
  const out: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row: string[] = [];
    let cur = "";
    let inQ = false;
    const s: string = lines[i];

    for (let j = 0; j < s.length; j++) {
      const ch = s[j];
      if (ch === '"') {
        // if we see a doubled quote while inside a quoted field, treat as literal quote
        if (inQ && s[j + 1] === '"') {
          cur += '"';
          j++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        row.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur);

    const obj: CsvRow = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? "").trim();
    });
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

    // Ask AV for CSV; we still gracefully handle JSON/plain-text if they send it.
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "EARNINGS_CALENDAR");
    url.searchParams.set("horizon", "3month");
    url.searchParams.set("datatype", "csv");
    url.searchParams.set("apikey", key);

    const res = await fetch(url.toString(), { cache: "no-store", next: { revalidate: 0 } });
    const text = await res.text();

    // Some AV responses are plain-text "Thank you for using Alpha Vantage" or rate-limit notes.
    const looksLikePlainError =
      /thank you for using alpha vantage/i.test(text) ||
      /standard api call frequency/i.test(text) ||
      /invalid api call/i.test(text) ||
      /error/i.test(text);

    let rows: CsvRow[] = [];

    if (!looksLikePlainError) {
      // try CSV first (we requested it)
      try {
        rows = parseCsv(text);
      } catch {
        rows = [];
      }

      // if CSV parse yields nothing, try JSON as a fallback
      if (rows.length === 0) {
        try {
          const j: unknown = JSON.parse(text);
          const anyJ = j as any;
          if (Array.isArray(anyJ?.earningsCalendar)) rows = anyJ.earningsCalendar as CsvRow[];
          else if (Array.isArray(anyJ?.EarningsCalendar)) rows = anyJ.EarningsCalendar as CsvRow[];
          else if (Array.isArray(anyJ)) rows = anyJ as CsvRow[];
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

    const errorMsg =
      looksLikePlainError
        ? "Alpha Vantage note/limit or non-CSV response"
        : (rows.length === 0 ? "No rows parsed (CSV/JSON empty or horizon too short)" : undefined);

    return new Response(
      JSON.stringify({
        items: mapped,
        stale: !!errorMsg || mapped.length === 0,
        source: "Alpha Vantage",
        ...(errorMsg ? { error: errorMsg } : {})
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unhandled error";
    return new Response(
      JSON.stringify({ items: [], stale: true, source: "Alpha Vantage", error: msg }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
}
