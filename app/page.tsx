// /app/page.tsx
import React from 'react';

type MacroRow = {
  time: string;
  country: string;
  release: string;
  actual?: string | number | null;
  previous?: string | number | null;
  consensus?: string | number | null;
  forecast?: string | number | null;
  tier?: 'T1' | 'T2' | 'T3';
};

async function getMacro(): Promise<{ items: MacroRow[]; stale: boolean; source: string; error?: string }> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/api/macro`, { cache: 'no-store' });
  // In Vercel/production you can just fetch('/api/macro') from a Server Component as well:
  // const res = await fetch('/api/macro', { cache: 'no-store' });
  if (!res.ok) return { items: [], stale: true, source: 'macro', error: `HTTP ${res.status}` };
  return res.json();
}

function classForSurprise(actual?: number | null, consensus?: number | null) {
  if (actual == null || consensus == null) return '';
  if (actual > consensus) return 'text-emerald-400';
  if (actual < consensus) return 'text-rose-400';
  return '';
}

function asNum(x: any): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(String(x).replace(/[,%]/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function TierChip({ tier }: { tier?: 'T1' | 'T2' | 'T3' }) {
  const map: Record<'T1'|'T2'|'T3', string> = {
    T1: 'bg-rose-600/30 text-rose-200 border border-rose-600/40',
    T2: 'bg-amber-600/30 text-amber-200 border border-amber-600/40',
    T3: 'bg-sky-600/30 text-sky-200 border border-sky-600/40',
  };
  const label = tier ?? 'T3';
  return <span className={`px-2 py-0.5 rounded text-xs ${map[label]}`}>{label}</span>;
}

export default async function Page() {
  const macro = await getMacro();

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Morning Update</h1>
      <p className="text-sm opacity-70 mb-6">All times UK</p>

      {/* Macro table */}
      <section className="mb-8">
        <div className="rounded-xl bg-zinc-900/50 border border-zinc-800">
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <div className="font-medium">Major US data today</div>
            <div className="flex gap-2 text-xs">
              <TierChip tier="T1" />
              <TierChip tier="T2" />
              <TierChip tier="T3" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-zinc-400">
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-4 py-2">Time</th>
                  <th className="text-left px-4 py-2">Country</th>
                  <th className="text-left px-4 py-2">Release</th>
                  <th className="text-right px-4 py-2">Actual</th>
                  <th className="text-right px-4 py-2">Previous</th>
                  <th className="text-right px-4 py-2">Consensus</th>
                  <th className="text-right px-4 py-2">Forecast</th>
                  <th className="text-right px-4 py-2">Tier</th>
                </tr>
              </thead>
              <tbody>
                {macro.items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-zinc-500">
                      No items for today (or the source returned none).
                    </td>
                  </tr>
                ) : (
                  macro.items.map((r, i) => {
                    const a = asNum(r.actual);
                    const c = asNum(r.consensus);
                    const color = classForSurprise(a, c);
                    return (
                      <tr key={i} className="border-b border-zinc-900">
                        <td className="px-4 py-2">{r.time || '—'}</td>
                        <td className="px-4 py-2">{r.country || 'US'}</td>
                        <td className="px-4 py-2">{r.release}</td>
                        <td className={`px-4 py-2 text-right ${color}`}>{r.actual ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.previous ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.consensus ?? '—'}</td>
                        <td className="px-4 py-2 text-right">{r.forecast ?? '—'}</td>
                        <td className="px-4 py-2 text-right"><TierChip tier={r.tier} /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {macro.error && (
            <div className="px-4 py-2 text-xs text-amber-300/80 bg-amber-900/10 border-t border-amber-800/40">
              Using cached/fallback data — {macro.error}
            </div>
          )}
        </div>
      </section>

      {/* Sentiment + options sections you already have can remain below… */}
    </main>
  );
}
