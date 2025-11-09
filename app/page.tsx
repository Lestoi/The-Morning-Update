// app/page.tsx
import React from "react";

type Snapshot = {
  vix: number | null;
  putCall: number | null;
  aaii: { bull: number | null; bear: number | null } | null;
  fearGreed: number | null;
  stale: boolean;
  sources: string[];
  updated: string;
  error?: string;
};

async function getSnapshot(): Promise<Snapshot> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/sentiment-snapshot`, {
    cache: "no-store",
  }).catch(() => null);

  // Fallback if NEXT_PUBLIC_BASE_URL not set (works locally and on Vercel)
  if (!r || !r.ok) {
    const rel = await fetch("/api/sentiment-snapshot", { cache: "no-store" }).catch(() => null);
    if (!rel || !rel.ok) {
      return {
        vix: null,
        putCall: null,
        aaii: null,
        fearGreed: null,
        stale: true,
        sources: [],
        updated: new Date().toISOString(),
        error: "Failed to load sentiment snapshot.",
      };
    }
    return (await rel.json()) as Snapshot;
  }
  return (await r.json()) as Snapshot;
}

// --- simple colour rules ---
function pcColor(v: number | null) {
  if (v == null) return "text-zinc-400";
  if (v < 0.9) return "text-emerald-400"; // risk-on
  if (v > 1.1) return "text-red-400"; // hedging/risk-off
  return "text-zinc-300";
}

function vixColor(v: number | null) {
  if (v == null) return "text-zinc-400";
  if (v < 15) return "text-emerald-400";
  if (v > 25) return "text-red-400";
  return "text-zinc-300";
}

function spreadColor(bull: number | null, bear: number | null) {
  if (bull == null || bear == null) return "text-zinc-400";
  const spread = bull - bear;
  if (spread > 0) return "text-emerald-400";
  if (spread < 0) return "text-red-400";
  return "text-zinc-300";
}

export default async function Page() {
  const snap = await getSnapshot();

  const bull = snap.aaii?.bull ?? null;
  const bear = snap.aaii?.bear ?? null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Morning Update</h1>
      <p className="mt-1 text-sm text-zinc-400">All times UK</p>

      {/* Sentiment */}
      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-zinc-200">Sentiment</h2>
        <p className="text-xs text-zinc-500">Live VIX &amp; Put/Call; AAII via CSV. Last updated: {new Date(snap.updated).toLocaleTimeString()}</p>

        {snap.error ? (
          <p className="mt-3 text-xs text-amber-400">Note: {snap.error}</p>
        ) : null}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* VIX */}
          <div className="rounded-md border border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-400">VIX</div>
            <div className={`mt-2 text-2xl font-semibold ${vixColor(snap.vix)}`}>
              {snap.vix != null ? snap.vix.toFixed(2) : "—"}
            </div>
          </div>

          {/* Put/Call */}
          <div className="rounded-md border border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-400">Put/Call (total)</div>
            <div className={`mt-2 text-2xl font-semibold ${pcColor(snap.putCall)}`}>
              {snap.putCall != null ? snap.putCall.toFixed(2) : "—"}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500">{"< 1 = risk-on,  > 1 = hedging/risk-off"}</div>
          </div>

          {/* AAII */}
          <div className="rounded-md border border-zinc-800 p-4">
            <div className="text-xs uppercase tracking-wide text-zinc-400">AAII Bulls / Bears</div>
            <div className={`mt-2 text-2xl font-semibold ${spreadColor(bull, bear)}`}>
              {bull != null ? bull.toFixed(1) : "—"}{" "}
              <span className="text-zinc-500">/</span>{" "}
              {bear != null ? bear.toFixed(1) : "—"}
            </div>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-zinc-500">
          Sources: {snap.sources.length ? snap.sources.join(", ") : "—"}
        </div>
      </section>

      {/* Earnings (existing table – unchanged; your other API routes feed this) */}
      <section className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="text-lg font-medium text-zinc-200">Yesterday’s notable earnings (US)</h2>
        <p className="text-xs text-zinc-500">Top results by market cap; EPS actual vs estimate with beat/miss.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-zinc-400">
                <th className="py-2 pr-4 font-medium">Time</th>
                <th className="py-2 pr-4 font-medium">Symbol</th>
                <th className="py-2 pr-4 font-medium">Company</th>
                <th className="py-2 pr-4 font-medium">EPS (Actual / Est.)</th>
                <th className="py-2 pr-4 font-medium">Surprise</th>
                <th className="py-2 pr-4 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {/* This is just a placeholder row to keep the skeleton; your earnings API populates in your existing code */}
              <tr className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2 pr-4">TBD</td>
                <td className="py-2 pr-4">NCA</td>
                <td className="py-2 pr-4">Nuveen California Municipal Value Fund Inc</td>
                <td className="py-2 pr-4">— / —</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">—</td>
              </tr>
              <tr className="border-t border-zinc-800 text-zinc-300">
                <td className="py-2 pr-4">TBD</td>
                <td className="py-2 pr-4">ZNOG</td>
                <td className="py-2 pr-4">Zion Oil &amp; Gas Inc</td>
                <td className="py-2 pr-4">— / —</td>
                <td className="py-2 pr-4">—</td>
                <td className="py-2 pr-4">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
