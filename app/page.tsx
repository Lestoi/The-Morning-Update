"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, Badge, Button } from "@/components/ui";

/* =========================
   Types
========================= */
type Tier = 1 | 2 | 3;

type MacroRow = {
  timeUK: string;
  country: string;
  release: string;
  tier: Tier;
  actual?: string;
  previous?: string;
  consensus?: string;
  forecast?: string;
};

type EarningItem = {
  timeUK: string;
  symbol: string;
  name: string;
  session: "BMO" | "AMC" | "TBD";
  mcap?: string;
};

type Sentiment = {
  fearGreed?: number | null;
  fearGreedLabel?: string | null;
  fearGreedAsOf?: string | null;

  pcrTotal?: number | null;
  pcrAsOf?: string | null;

  vix?: number | null;
  vixAsOf?: string | null;

  aaiiBulls?: number | null;
  aaiiBears?: number | null;
  aaiiAsOf?: string | null;

  note?: string;
};

type OptionsBrief = {
  es?: { oiCalls?: number; oiPuts?: number };
  nq?: { oiCalls?: number; oiPuts?: number };
  pcrTotal?: number;
  comment?: string;
};

type NewsItem = { title: string; source: string; summary?: string; published?: string };

type YDayEarning = {
  symbol: string;
  name: string;
  time: "BMO" | "AMC" | "TBD";
  epsActual: number | null;
  epsEstimate: number | null;
  epsSurprise: number | null;
  surprisePct: number | null;
  beat: boolean | null;
  marketCap: number | null;
};

/* =========================
   Small helpers
========================= */
const flag = (iso2: string) =>
  String.fromCodePoint(...iso2.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0)));

const TierPill = ({ tier }: { tier: Tier }) => {
  const map: Record<Tier, string> = { 1: "bg-red-600", 2: "bg-amber-500", 3: "bg-sky-600" };
  const label = tier === 1 ? "Tier 1" : tier === 2 ? "Tier 2" : "Tier 3";
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold text-white ${map[tier]}`}>
      {label}
    </span>
  );
};

const Chip = ({ text, className = "" }: { text: string; className?: string }) => (
  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-sm font-medium ${className}`}>{text}</span>
);

function getFgColor(n?: number | null) {
  if (n == null) return "bg-neutral-700 text-white";
  if (n <= 25) return "bg-rose-700 text-white";
  if (n <= 44) return "bg-amber-600 text-black";
  if (n <= 55) return "bg-neutral-700 text-white";
  if (n <= 74) return "bg-emerald-700 text-white";
  return "bg-green-700 text-white";
}

/* -------- Options explanations -------- */
function optionsExplanations(o?: OptionsBrief): string[] {
  if (!o) return ["No options data available."];

  const bullets: string[] = [];
  if (o.pcrTotal != null) {
    bullets.push(
      `Total market put/call ratio = ${o.pcrTotal.toFixed(2)}. ` +
        (o.pcrTotal > 1
          ? "Above 1 → more puts than calls (hedging). Positive data can trigger a relief pop as hedges are unwound."
          : "Below 1 → more calls than puts (risk-on). Positive data can extend trends; negative surprises can unwind quickly.")
    );
  }
  if (o.es?.oiCalls != null && o.es?.oiPuts != null) {
    bullets.push(
      `ES (S&P) OI — Calls ${o.es.oiCalls.toLocaleString()} vs Puts ${o.es.oiPuts.toLocaleString()}. ` +
        (o.es.oiPuts > o.es.oiCalls
          ? "Puts > calls: downside hedges in place; strong data often squeezes higher with IV crush."
          : "Calls ≥ puts: upside exposure heavier; weak data can produce faster selloffs as longs reduce.")
    );
  }
  if (o.nq?.oiCalls != null && o.nq?.oiPuts != null) {
    bullets.push(
      `NQ (Nasdaq) OI — Calls ${o.nq.oiCalls.toLocaleString()} vs Puts ${o.nq.oiPuts.toLocaleString()}. ` +
        (o.nq.oiPuts > o.nq.oiCalls
          ? "Tech is more hedged; bullish surprises can pop on short-covering."
          : "Tech upside is more crowded; keep an eye on yields/USD — they gate follow-through.")
    );
  }
  bullets.push(
    "Rule of thumb: bigger put tilt → faster first move but more mean-revert risk; lighter tilt → cleaner trends if the macro surprise is decisive."
  );
  return bullets;
}

