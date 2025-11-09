export const runtime = "edge";
export const dynamic = "force-dynamic";

type AAII = {
  date?: string | null;
  bull?: number | null;
  bear?: number | null;
  neutral?: number | null;
};

type Snapshot = {
  vix: number | null;
  putCall: number | null;
  aaii: AAII | null;
  fearGreed: number | null;
  stale: boolean;
  sources: string[];
  updated: string;
  error?: string;
};

function parseCSV(text: string): string[][] {
  // Tiny CSV parser (no quotes in our inputs). Fast + Edge-safe.
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((s) => s.trim()));
}

async function getVIX(): Promise<{ value: number | null; source: string }> {
  try {
    // Stooq ^VIX daily CSV
    const url = "https://stooq.com/q/d/l/?s=^vix&i=d";
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status}`);
    const csv = await r.text();
    const rows = parseCSV(csv);
    if (rows.length < 2) return { value: null, source: "Stooq (^VIX daily CSV)" };
    const last = rows[rows.length - 1];
    const close = Number(last[4]); // date,open,high,low,close,volume
    return {
      value: Number.isFinite(close) ? close : null,
      source: "Stooq (^VIX daily CSV)",
    };
  } catch {
    return { value: null, source: "Stooq (^VIX daily CSV)" };
  }
}

async function getPutCall(): Promise<{ value: number | null; source: string }> {
  try {
    // CBOE total put/call CSV
    const url =
      "https://cdn.cboe.com/api/global/delayed_quotes/options_ratios.csv";
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status}`);
    const csv = await r.text();
    const rows = parseCSV(csv);
    // Expect headers, then last row: Total, Equity, Index, etc… many feeds place value in first row/col
    // We’ll scan for the first numeric cell in the last row.
    const dataRow = rows[rows.length - 1] ?? [];
    let val: number | null = null;
    for (const cell of dataRow) {
      const n = Number(cell);
      if (Number.isFinite(n)) {
        val = n;
        break;
      }
    }
    return { value: val, source: "CBOE total put/call CSV" };
  } catch {
    return { value: null, source: "CBOE total put/call CSV" };
  }
}

function toAbsUrl(pathOrAbs: string, reqUrl: string): string {
  try {
    // If it’s already absolute, URL() will accept it without base.
    return new URL(pathOrAbs).toString();
  } catch {
    // Make absolute from request origin
    return new URL(pathOrAbs, reqUrl).toString();
  }
}

async function getAAII(reqUrl: string): Promise<{ data: AAII | null; source: string; error?: string }> {
  // Prefer env override; else fallback to /aaii.csv (must be absolute at runtime)
  const envUrl = process.env.AAII_CSV_URL;
  const csvUrl = toAbsUrl(envUrl && envUrl.trim() ? envUrl : "/aaii.csv", reqUrl);

  try {
    const r = await fetch(csvUrl, { cache: "no-store" });
    if (!r.ok) {
      return {
        data: null,
        source: csvUrl.includes("/aaii.csv") ? "/aaii.csv" : "AAII_CSV_URL",
        error: `HTTP ${r.status}`,
      };
    }
    const csv = await r.text();
    const rows = parseCSV(csv);
    if (rows.length < 2) {
      return {
        data: null,
        source: csvUrl.includes("/aaii.csv") ? "/aaii.csv" : "AAII_CSV_URL",
        error: "No rows",
      };
    }

    const header = rows[0].map((h) => h.toLowerCase());
    const findIdx = (name: string) =>
      header.findIndex((h) => h.includes(name));
    const iDate = findIdx("date");
    const iBull = findIdx("bull");
    const iBear = findIdx("bear");
    const iNeutral = findIdx("neutral");

    const last = rows[rows.length - 1] ?? [];
    const out: AAII = {
      date: iDate >= 0 ? last[iDate] ?? null : null,
      bull:
        iBull >= 0 && Number.isFinite(Number(last[iBull]))
          ? Number(last[iBull])
          : null,
      bear:
        iBear >= 0 && Number.isFinite(Number(last[iBear]))
          ? Number(last[iBear])
          : null,
      neutral:
        iNeutral >= 0 && Number.isFinite(Number(last[iNeutral]))
          ? Number(last[iNeutral])
          : null,
    };

    // sanity: if both bull & bear absent, treat as null
    if (out.bull == null && out.bear == null) {
      return {
        data: null,
        source: csvUrl.includes("/aaii.csv") ? "/aaii.csv" : "AAII_CSV_URL",
        error: "Missing bull/bear",
      };
    }

    return {
      data: out,
      source: csvUrl.includes("/aaii.csv") ? "/aaii.csv" : "AAII_CSV_URL",
    };
  } catch (err: any) {
    return {
      data: null,
      source: csvUrl.includes("/aaii.csv") ? "/aaii.csv" : "AAII_CSV_URL",
      error: (err && err.message) || "fetch failed",
    };
  }
}

export async function GET(req: Request) {
  const { url } = req;

  const [vix, pcr, aaii] = await Promise.all([
    getVIX(),
    getPutCall(),
    getAAII(url),
  ]);

  const payload: Snapshot = {
    vix: vix.value,
    putCall: pcr.value,
    aaii: aaii.data,
    fearGreed: null, // (optional slot for later)
    stale: false,
    sources: [
      vix.source,
      pcr.source,
      aaii.source + (aaii.error ? ` (error: ${aaii.error})` : ""),
    ],
    updated: new Date().toISOString(),
    error: undefined,
  };

  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status: 200,
  });
}
