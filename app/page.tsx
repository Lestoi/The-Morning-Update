"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, Badge, Button } from "@/components/ui";

type Tier = 1 | 2 | 3;
type MacroRow = { timeUK: string; country: string; release: string; tier: Tier; actual?: string; previous?: string; consensus?: string; forecast?: string; };
type EarningItem = { timeUK: string; symbol: string; name: string; session: "BMO" | "AMC" | "TBD"; mcap?: string; };
type Sentiment = { fearGreed?: number; pcrTotal?: number; vix?: number; note?: string; };
type OptionsBrief = { es?: { oiCalls?: number; oiPuts?: number }; nq?: { oiCalls?: number; oiPuts?: number }; pcrTotal?: number; comment?: string; };
type NewsItem = { title: string; source: string; summary?: string };

const flag = (iso2: string) => {
  const cps = iso2.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
};

const TierPill = ({ tier }: { tier: Tier }) => {
  const map: Record<Tier, string> = { 1: "bg-red-600", 2: "bg-amber-500", 3: "bg-sky-600" };
  const label = tier === 1 ? "Tier 1" : tier === 2 ? "Tier 2" : "Tier 3";
  return <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-semibold text-white ${map[tier]}`}>{label}</span>;
};

const StatRow = ({ label, value, sub }: { label: string; value?: string | number; sub?: string }) => (
  <div className="flex items-baseline justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
    <div className="text-sm text-neutral-300">{label}</div>
    <div className="text-base font-semibold">{value ?? "—"}</div>
    {sub && <div className="basis-full mt-2 text-xs text-neutral-400 col-span-2">{sub}</div>}
  </div>
);

function optionsExplanations(o?: OptionsBrief): string[] {
  if (!o) return ["No options data available."];

  const bullets: string[] = [];

  // 1) Total Put/Call
  if (o.pcrTotal != null) {
    bullets.push(
      `Total market put/call ratio is ${o.pcrTotal.toFixed(2)}. ` +
      (o.pcrTotal > 1
        ? "Above 1 means more puts than calls outstanding — a hedging/defensive tilt. Into data, that can create 'fuel' for a relief pop if the print is benign (dealers unwind hedges)."
        : "Below 1 means more calls than puts — risk-on tilt. That can make first moves extend if the data surprises positively, but also leaves room for a sharper drop if it disappoints.")
    );
  }

  // 2) ES skew
  if (o.es?.oiPuts != null && o.es?.oiCalls != null) {
    const skew = o.es.oiPuts - o.es.oiCalls;
    bullets.push(
      `ES (S&P) open interest — Calls ${o.es.oiCalls.toLocaleString()} vs Puts ${o.es.oiPuts.toLocaleString()}. ` +
      (skew > 0
        ? "More puts than calls: downside hedges in place. If data is strong, IV (implied vol) can compress and ES may squeeze higher as hedges are reduced."
        : "Calls ≥ puts: upside exposure is heavier. Positive data can trend cleanly; negative surprises can trigger faster downside as longs reduce.")
    );
  }

  // 3) NQ skew
  if (o.nq?.oiPuts != null && o.nq?.oiCalls != null) {
    const skew = o.nq.oiPuts - o.nq.oiCalls;
    bullets.push(
      `NQ (Nasdaq) open interest — Calls ${o.nq.oiCalls.toLocaleString()} vs Puts ${o.nq.oiPuts.toLocaleString()}. ` +
      (skew > 0
        ? "Puts > calls: tech is more hedged. Bullish surprises can produce sharp, short-covering pops."
        : "Calls ≥ puts: more upside bets on tech. Watch yields and USD — those often gate how far NQ can run.")
    );
  }

  // 4) Trading takeaway
  bullets.push(
    "Trading takeaway: larger put tilt often means faster first move then mean-reversion risk; lighter tilt gives cleaner trends if the macro surprise is decisive."
  );

  return bullets;
}

export default function Page() {
  const [macro, setMacro] = useState<MacroRow[]>([]);
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment>({});
  const [options, setOptions] = useState<OptionsBrief>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [m,e,s,o,n] = await Promise.all([
          fetch("/api/macro").then(r=>r.json()),
          fetch("/api/earnings").then(r=>r.json()),
          fetch("/api/sentiment-snapshot").then(r=>r.json()),
          fetch("/api/options-brief").then(r=>r.json()),
          fetch("/api/top-headlines").then(r=>r.json()),
        ]);
        setMacro(m.items ?? []); setEarnings(e.items ?? []);
        setSentiment(s ?? {});   setOptions(o ?? {});
        setNews(n.items ?? []);
        setStale(Boolean(m.stale || e.stale || s.stale || o.stale || n.stale));
      } catch { setStale(true); }
    })();
  }, []);

  const today = useMemo(() => new Date(), []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-6 py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Morning Update</h1>
            <p className="text-sm text-neutral-400">
              {today.toLocaleDateString("en-GB",{weekday:"short",day:"2-digit",month:"short",year:"numeric"})} · All times UK
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <Badge className="bg-amber-600 text-white">Showing cached</Badge>}
            <Button onClick={() => location.reload()}>Refresh</Button>
          </div>
        </header>

        {/* Macro Table (wider, Excel-like) */}
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Major US data today</h2>
              <div className="text-xs">
                <span className="mr-2 rounded-md bg-red-600 px-2 py-0.5 text-white">Tier 1</span>
                <span className="mr-2 rounded-md bg-amber-500 px-2 py-0.5 text-black">Tier 2</span>
                <span className="rounded-md bg-sky-600 px-2 py-0.5 text-white">Tier 3</span>
              </div>
            </div>

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
                      <td className="px-4 py-3 whitespace-nowrap">{flag(row.country)} <span className="ml-1 text-neutral-300">{row.country}</span></td>
                      <td className="px-4 py-3">{row.release}</td>
                      <td className="px-4 py-3 text-right">{row.actual ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.previous ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.consensus ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-neutral-300">{row.forecast ?? "—"}</td>
                      <td className="px-4 py-3 text-center"><TierPill tier={row.tier} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment (each on its own line) */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold">Sentiment</h2>
            <div className="space-y-3">
              <StatRow label="Fear & Greed" value={sentiment.fearGreed} sub="Lower = fear; higher = greed. Extreme levels can precede mean reversion." />
              <StatRow label="Put/Call (total)" value={sentiment.pcrTotal} sub=">1.0 means more puts than calls (hedging tone). <1.0 means more calls (risk-on tilt)." />
              <StatRow label="VIX" value={sentiment.vix} sub="Higher VIX = pricier options / bigger expected ranges. Often fades after big events." />
              {sentiment?.note && <div className="text-xs text-neutral-400 px-1">{sentiment.note}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Options (bullets on separate lines + plain-English) */}
        <Card>
          <CardContent>
            <h2 className="mb-3 text-lg font-semibold">Options positioning (context)</h2>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="text-xs text-neutral-400 mb-1">ES open interest</div>
                <div className="text-sm">Calls {options.es?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.es?.oiPuts?.toLocaleString() ?? "—"}</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="text-xs text-neutral-400 mb-1">NQ open interest</div>
                <div className="text-sm">Calls {options.nq?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.nq?.oiPuts?.toLocaleString() ?? "—"}</div>
              </div>
            </div>

            <ul className="list-disc pl-5 space-y-2 text-sm">
              {optionsExplanations(options).map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </CardContent>
        </Card>

        {/* Earnings (wider table) + Stories with long summaries */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-lg font-semibold">Notable earnings (US)</h2>
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
                          <span className={`rounded-md px-2 py-1 text-xs ${er.session === "BMO" ? "bg-sky-600 text-white" : "bg-emerald-600 text-white"}`}>
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
              <h2 className="mb-3 text-lg font-semibold">Top market stories</h2>
              <ol className="space-y-4">
                {news.map((n, i) => (
                  <li key={i} className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
                    <div className="mb-1 text-base font-semibold">{i+1}. {n.title}</div>
                    <div className="mb-2 text-xs text-neutral-400">{n.source}</div>
                    <p className="text-sm leading-6 text-neutral-200 whitespace-pre-line">{n.summary ?? "—"}</p>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <p className="text-[11px] text-neutral-500">Columns widened for readability; headings spaced; each sentiment/option point on its own line.</p>
      </div>
    </div>
  );
}
