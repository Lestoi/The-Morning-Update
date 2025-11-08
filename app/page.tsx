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
  pcrTotal?: number | null;
  vix?: number | null;
  aaiiBulls?: number | null;
  aaiiBears?: number | null;
  note?: string;
};

type OptionsBrief = {
  es?: { oiCalls?: number; oiPuts?: number };
  nq?: { oiCalls?: number; oiPuts?: number };
  pcrTotal?: number;
  comment?: string;
};

type NewsItem = { title: string; source: string; summary?: string };
type YDayEarning = { symbol: string; name: string; epsSurprisePct: number };

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

/* -------- Options explanations (plain-English) -------- */
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
          fetch("/api/earnings-yday").then(r => r.json())
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

                      {/* Actual with color & delta */}
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
            <p className="text-xs text-neutral-400 -mt-1 mb-3">VIX live; PCR & AAII wiring next.</p>

            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div>Fear &amp; Greed</div>
                <div className="flex items-center gap-2">
                  <Chip text={`${sentiment.fearGreed ?? "—"}`} className="bg-amber-600 text-white" />
                  <span className="text-neutral-400">(0=fear, 100=greed)</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div>Put/Call (total)</div>
                <div className="flex items-center gap-3">
                  <Chip text={`${sentiment.pcrTotal ?? "—"}`} className="bg-sky-700 text-white" />
                  <span className="text-neutral-400 text-xs">&gt;1 = more puts (hedging) / &lt;1 = more calls (risk-on)</span>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div>VIX</div>
                <div className="flex items-center gap-2">
                  <Chip text={`${sentiment.vix ?? "—"}`} className="bg-purple-700 text-white" />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <div>AAII Bulls / Bears</div>
                <div className="flex items-center gap-2">
                  <Chip text={`Bulls ${sentiment.aaiiBulls ?? "—"}%`} className="bg-emerald-700 text-white" />
                  <Chip text={`Bears ${sentiment.aaiiBears ?? "—"}%`} className="bg-rose-700 text-white" />
                </div>
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

        {/* Earnings (today) + Yesterday’s notable earnings */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent>
              <h2 className="mb-1 text-lg font-semibold">Notable earnings (US)</h2>
              <p className="text-xs text-neutral-400 -mt-1 mb-3">
                {earnings.length ? `As of ${nowStamp}` : "No notable US earnings found for today."}
              </p>

              <div className="overflow-auto rounded-xl border border-neutral-800">
                <table className="w-full text-[15px]">
                  <thead className="bg-neutral-900/80">
                    <tr className="[&>th]:px-4 [&>th]:py-3 text-left text-neutral-300">
                      <th className="w-[90px]">Time</th>
                      <th className="w-[120px]">Ticker</th>
                      <th className="min-w-[260px]">Company</th>
                      <th className="w-[90px]">Session</th>
                      <th className="w-[130px] text-right">Market Cap</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {earnings.map((er, i) => (
                      <tr key={i} className="hover:bg-neutral-900/50">
                        <td className="px-4 py-3 font-mono text-sm text-neutral-300">{er.timeUK}</td>
                        <td className="px-4 py-3 font-semibold">{er.symbol}</td>
                        <td className="px-4 py-3">{er.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-md px-2 py-1 text-xs ${
                              er.session === "BMO" ? "bg-sky-600 text-white" : "bg-emerald-600 text-white"
                            }`}
                          >
                            {er.session}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-300">{er.mcap ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-1 text-lg font-semibold">Yesterday’s notable earnings (US)</h2>
              <p className="text-xs text-neutral-400 -mt-1 mb-3">
                {yday.length ? `As of ${nowStamp}` : "No large US names reported yesterday (or source returned none)."}
              </p>

              <div className="overflow-auto rounded-xl border border-neutral-800">
                <table className="w-full text-[15px]">
                  <thead className="bg-neutral-900/80">
                    <tr className="[&>th]:px-4 [&>th]:py-3 text-left text-neutral-300">
                      <th className="w-[120px]">Ticker</th>
                      <th className="min-w-[260px]">Company</th>
                      <th className="w-[160px] text-right">EPS Surprise</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {yday.map((r, i) => (
                      <tr key={i} className="hover:bg-neutral-900/50">
                        <td className="px-4 py-3 font-semibold">{r.symbol}</td>
                        <td className="px-4 py-3">{r.name}</td>
                        <td className="px-4 py-3 text-right">
                          <span
                            className={`rounded-md px-2 py-1 text-sm font-semibold ${
                              r.epsSurprisePct >= 0 ? "bg-emerald-700 text-white" : "bg-rose-700 text-white"
                            }`}
                          >
                            {r.epsSurprisePct >= 0 ? "+" : ""}
                            {r.epsSurprisePct.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-neutral-400">Surprise vs consensus EPS; positive = beat, negative = miss.</p>
            </CardContent>
          </Card>
        </div>

        {/* Stories */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold">Top market stories</h2>
            <ol className="space-y-4">
              {news.map((n, i) => (
                <li key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="mb-1 text-base font-semibold">
                    {i + 1}. {n.title}
                  </div>
                  <div className="mb-2 text-xs text-neutral-400">{n.source}</div>
                  <p className="text-sm leading-6 text-neutral-200 whitespace-pre-line">{n.summary ?? "—"}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <p className="text-[11px] text-neutral-500">
          Actual vs Consensus now color-coded; “As of” stamps added; friendly empty states where sources return nothing.
        </p>
      </div>
    </div>
  );
}
