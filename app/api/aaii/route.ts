export const dynamic = "force-dynamic";

/**
 * AAII weekly sentiment (Bulls/Bears %).
 * Strategy:
 *  1) Try AAII CSV (primary).
 *  2) Fallback: scrape AAII survey page for "Bullish xx.x%" and "Bearish xx.x%".
 * Returns { bulls, bears, asOf, source, stale } and NEVER throws.
 */

type AaiiResult = {
  bulls: number | null;
  bears: number | null;
  asOf?: string | null;
  source?: string;
  stale?: boolean;
};

function toPct(s: string): number | null {
  const n = Number(String(s).replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function parseCsv(text: string): AaiiResult | null {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;

  // find last valid row (>= 3 numeric entries after date)
  for (let i = lines.length - 1; i > 0; i--) {
    const row = lines[i].split(/,|;|\t/).map(s => s.trim());
    const date = row[0] || null;
    const nums = row.slice(1).map(toPct).filter((x): x is number => x != null);

    // usually [Bulls, Neutral, Bears]
    if (nums.length >= 3) {
      const bulls = nums[0];
      const bears = nums[2];
      if (bulls != null && bears != null) {
        return { bulls, bears, asOf: date, source: "csv", stale: false };
      }
    }
  }
  return null;
}

async function tryCsv(url: string): Promise<AaiiResult> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("bad status");
  const text = await r.text();
  const out = parseCsv(text);
  if (!out) throw new Error("no values");
  return out;
}

/** Fallback: scrape HTML for "Bullish xx.x%" and "Bearish xx.x%" */
async function tryHtml(url: string): Promise<AaiiResult> {
  const r = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error("bad status");
  const html = await r.text();

  const bullMatch = html.match(/Bullish[^0-9]{0,20}(\d{1,2}\.?\d?)%/i);
  const bearMatch = html.match(/Bearish[^0-9]{0,20}(\d{1,2}\.?\d?)%/i);

  const bulls = bullMatch ? toPct(bullMatch[1]) : null;
  const bears = bearMatch ? toPct(bearMatch[1]) : null;
  if (bulls == null || bears == null) throw new Error("not found");

  const dateMatch = html.match(/Week\s*Ending[^A-Za-z0-9]{0,10}([A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})/i);
  const asOf = dateMatch ? dateMatch[1] : null;

  return { bulls, bears, asOf, source: "html", stale: false };
}

export async function GET() {
  const csvCandidates = [
    "https://www.aaii.com/files/surveys/sentiment.csv",
    "https://aaii.com/files/surveys/sentiment.csv",
    "https://www.aaii.com/files/surveys/sentiment.csv?nocache=1",
  ];
  for (const u of csvCandidates) {
    try {
      const out = await tryCsv(u);
      return Response.json(out);
    } catch {}
  }

  const htmlCandidates = [
    "https://www.aaii.com/sentimentsurvey",
    "https://www.aaii.com/sentimentsurvey/sent_results",
  ];
  for (const u of htmlCandidates) {
    try {
      const out = await tryHtml(u);
      return Response.json(out);
    } catch {}
  }

  const miss: AaiiResult = { bulls: null, bears: null, asOf: null, stale: true };
  return Response.json(miss);
}