/* -------- Actual vs Consensus color/delta logic -------- */
function parseNum(s?: string) {
  if (s == null) return null;
  const n = Number(String(s).replace(/[,%]/g, ""));
  return isFinite(n) ? n : null;
}
function lowerIsBetter(name: string) {
  return /unemployment|jobless|cpi|core cpi|pce|core pce|ppi|inflation|deflator|claims|deficit/i.test(name);
}
function higherIsBetter(name: string) {
  return /payrolls|nonfarm|nfp|retail sales|ism|pmi|housing starts|new home|existing home|durable|gdp|jolts|confidence|sentiment|rig count|industrial/i.test(
    name
  );
}
function evalBeat(row: { release: string; actual?: string; consensus?: string }) {
  const a = parseNum(row.actual);
  const c = parseNum(row.consensus);
  if (a == null || c == null) return { color: "", deltaText: "" };
  const delta = a - c;
  const isGood = higherIsBetter(row.release) ? delta >= 0 : lowerIsBetter(row.release) ? delta <= 0 : delta >= 0;
  const color = isGood ? "text-emerald-400" : "text-rose-400";
  const deltaText = `${delta >= 0 ? "+" : ""}${(Math.round(delta * 100) / 100).toString()}`;
  return { color, deltaText };
}

/* =========================
   Page
========================= */
export default function Page() {
  const [macro, setMacro] = useState<MacroRow[]>([]);
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment>({});
  const [options, setOptions] = useState<OptionsBrief>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [yday, setYday] = useState<YDayEarning[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m, e, s, o, n, y] = await Promise.all([
          fetch("/api/macro").then(r => r.json()),
          fetch("/api/earnings").then(r => r.json()),
          fetch("/api/sentiment-snapshot").then(r => r.json()),
          fetch("/api/options-brief").then(r => r.json()),
          fetch("/api/top-headlines").then(r => r.json()),
          fetch("/api/earnings-yday").then(r => r.json()),
        ]);
        setMacro(m.items ?? []);
        setEarnings(e.items ?? []);
        setSentiment(s ?? {});
        setOptions(o ?? {});
        setNews(n.items ?? []);
        setYday(y.items ?? []);
        setStale(Boolean(m.stale || e.stale || s.stale || o.stale || n.stale || y.stale));
      } catch {
        setStale(true);
      }
    })();
  }, []);

  const nowStamp = useMemo(
    () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    []
  );
  const today = useMemo(() => new Date(), []);

  const formatAsOf = (s?: string | null) => {
    if (!s) return null;
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString("en-GB", {
          weekday: "short",
          day: "2-digit",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
      return s;
    } catch {
      return s;
    }
  };

  const fmtNum = (n: number | null, digits = 2) =>
    n == null || !isFinite(n) ? "—" : (Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits)).toString();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Morning Update</h1>
            <p className="text-sm text-neutral-400">
              {today.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} ·
              All times UK
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <Badge className="bg-amber-600 text-white">Showing cached</Badge>}
            <Button onClick={() => location.reload()}>Refresh</Button>
          </div>
        </header>

        {/* Macro Table */}
        <Card>
          <CardContent>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Major US data today</h2>
              <div className="text-xs">
                <span className="mr-2 rounded-md bg-red-600 px-2 py-0.5 text-white">Tier 1</span>
                <span className="mr-2 rounded-md bg-amber-500 px-2 py-0.5 text-black">Tier 2</span>
                <span className="rounded-md bg-sky-600 px-2 py-0.5 text-white">Tier 3</span>
              </div>
            </div>
            <p className="text-xs text-neutral-400 -mt-1 mb-3">
              {macro.length ? `As of ${nowStamp}` : "No items today (or source returned none)."}
            </p>

            <div className="overflow-auto rounded-xl border border-neutral-800">
              <table className="w-full text-[15px]">
                <thead className="bg-neutral-900/80 sticky top-0 z-10">
                  <tr className="[&>th]:px-4 [&>th]:py-3 text-left text-neutral-300">
                    <th className="w-[90px]">Time</th>
                    <th className="w-[120px]">Country</th>
                    <th className="min-w-[360px]">Release</th>
                    <th className="w-[120px] text-right">Actual</th>
                    <th className="w-[120px] text-right">Previous</th>
                    <th className="w-[120px] text-right">Consensus</th>
                    <th className="w-[120px] text-right">Forecast</th>
                    <th className="w-[90px] text-center">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {macro.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-900/50">
                      <td className="px-4 py-3 font-mono text-sm text-neutral-300">{row.timeUK}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {flag(row.country)} <span className="ml-1 text-neutral-300">{row.country}</span>
                      </td>
                      <td className="px-4 py-3">{row.release}</td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const { color, deltaText } = evalBeat(row);
                          return (
                            <span className={color || ""}>
                              {row.actual ?? "—"}{" "}
                              {color && row.consensus ? (
                                <span className="text-xs text-neutral-400 ml-1">({deltaText})</span>
                              ) : null}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.previous ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.consensus ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.forecast ?? "—"}</td>
                      <td className="px-4 py-3 text-center">
                        <TierPill tier={row.tier} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment */}
        <Card>
          <CardContent>
            <h2 className="mb-1 text-lg font-semibold">Sentiment</h2>
            <p className="text-xs text-neutral-400 -mt-1 mb-3">Live VIX; PCR &amp; AAII wired with resilient fallbacks.</p>

            <div className="space-y-3 text-sm">
              {/* Fear & Greed */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>Fear &amp; Greed</div>
                  <div className="flex items-center gap-2">
                    <Chip text={`${sentiment.fearGreed ?? "—"}`} className={getFgColor(sentiment.fearGreed)} />
                    <Chip text={`${sentiment.fearGreedLabel ?? ""}`} className="bg-neutral-800 text-neutral-100" />
                    <span className="text-neutral-400">(0=fear, 100=greed)</span>
                  </div>
                </div>
                {sentiment.fearGreedAsOf && (
                  <div className="mt-1 text-[11px] text-neutral-500">As of {formatAsOf(sentiment.fearGreedAsOf)}</div>
                )}
              </div>

              {/* PCR */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>Put/Call (total)</div>
                  <div className="flex items-center gap-3">
                    <Chip text={`${sentiment.pcrTotal ?? "—"}`} className="bg-sky-700 text-white" />
                    <span className="text-neutral-400 text-xs">&gt;1 = more puts (hedging) / &lt;1 = more calls (risk-on)</span>
                  </div>
                </div>
                {sentiment.pcrAsOf && (
                  <div className="mt-1 text-[11px] text-neutral-500">As of {formatAsOf(sentiment.pcrAsOf)}</div>
                )}
              </div>

              {/* VIX */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>VIX</div>
                  <div className="flex items-center gap-2">
                    <Chip text={`${sentiment.vix ?? "—"}`} className="bg-purple-700 text-white" />
                  </div>
                </div>
                {sentiment.vixAsOf && (
                  <div className="mt-1 text-[11px] text-neutral-500">As of {formatAsOf(sentiment.vixAsOf)}</div>
                )}
              </div>

              {/* AAII */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>AAII Bulls / Bears</div>
                  <div className="flex items-center gap-2">
                    <Chip text={`Bulls ${sentiment.aaiiBulls ?? "—"}%`} className="bg-emerald-700 text-white" />
                    <Chip text={`Bears ${sentiment.aaiiBears ?? "—"}%`} className="bg-rose-700 text-white" />
                  </div>
                </div>
                {sentiment.aaiiAsOf && (
                  <div className="mt-1 text-[11px] text-neutral-500">As of {formatAsOf(sentiment.aaiiAsOf)}</div>
                )}
              </div>

              {sentiment?.note && <div className="text-xs text-neutral-400 px-1">{sentiment.note}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Options */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold">Options positioning (context)</h2>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="text-xs text-neutral-400 mb-1">ES open interest</div>
                <div className="text-sm">
                  Calls {options.es?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.es?.oiPuts?.toLocaleString() ?? "—"}
                </div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="text-xs text-neutral-400 mb-1">NQ open interest</div>
                <div className="text-sm">
                  Calls {options.nq?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.nq?.oiPuts?.toLocaleString() ?? "—"}
                </div>
              </div>
            </div>

            <ul className="list-disc pl-5 space-y-2 text-sm">
              {optionsExplanations(options).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Yesterday's notable earnings (US) */}
        <Card>
          <CardContent>
            <h2 className="mb-2 text-lg font-semibold">Yesterday’s notable earnings (US)</h2>
            <p className="text-xs text-neutral-400 -mt-1 mb-3">
              Top results by market cap; EPS actual vs estimate with beat/miss.
            </p>

            <div className="overflow-auto rounded-xl border border-neutral-800">
              <table className="w-full text-[15px]">
                <thead className="bg-neutral-900/80 sticky top-0 z-10">
                  <tr className="[&>th]:px-4 [&>th]:py-3 text-left text-neutral-300">
                    <th className="w-[80px]">Time</th>
                    <th className="w-[120px]">Symbol</th>
                    <th className="min-w-[260px]">Company</th>
                    <th className="w-[160px] text-right">EPS (Actual / Est.)</th>
                    <th className="w-[140px] text-right">Surprise</th>
                    <th className="w-[90px] text-center">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {yday.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-neutral-400 text-sm">
                        No US earnings found for yesterday (or source returned none).
                      </td>
                    </tr>
                  ) : (
                    yday.map((row, i) => {
                      const resultChip =
                        row.beat == null ? (
                          <Chip text="N/A" className="bg-neutral-700 text-white" />
                        ) : row.beat ? (
                          <Chip text="Beat" className="bg-emerald-700 text-white" />
                        ) : (
                          <Chip text="Miss" className="bg-rose-700 text-white" />
                        );

                      const surpriseStr =
                        row.epsSurprise == null && row.surprisePct == null
                          ? "—"
                          : `${fmtNum(row.epsSurprise)} (${fmtNum(row.surprisePct)}%)`;

                      return (
                        <tr key={i} className="hover:bg-neutral-900/50">
                          <td className="px-4 py-3 text-neutral-300">{row.time}</td>
                          <td className="px-4 py-3 font-mono">{row.symbol}</td>
                          <td className="px-4 py-3">{row.name}</td>
                          <td className="px-4 py-3 text-right text-neutral-200">
                            {fmtNum(row.epsActual)} /{" "}
                            <span className="text-neutral-400">{fmtNum(row.epsEstimate)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">{surpriseStr}</td>
                          <td className="px-4 py-3 text-center">{resultChip}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Top market stories */}
        <Card>
          <CardContent>
            <h2 className="mb-2 text-lg font-semibold">Top market stories</h2>
            <p className="text-xs text-neutral-400 -mt-1 mb-3">
              Short summaries of the key themes US investors are watching today.
            </p>

            {news.length === 0 ? (
              <p className="text-sm text-neutral-400">No stories available right now.</p>
            ) : (
              <ol className="list-decimal pl-5 space-y-4">
                {news.map((item, i) => (
                  <li key={i}>
                    <div className="font-medium">{item.title}</div>
                    {item.summary && <div className="text-sm text-neutral-200 mt-1">{item.summary}</div>}
                    <div className="text-[11px] text-neutral-500 mt-1">
                      {item.source} · {formatAsOf(item.published)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <p className="text-[11px] text-neutral-500">
          Earnings & news via FMP (free). Sentiment includes live Fear &amp; Greed, PCR, VIX, and AAII.
        </p>
      </div>
    </div>
  );
}
