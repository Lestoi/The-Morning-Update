// app/page.tsx
import React from "react";
import { headers } from "next/headers";

type MacroRow = {
  time: string;
  country: string;
  release: string;
  actual: string | null;
  previous: string | null;
  consensus: string | null;
  forecast: string | null;
  tier: "T1" | "T2" | "T3";
};
type MacroResp = { items?: MacroRow[]; stale?: boolean; source?: string; error?: string };

type SentimentResp = {
  vix?: number | null;
  putCall?: number | null;
  aaii?: { bulls?: number | null; bears?: number | null } | null;
  fearGreed?: number | null;
  stale?: boolean;
  sources?: string[];
  updated?: string;
  error?: string;
};

type EarningsRow = {
  time?: string;
  symbol?: string;
  companyName?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  surprisePct?: number | null;
  result?: "beat" | "miss" | "inline" | null;
  mktCap?: number | null;
};
type EarningsResp = { items?: EarningsRow[]; stale?: boolean; source?: string; error?: string };

// Build an absolute URL from a relative path using the current request headers
function abs(path: string): string {
  const h = headers();
  const host =
    h.get("x-forwarded-host") ||
    h.get("host") ||
    process.env.VERCEL_URL ||
    "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

async function getJSON<T>(path: string, fallback: T): Promise<T> {
  const url = path.startsWith("http") ? path : abs(path);
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ...(fallback as any), error: `HTTP ${res.status} from ${path}` } as T;
    }
    const data = (await res.json()) as T;
    if (data && typeof data === "object") return data;
    return fallback;
  } catch (e: any) {
    return { ...(fallback as any), error: e?.message ?? `Failed to parse URL from ${path}` } as T;
  }
}

function cell(x: unknown): React.ReactNode {
  if (x === null || x === undefined) return "—";
  if (typeof x === "number") return Number.isFinite(x) ? x : "—";
  const s = String(x).trim();
  return s.length ? s : "—";
}

