"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, Badge, Button } from "@/components/ui";

type Tier = 1 | 2 | 3;
type MacroRow = { timeUK: string; country: string; release: string; tier: Tier; actual?: string; previous?: string; consensus?: string; forecast?: string; };
type EarningItem = { timeUK: string; symbol: string; name: string; session: "BMO" | "AMC" | "TBD"; mcap?: string; };
type Sentiment = { fearGreed?: number; pcrTotal?: number; vix?: number; note?: string; };
type OptionsBrief = { es?: { oiCalls?: number; oiPuts?: number }; nq?: { oiCalls?: number; oiPuts?: number }; pcrTotal?: number; comment?: string; };
type NewsItem = { title: string; source: string; summary?: string; url?: string };

const flag = (iso2: string) => {
  // quick flag emoji from ISO2
  const codePoints = iso2.toUpperCase().split("").map(c => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

function TierPill({ tier }: { tier: Tier }) {
  const map: Record<Tier, string> = { 1: "bg-red-600", 2: "bg-amber-600", 3: "bg-slate-600" };
  const label = tier === 1 ? "T1" : tier === 2 ? "T2" : "T3";
  return <span className={`inline-flex items-center justify-center w-7 h-5 rounded-md text-[10px] font-semibold text-white ${map[tier]}`}>{label}</span>;
}

function SentimentBadge({ value, label }: { value?: number; label: string }) {
  const color = value == null ? "bg-slate-700 text-white" : value < 35 ? "bg-amber-600 text-white" : value < 65 ? "bg-blue-600 text-white" : "bg-emerald-600 text-white";
  return <Badge className={color}>{label}: {value ?? "—"}</Badge>;
}

function optionsComment(o?: OptionsBrief) {
  if (!o) return "—";
  const esSkew = o.es && o.es.oiPuts && o.es.oiCalls ? (o.es.oiPuts - o.es.oiCalls) / Math.max(1, o.es.oiCalls) : 0;
  const nqSkew = o.nq && o.nq.oiPuts && o.nq.oiCalls ? (o.nq.oiPuts - o.nq.oiCalls) / Math.max(1, o.nq.oiCalls) : 0;

  const bullets: string[] = [];
  if (o.pcrTotal != null) {
    bullets.push(`Total PCR ${o.pcrTotal.toFixed(2)} → ${o.pcrTotal > 1 ? "put-tilt / hedging tone" : "call-tilt / risk-on leaning"}`);
  }
  if (isFinite(esSkew)) bullets.push(`ES skew: ${esSkew > 0 ? "puts > calls" : "calls ≥ puts"} — watch post-data IV crush or extension.`);
  if (isFinite(nqSkew)) bullets.push(`NQ skew: ${nqSkew > 0 ? "puts > calls" : "calls ≥ puts"} — tech sensitivity to yields remains key.`);
  bullets.push("Into the print: larger skew → faster first move but more mean-revert risk; lighter skew → cleaner trend if data surprises.");

  return bullets.join(" • ");
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-5 py-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Morning Update</h1>
            <p className="text-sm text-neutral-400">
              {today.toLocaleDateString("en-GB",{weekday:"short", day:"2-digit", month:"short", year:"numeric"})} · All times UK
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <Badge className="bg-amber-600 text-white">Showing cached</Badge>}
            <Button onClick={() => location.reload()}>Refresh</Button>
          </div>
        </header>

        {/* Macro table (TradingEconomics-style) */}
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-medium">Major US data today</h2>
              <span className="text-xs text-neutral-400">T1 red · T2 amber · T3 grey</span>
            </div>
            <div className="overflow-auto rounded-xl border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/70 sticky top-0 z-10">
                  <tr className="[&>th]:px-3 [&>th]:py-2 text-left text-neutral-300">
                    <th className="w-[70px]">Time</th>
                    <th className="w-[70px]">Country</th>
                    <th>Release</th>
                    <th className="w-[110px] text-right">Actual</th>
                    <th className="w-[110px] text-right">Previous</th>
                    <th className="w-[110px] text-right">Consensus</th>
                    <th className="w-[110px] text-right">Forecast</th>
                    <th className="w-[56px] text-center">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {macro.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-900/40">
                      <td className="px-3 py-2 font-mono text-[12px] text-neutral-300">{row.timeUK}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{flag(row.country)} <span className="text-neutral-300">{row.country}</span></td>
                      <td className="px-3 py-2">{row.release}</td>
                      <td className="px-3 py-2 text-right">{row.actual ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-neutral-300">{row.previous ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-neutral-300">{row.consensus ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-neutral-300">{row.forecast ?? "—"}</td>
                      <td className="px-3 py-2 text-center"><TierPill tier={row.tier} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Sentiment + Options */}
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardContent>
              <h2 className="mb-2 text-lg font-medium">Sentiment</h2>
              <div className="flex flex-wrap gap-2">
                <SentimentBadge value={sentiment.fearGreed} label="Fear&Greed" />
                <SentimentBadge value={sentiment.pcrTotal} label="Put/Call" />
                <SentimentBadge value={sentiment.vix} label="VIX" />
              </div>
              <p className="mt-2 text-xs text-neutral-400">{sentiment?.note}</p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardContent>
              <h2 className="mb-2 text-lg font-medium">Options positioning (context)</h2>
              <div className="mb-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-neutral-400 text-xs mb-1">ES OI</div>
                  <div className="text-neutral-300">Calls {options.es?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.es?.oiPuts?.toLocaleString() ?? "—"}</div>
                </div>
                <div>
                  <div className="text-neutral-400 text-xs mb-1">NQ OI</div>
                  <div className="text-neutral-300">Calls {options.nq?.oiCalls?.toLocaleString() ?? "—"} · Puts {options.nq?.oiPuts?.toLocaleString() ?? "—"}</div>
                </div>
              </div>
              <p className="text-sm">{optionsComment(options)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Earnings + Stories */}
        <div className="grid gap-5 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardContent>
              <h2 className="mb-2 text-lg font-medium">Notable earnings (US)</h2>
              <ul className="space-y-2">
                {earnings.map((er, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="w-12 font-mono text-[12px] text-neutral-300">{er.timeUK}</span>
                      <span className="text-sm font-medium">{er.symbol}</span>
                      <span className="text-sm text-neutral-300">{er.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-neutral-700 text-white">{er.session}</Badge>
                      {er.mcap && <span className="text-[11px] text-neutral-400">{er.mcap}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <h2 className="mb-2 text-lg font-medium">Top market stories</h2>
              <ol className="list-decimal pl-4 space-y-2">
                {news.map((n, i) => (
                  <li key={i} className="text-sm">
                    <div className="font-medium">{n.title} <span className="text-[11px] text-neutral-400">· {n.source}</span></div>
                    <div className="text-neutral-300">{n.summary ?? "—"}</div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <p className="text-[11px] text-neutral-500">Layout tuned for quick glance. Table columns widen on larger screens; sticky header for scrolling.</p>
      </div>
    </div>
  );
}
