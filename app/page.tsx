// /app/page.tsx
import React from "react";
import { headers } from "next/headers";

export const dynamic = "force-dynamic"; // ensure server renders at request-time

type MacroRow = {
  timeUK: string;
  country: string;
  release: string;
  actual: string;
  previous: string;
  consensus: string;
  forecast: string;
  tier: "T1" | "T2" | "T3";
};
type MacroResp = { items: MacroRow[]; stale: boolean; source?: string; error?: string };

type SentResp = {
  vix: number | null;
  putCall: number | null;
  aaii: { bullsPct: number | null; bearsPct: number | null } | null;
  fearGreed: number | null;
  stale: boolean;
  sources: string[];
  updated: string;
};

function getBaseUrl() {
  const env = process.env.NEXT_PUBLIC_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

async function safeGet<T extends { [k: string]: any }>(path: string, fallback: T): Promise<T> {
  try {
    const base = getBaseUrl();
    const res = await fetch(`${base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (e: any) {
    return { ...fallback, stale: true, error: e?.message ?? "fetch failed" } as T;
  }
}

function TierBadge({ tier }: { tier: "T1" | "T2" | "T3" }) {
  const color =
    tier === "T1" ? "bg-red-600/70 text-red-100" :
    tier === "T2" ? "bg-amber-600/70 text-amber-100" :
                    "bg-sky-700/70 text-sky-100";
  return <span className={`px-2 py-1 rounded text-xs ${color}`}>{tier}</span>;
}

export default async function Page() {
  const [macro, sent] = await Promise.all([
    safeGet<MacroResp>("/api/macro", { items: [], stale: true }),
    safeGet<SentResp>("/api/sentiment-snapshot", {
      vix: null, putCall: null, aaii: null, fearGreed: null, stale: true, sources: [], updated: new Date().toISOString(),
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Morning Update</h1>
      <p className="text-xs text-neutral-400 -mt-3">All times UK</p>

      {/* Major US data today */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="font-semibold">Major US data today</h2>
          <div className="space-x-2 text-[11px]">
            <span className="rounded bg-red-800/60 px-2 py-0.5">Tier 1</span>
            <span className="rounded bg-amber-800/60 px-2 py-0.5">Tier 2</span>
            <span className="rounded bg-sky-800/60 px-2 py-0.5">Tier 3</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-300">
              <tr className="bg-neutral-900/60">
                <th className="px-4 py-2 text-left">Time</th>
                <th className="px-4 py-2 text-left">Country</th>
                <th className="px-4 py-2 text-left">Release</th>
                <th className="px-4 py-2 text-left">Actual</th>
                <th className="px-4 py-2 text-left">Previous</th>
                <th className="px-4 py-2 text-left">Consensus</th>
                <th className="px-4 py-2 text-left">Forecast</th>
                <th className="px-4 py-2 text-left">Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {macro.items?.length ? (
                macro.items.map((r, i) => (
                  <tr key={i} className="hover:bg-neutral-900/40">
                    <td className="px-4 py-2">{r.timeUK}</td>
                    <td className="px-4 py-2">{r.country}</td>
                    <td className="px-4 py-2">{r.release}</td>
                    <td className="px-4 py-2">{r.actual}</td>
                    <td className="px-4 py-2">{r.previous}</td>
                    <td className="px-4 py-2">{r.consensus}</td>
                    <td className="px-4 py-2">{r.forecast}</td>
                    <td className="px-4 py-2"><TierBadge tier={r.tier} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-6 text-neutral-400" colSpan={8}>
                    No items for today (or the source returned none).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {macro.stale && (
          <p className="px-4 pb-3 text-xs text-amber-400">
            Using cached/fallback data{macro.error ? ` — ${macro.error}` : ""}{macro.source ? ` (source: ${macro.source})` : ""}.
          </p>
        )}
      </section>

      {/* Sentiment */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/50">
        <div className="px-4 py-3">
          <h2 className="font-semibold">Sentiment</h2>
          <p className="text-xs text-neutral-400">Live VIX & Put/Call; AAII and Fear &amp; Greed use fallbacks.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">VIX</div>
            <div className="mt-1 text-2xl font-semibold">{sent.vix ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Put/Call (total)</div>
            <div className="mt-1 text-2xl font-semibold">{sent.putCall ?? "—"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">AAII Bulls / Bears</div>
            <div className="mt-1 text-lg">{sent.aaii ? `${sent.aaii.bullsPct ?? "—"}% / ${sent.aaii.bearsPct ?? "—"}%` : "—"}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <div className="text-xs text-neutral-400">Fear &amp; Greed</div>
            <div className="mt-1 text-lg">{sent.fearGreed ?? "—"}</div>
          </div>
        </div>
        <div className="px-4 pb-3 text-xs text-neutral-500">
          Sources: {sent.sources.join(", ") || "—"} • Updated {new Date(sent.updated).toLocaleTimeString("en-GB")}
        </div>
      </section>
    </main>
  );
}
