export const dynamic = "force-dynamic";

/**
 * Yesterday's notable US earnings (FMP)
 *
 * - Pulls yesterday's earnings (EPS actual vs estimate)
 * - Batch-fetches company profiles to rank by market cap
 * - Returns top N by market cap with beat/miss flags
 *
 * Env:
 *   FMP_API_KEY (optional; falls back to "demo" which works with limited quota)
 *
 * Output shape:
 * {
 *   items: Array<{
 *     symbol: string;
 *     name: string;
 *     time: "BMO" | "AMC" | "TBD";
 *     epsActual: number | null;
 *     epsEstimate: number | null;
 *     epsSurprise: number | null;        // actual - estimate
 *     surprisePct: number | null;        // (actual - estimate) / |estimate| * 100
 *     beat: boolean | null;
 *     marketCap: number | null;
 *   }>;
 *   stale: boolean;
 *   source: "FMP";
 * }
 */

type When = "BMO" | "AMC" | "TBD";

type YItem = {
  date: string;          // YYYY-MM-DD
  symbol: string;
  eps: number | null;
  epsEstimated: number | null;
  time: When | string | null;
};

type Profile = {
  symbol: string;
  companyName?: string;
  mktCap?: number;
};

type OutItem = {
  symbol: string;
  name: string;
  time: When;
  epsActual: number | null;
  epsEstimate: number | null;
  epsSurprise: number | null;
  surprisePct: number | null;
  beat: boolean | null;
  marketCap: number | null;
};

function ymd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function yesterdayUTC(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return ymd(d);
}

function asNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normTime(t: unknown): When {
  const s = String(t ?? "").toUpperCase();
  if (s.includes("BMO")) return "BMO";
  if (s.includes("AMC")) return "AMC";
  return "TBD";
}

function pctDelta(actual: number | null, est: number | null): number | null {
  if (actual === null || est === null || !Number.isFinite(est) || Math.abs(est) < 1e-12) return null;
  return ((actual - est) / Math.abs(est)) * 100;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY || "demo";
  const y = yesterdayUTC();

  // 1) Get yesterday's earnings
  // Docs: https://financialmodelingprep.com/developer/docs#earning-calendar
  const calURL = `https://financialmodelingprep.com/api/v3/earning_calendar?from=${y}&to=${y}&apikey=${apiKey}`;

  try {
    const r = await fetch(calURL, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`FMP calendar HTTP ${r.status}`);
    const raw: any[] = await r.json();

    // Normalize and keep US symbols (FMP’s calendar is predominantly US already)
    const cal: YItem[] = (Array.isArray(raw) ? raw : [])
      .filter((x) => x?.symbol && x?.date)
      .map((x) => ({
        date: String(x.date),
        symbol: String(x.symbol).toUpperCase(),
        eps: asNum(x.eps),
        epsEstimated: asNum(x.epsEstimated),
        time: normTime(x.time),
      }));

    if (cal.length === 0) {
      return Response.json({ items: [], stale: false, source: "FMP" });
    }

    // 2) Batch-fetch profiles to get market caps + names
    // Endpoint supports comma-separated symbols: /profile/{AAPL,MSFT,AMZN}
    const symbols = Array.from(new Set(cal.map((c) => c.symbol)));
    const batched = chunk(symbols, 50); // be gentle; FMP handles large batches but keep it safe

    const profiles: Record<string, Profile> = {};
    for (const group of batched) {
      const pURL = `https://financialmodelingprep.com/api/v3/profile/${group.join(",")}?apikey=${apiKey}`;
      const pr = await fetch(pURL, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      if (!pr.ok) continue;
      const pj: any[] = await pr.json();
      if (Array.isArray(pj)) {
        for (const row of pj) {
          const sym = String(row?.symbol ?? "").toUpperCase();
          if (!sym) continue;
          profiles[sym] = {
            symbol: sym,
            companyName: row?.companyName ?? row?.companyName ?? sym,
            mktCap: asNum(row?.mktCap),
          };
        }
      }
    }

    // 3) Merge + compute surprise stats
    const merged: OutItem[] = cal.map((x) => {
      const p = profiles[x.symbol];
      const epsActual = x.eps;
      const epsEstimate = x.epsEstimated;
      const surprise = epsActual !== null && epsEstimate !== null ? epsActual - epsEstimate : null;
      const surprisePct = pctDelta(epsActual, epsEstimate);
      const beat = surprise !== null ? surprise >= 0 : null;

      return {
        symbol: x.symbol,
        name: p?.companyName ?? x.symbol,
        time: normTime(x.time),
        epsActual,
        epsEstimate,
        epsSurprise: surprise,
        surprisePct,
        beat,
        marketCap: p?.mktCap ?? null,
      };
    });

    // 4) Rank by market cap (desc) and keep a concise list
    const TOP_N = 10;
    const ranked = merged
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, TOP_N);

    return Response.json({
      items: ranked,
      stale: false,
      source: "FMP",
    });
  } catch (err) {
    return Response.json({
      items: [],
      stale: true,
      source: "FMP",
      error: (err as Error)?.message ?? "Unknown error",
    });
  }
}