export default async function Page() {
  const [macro, senti, earnings] = await Promise.all([
    getJSON<MacroResp>("/api/macro", { items: [], stale: true, source: "macro" }),
    getJSON<SentimentResp>("/api/sentiment-snapshot", {
      vix: null,
      putCall: null,
      aaii: { bulls: null, bears: null },
      fearGreed: null,
      stale: true,
      sources: [],
    }),
    getJSON<EarningsResp>("/api/earnings-yday", { items: [], stale: true, source: "earnings" }),
  ]);

  const macroItems = Array.isArray(macro.items) ? macro.items : [];
  const earningsItems = Array.isArray(earnings.items) ? earnings.items : [];

  return (
    <main className="min-h-screen bg-black text-neutral-200 px-6 py-8">
      <h1 className="text-2xl font-semibold mb-2">Morning Update</h1>
      <p className="text-xs text-neutral-400 mb-6">All times UK</p>

      {/* ====== Major US data today ====== */}
      <section className="mb-8">
        <div className="rounded-xl bg-neutral-900/60 ring-1 ring-neutral-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <div className="font-medium">Major US data today</div>
            <div className="text-xs text-neutral-400 space-x-2">
              <span className="inline-block rounded bg-red-900/40 px-2 py-0.5">Tier 1</span>
              <span className="inline-block rounded bg-amber-900/40 px-2 py-0.5">Tier 2</span>
              <span className="inline-block rounded bg-sky-900/40 px-2 py-0.5">Tier 3</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/80">
                <tr className="text-neutral-400">
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Country</th>
                  <th className="text-left px-4 py-2">Release</th>
                  <th className="text-left px-4 py-2">Actual</th>
                  <th className="text-left px-4 py-2">Previous</th>
                  <th className="text-left px-4 py-2">Consensus</th>
                  <th className="text-left px-4 py-2">Forecast</th>
                  <th className="text-left px-4 py-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {macroItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-neutral-400" colSpan={8}>
                      No items for today (or the source returned none).{" "}
                      {macro?.error ? (
                        <span className="text-red-400">— {macro.error}</span>
                      ) : (
                        <span className="text-neutral-500">
                          {macro?.stale ? "Using cached/fallback data." : ""}
                        </span>
                      )}
                    </td>
                  </tr>
                ) : (
                  macroItems.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="px-4 py-2">{cell(r.time)}</td>
                      <td className="px-4 py-2">{cell(r.country)}</td>
                      <td className="px-4 py-2">{cell(r.release)}</td>
                      <td className="px-4 py-2">{cell(r.actual)}</td>
                      <td className="px-4 py-2">{cell(r.previous)}</td>
                      <td className="px-4 py-2">{cell(r.consensus)}</td>
                      <td className="px-4 py-2">{cell(r.forecast)}</td>
                      <td className="px-4 py-2">{cell(r.tier)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {(macro?.error || macro?.stale) && (
            <div className="px-4 py-2 text-xs text-neutral-400 border-t border-neutral-800">
              Source: {macro?.source ?? "—"}{" "}
              {macro?.error ? <span className="text-red-400">— {macro.error}</span> : null}
            </div>
          )}
        </div>
      </section>

      {/* ====== Sentiment ====== */}
      <section className="mb-8">
        <div className="rounded-xl bg-neutral-900/60 ring-1 ring-neutral-800">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Sentiment</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            <div className="rounded-lg bg-neutral-950 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-400 mb-1">VIX</div>
              <div className="text-xl">{cell(senti?.vix)}</div>
            </div>
            <div className="rounded-lg bg-neutral-950 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-400 mb-1">Put/Call (total)</div>
              <div className="text-xl">{cell(senti?.putCall)}</div>
            </div>
            <div className="rounded-lg bg-neutral-950 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-400 mb-1">AAII Bulls / Bears</div>
              <div className="text-xl">
                {cell(senti?.aaii?.bulls)} / {cell(senti?.aaii?.bears)}
              </div>
            </div>
            <div className="rounded-lg bg-neutral-950 p-4 ring-1 ring-neutral-800">
              <div className="text-sm text-neutral-400 mb-1">Fear &amp; Greed</div>
              <div className="text-xl">{cell(senti?.fearGreed)}</div>
            </div>
          </div>
          {(senti?.error || senti?.stale) && (
            <div className="px-4 py-2 text-xs text-neutral-400 border-t border-neutral-800">
              Sources: {(senti?.sources ?? []).join(", ") || "—"}{" "}
              {senti?.error ? <span className="text-red-400">— {senti.error}</span> : null}
            </div>
          )}
        </div>
      </section>

      {/* ====== Yesterday’s notable earnings (US) ====== */}
      <section>
        <div className="rounded-xl bg-neutral-900/60 ring-1 ring-neutral-800">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">
            Yesterday’s notable earnings (US)
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/80 text-neutral-400">
                <tr>
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Symbol</th>
                  <th className="text-left px-4 py-2">Company</th>
                  <th className="text-left px-4 py-2">EPS (Actual / Est.)</th>
                  <th className="text-left px-4 py-2">Surprise</th>
                  <th className="text-left px-4 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {earningsItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-4 text-neutral-400" colSpan={6}>
                      No US earnings found for yesterday (or the source returned none).{" "}
                      {earnings?.error ? (
                        <span className="text-red-400">— {earnings.error}</span>
                      ) : null}
                    </td>
                  </tr>
                ) : (
                  earningsItems.map((r, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="px-4 py-2">{cell(r.time)}</td>
                      <td className="px-4 py-2">{cell(r.symbol)}</td>
                      <td className="px-4 py-2">{cell(r.companyName)}</td>
                      <td className="px-4 py-2">
                        {cell(r.epsActual)} / {cell(r.epsEstimate)}
                      </td>
                      <td className="px-4 py-2">
                        {r?.surprisePct === null || r?.surprisePct === undefined
                          ? "—"
                          : `${r.surprisePct > 0 ? "+" : ""}${r.surprisePct.toFixed(1)}%`}
                      </td>
                      <td className="px-4 py-2">{cell(r.result)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {(earnings?.error || earnings?.stale) && (
            <div className="px-4 py-2 text-xs text-neutral-400 border-t border-neutral-800">
              Source: {earnings?.source ?? "—"}{" "}
              {earnings?.error ? <span className="text-red-400">— {earnings.error}</span> : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
