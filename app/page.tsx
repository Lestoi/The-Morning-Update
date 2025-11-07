"use client";
import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent, Badge, Button } from "@/components/ui";

type Tier = 1 | 2 | 3;
interface MacroEvent { timeUK: string; title: string; tier: Tier; source: string; }
interface EarningItem { timeUK: string; symbol: string; name: string; session: "BMO" | "AMC" | "TBD"; mcap?: string; }
interface Sentiment { fearGreed?: number; pcrTotal?: number; vix?: number; note?: string; }
interface OptionsBrief { es?: { oiCalls?: number; oiPuts?: number }; nq?: { oiCalls?: number; oiPuts?: number }; pcrTotal?: number; comment?: string }
interface NewsItem { title: string; source: string; url: string }

function TierDot({ tier }: { tier: Tier }) {
  const label = tier === 1 ? "Tier‑1" : tier === 2 ? "Tier‑2" : "Tier‑3";
  const cls = tier === 1 ? "bg-red-500" : tier === 2 ? "bg-amber-500" : "bg-slate-500";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white ${cls}`}>{label}</span>;
}
function SentimentBadge({ value, label }: { value?: number; label: string }) {
  const color = value == null ? "bg-slate-600 text-white" : value < 35 ? "bg-amber-600 text-white" : value < 65 ? "bg-blue-600 text-white" : "bg-emerald-600 text-white";
  return <Badge className={color}>{label}: {value ?? "—"}</Badge>;
}

export default function Page() {
  const [macro, setMacro] = useState<MacroEvent[]>([]);
  const [earnings, setEarnings] = useState<EarningItem[]>([]);
  const [sentiment, setSentiment] = useState<Sentiment>({});
  const [options, setOptions] = useState<OptionsBrief>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [m,e,s,o,n] = await Promise.all([
          fetch("/api/macro").then(r=>r.json()),
          fetch("/api/earnings").then(r=>r.json()),
          fetch("/api/sentiment-snapshot").then(r=>r.json()),
          fetch("/api/options-brief").then(r=>r.json()),
          fetch("/api/top-headlines").then(r=>r.json()),
        ]);
        setMacro(m.items ?? []);
        setEarnings(e.items ?? []);
        setSentiment(s ?? {});
        setOptions(o ?? {});
        setNews(n.items ?? []);
        setStale(Boolean(m.stale || e.stale || s.stale || o.stale || n.stale));
      } catch { setStale(true); }
    }
    load();
  }, []);

  const today = useMemo(() => new Date(), []);

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Morning Update</h1>
            <p className="text-sm text-neutral-400">
              {today.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · All times UK
            </p>
          </div>
          <div className="flex items-center gap-2">
            {stale && <Badge className="bg-amber-600 text-white">Showing cached</Badge>}
            <Button onClick={() => location.reload()}>Refresh</Button>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-2"><CardContent>
            <div className="flex items-center gap-2 mb-2"><h2 className="text-lg font-medium">Major US data today</h2></div>
            <ul className="space-y-2">
              {macro.map((e,i)=>(
                <li key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-neutral-300 w-12">{e.timeUK}</span>
                    <span className="text-sm">{e.title}</span>
                  </div>
                  <div className="flex items-center gap-2"><TierDot tier={e.tier} /><span className="text-[10px] text-neutral-400">{e.source}</span></div>
                </li>
              ))}
            </ul>
          </CardContent></Card>

          <Card><CardContent>
            <div className="flex items-center gap-2 mb-2"><h2 className="text-lg font-medium">Sentiment</h2></div>
            <div className="flex flex-wrap gap-2">
              <SentimentBadge value={sentiment.fearGreed} label="Fear&Greed" />
              <SentimentBadge value={sentiment.pcrTotal} label="Put/Call" />
              <SentimentBadge value={sentiment.vix} label="VIX" />
            </div>
            <p className="text-xs text-neutral-400 mt-2">{sentiment?.note}</p>
          </CardContent></Card>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-2"><CardContent>
            <div className="flex items-center gap-2 mb-2"><h2 className="text-lg font-medium">Notable earnings (US)</h2></div>
            <ul className="space-y-2">
              {earnings.map((er,i)=>(
                <li key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-neutral-300 w-12">{er.timeUK}</span>
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
          </CardContent></Card>

          <Card><CardContent className="space-y-2">
            <div className="flex items-center gap-2 mb-2"><h2 className="text-lg font-medium">Options positioning</h2></div>
            <div className="text-sm flex items-center gap-2"><span className="font-semibold">ES</span>
              {options?.es ? (
                <span className="text-neutral-300">C {options.es.oiCalls?.toLocaleString()} · P {options.es.oiPuts?.toLocaleString()}</span>
              ) : <span className="text-neutral-500">—</span>}
            </div>
            <div className="text-sm flex items-center gap-2"><span className="font-semibold">NQ</span>
              {options?.nq ? (
                <span className="text-neutral-300">C {options.nq.oiCalls?.toLocaleString()} · P {options.nq.oiPuts?.toLocaleString()}</span>
              ) : <span className="text-neutral-500">—</span>}
            </div>
            <div className="text-xs text-neutral-400">Total PCR: {options?.pcrTotal ?? "—"}</div>
            <div className="text-xs text-neutral-300">{options?.comment}</div>
          </CardContent></Card>
        </div>

        <Card><CardContent>
          <div className="flex items-center gap-2 mb-2"><h2 className="text-lg font-medium">Top 3 market stories</h2></div>
          <ol className="list-decimal pl-4 space-y-1">
            {news.map((n,i)=>(
              <li key={i} className="text-sm">
                <a className="underline decoration-neutral-600 hover:decoration-neutral-300" href={n.url} target="_blank" rel="noreferrer">{n.title}</a>
                <span className="text-[11px] text-neutral-400"> · {n.source}</span>
              </li>
            ))}
          </ol>
        </CardContent></Card>

        <div className="text-[11px] text-neutral-500 mt-2">
          Sources wired: BLS, U‑Mich, Cboe, CME, Nasdaq/Yahoo Finance, Reuters/Bloomberg/WSJ (headlines). All times converted to Europe/London.
        </div>
      </div>
    </div>
  );
}
