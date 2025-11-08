export const dynamic = "force-dynamic";

/**
 * AAII Sentiment (weekly). Tries a few public CSV mirrors that historically exist:
 * Expected columns: Date, Bullish, Neutral, Bearish (as %, with or without '%').
 * Returns the latest Bulls/Bears in % (numbers), plus the date.
 */
async function fetchAAII(): Promise<{ bulls: number | null; bears: number | null; asOf?: string }> {
  const candidates = [
    "https://www.aaii.com/files/surveys/sentiment.csv",
    "https://aaii.com/files/surveys/sentiment.csv",
    // Some mirrors occasionally used by data sites (kept here as fallbacks)
    "https://www.aaii.com/files/surveys/sentiment.csv?nocache=1",
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
      if (!r.ok) continue;
      const csv = await r.text();
      const lines = csv.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) continue;

      // Find last valid numeric row (skip any footers)
      for (let i = lines.length - 1; i > 0; i--) {
        const row = lines[i].split(/,|;|\t/).map(s => s.trim());
        if (row.length < 3) continue;
        const date = row[0];
        // Columns positions vary historically; search for numbers in the row
        const nums = row
          .slice(1)
          .map(s => Number(String(s).replace(/[^\d.\-]/g, "")))
          .filter(n => isFinite(n));
        // We want Bulls and Bears — usually in positions 0 and 2 after the date
        if (nums.length >= 3) {
          const bulls = nums[0];
          const bears = nums[2];
          if (isFinite(bulls) && isFinite(bears)) {
            return {
              bulls: Math.round(bulls * 10) / 10,
              bears: Math.round(bears * 10) / 10,
              asOf: date,
            };
          }
        }
      }
    } catch {
      // Try next candidate
    }
  }
  return { bulls: null, bears: null };
}

export async function GET() {
  const data = await fetchAAII();
  return Response.json({ ...data, stale: data.bulls == null || data.bears == null });
}
