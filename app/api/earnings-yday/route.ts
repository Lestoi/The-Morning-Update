// app/api/earnings-yday/route.ts
export const runtime = "edge";           // fast & cheap
export const dynamic = "force-dynamic";  // don't cache between deploys

type AvCalendarItem = {
  symbol?: string;
  name?: string;
  reportDate?: string;       // AV field
  report_date?: string;      // sometimes they use snake_case
  fiscalDateEnding?: string;
  epsEstimated?: string | number | null;
  epsReported?: string | number | null;
  surprisePercentage?: string | number | null;
  timezone?: string;
  updatedFromDate?: string;
  currency?: string;
  marketCap?: string | number | null;
};

type OutItem = {
  time: string | null;       // BMO/AMC/TBD if we can infer, else null
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

function isYday(dateStr?: string | null) {
  if (!dateStr) return false;
  // Treat everything in UTC to avoid client TZ drift:
  const today = new Date();
  const utc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yday = new Date(utc);
  yday.setUTCDate(yday.getUTCDate() - 1);

  const d = new Date(dateStr);
  const dd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return dd.getTime() === yday.getTime();
}

function tagSessionHint(name?: string): "BMO" | "AMC" | "TBD" | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("pre") || n.includes("before open") || n.includes("bmo")) return "BMO";
  if (n.includes("after") || n.includes("post") || n.includes("amc")) return "AMC";
  return "TBD";
}

export async function GET(req: Request) {
  try {
    const key = process.env.ALPHA_VANTAGE_KEY;
    if (!key) {
      // Never 500 for missing key; return a JSON error so the UI can show a stale state
      return new Response(
        JSON.stringify({ items: [], stale: true, source: "Alpha Vantage", error: "Missing ALPHA_VANTAGE_KEY" }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // AV free plan: earnings calendar is here
    const url = new URL("https://www.alphavantage.co/query");
    url.searchParams.set("function", "EARNINGS_CALENDAR");
    // horizon can be between 3month and 12month; we only filter yesterday anyway
    url.searchParams.set("horizon", "3month");
    url.searchParams.set("apikey", key);

    const r = await fetch(url.toString(), { cache: "no-store", next: { revalidate: 0 } });

    // If AV returns 200 with a rate-limit message, still parse safely:
    const text = await r.text();
    let json: any = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      return new Response(
        JSON.stringify({ items: [], stale: true, source: "Alpha Vantage", error: `Bad JSON from AV (${r.status})` }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    // Guard for AV special keys (Note, Information, Error Message)
    const avError =
      json?.Note ||
      json?.Information ||
      json?.["Error Message"] ||
      (r.status !== 200 ? `HTTP ${r.status}` : null);

    // Data array can be under different keys; normalize:
    const raw: AvCalendarItem[] =
      Array.isArray(json?.earningsCalendar) ? json.earningsCalendar :
      Array.isArray(json?.EarningsCalendar) ? json.EarningsCalendar :
      Array.isArray(json) ? json :
      [];

    // Filter to yesterday and US-heavy names only (you can refine)
    const ydayItems = raw.filter((row) =>
      isYday(row.reportDate ?? (row as any).report_date)
    );

    const mapped: OutItem[] = ydayItems.map((row) => {
      const reported = row.reportDate ?? (row as any).report_date ?? null;
      const epsAct = toNum(row.epsReported);
      const epsEst = toNum(row.epsEstimated);
      const surprise =
        epsAct !== null && epsEst !== null && epsEst !== 0
          ? Number(((epsAct - epsEst) / Math.abs(epsEst) * 100).toFixed(1))
          : toNum(row.surprisePercentage);

      return {
        time: tagSessionHint(row.name),
        symbol: row.symbol ?? null,
        companyName: row.name ?? null,
        epsActual: epsAct,
        epsEstimate: epsEst,
        surprisePct: surprise ?? null,
      };
    });

    // If AV errored or returned empty, keep stale=true so UI can show “cached/fallback”
    const resp = {
      items: mapped,
      stale: !!avError || mapped.length === 0,
      source: "Alpha Vantage",
      ...(avError ? { error: String(avError) } : {}),
    };

    return new Response(JSON.stringify(resp), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    // Final safety net — never crash the route
    return new Response(
      JSON.stringify({
        items: [],
        stale: true,
        source: "Alpha Vantage",
        error: err?.message ?? "Unhandled server error",
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }
}
