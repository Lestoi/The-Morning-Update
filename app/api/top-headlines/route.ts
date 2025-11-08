export const dynamic = "force-dynamic";

/**
 * Top market stories (US focus) via FMP free endpoint
 * https://financialmodelingprep.com/api/v3/stock_news?limit=50&apikey=KEY
 *
 * Output:
 * {
 *   items: Array<{ title, source, published, summary }>,
 *   stale: boolean,
 *   source: "FMP"
 * }
 */

type FmpNews = {
  title?: string;
  text?: string;
  site?: string;
  publishedDate?: string;
};

type OutNews = {
  title: string;
  source: string;
  published: string;
  summary: string;
};

// --- utilities ---
function squeeze(s = "") {
  return s.replace(/\s+/g, " ").replace(/^\s*[-–]\s*/, "").trim();
}

function toSentences(s: string) {
  // Split on sentence boundaries and keep things like quotes / ) attached
  return s
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(“"'])/)
    .map(x => squeeze(x))
    .filter(Boolean);
}

function pickLongSummary(text: string, maxSentences = 10, maxChars = 1200) {
  const base = squeeze(text)
    // common wire cleanups
    .replace(/\(Reuters\)\s*-/i, "")
    .replace(/^\s*\(\w+\)\s*-\s*/i, "");

  const sentences = toSentences(base);
  if (sentences.length === 0) return base.slice(0, maxChars);

  const chosen: string[] = [];
  let count = 0;

  for (const s of sentences) {
    if (chosen.length >= maxSentences) break;
    if (count + s.length > maxChars) break;
    chosen.push(s);
    count += s.length + 1;
  }

  return chosen.join(" ");
}

function isMostlyUS(headline: string) {
  const t = headline.toLowerCase();
  // keep broad market / US corp themes; filter obvious region-specific noise
  if (/nifty|sensex|nikkei|kospi|tsx|asx|bse|jse|taiex|ibovespa/i.test(t)) return false;
  return true;
}

export async function GET() {
  const apiKey = process.env.FMP_API_KEY || "demo";
  const url = `https://financialmodelingprep.com/api/v3/stock_news?limit=60&apikey=${apiKey}`;

  try {
    const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`FMP news HTTP ${res.status}`);
    const data = (await res.json()) as FmpNews[];

    const seen = new Set<string>();
    const items: OutNews[] = [];
    const now = Date.now();

    for (const n of data) {
      const title = squeeze(n.title || "");
      if (!title || seen.has(title) || !isMostlyUS(title)) continue;

      const source = squeeze(n.site || "Unknown");
      const published = n.publishedDate ? new Date(n.publishedDate).toISOString() : new Date().toISOString();

      // Prefer story body; fall back to title if needed
      const body = squeeze(n.text || title);

      // 5–10 sentences target, ~1,200 chars cap
      const summary = pickLongSummary(body, 10, 1200);

      items.push({ title, source, published, summary });
      seen.add(title);

      if (items.length >= 10) break; // keep it concise-meaningful
    }

    // Sort newest first (in case API isn’t strictly ordered)
    items.sort((a, b) => +new Date(b.published) - +new Date(a.published));

    return Response.json({ items, stale: false, source: "FMP" });
  } catch (e) {
    return Response.json({
      items: [],
      stale: true,
      source: "FMP",
      error: (e as Error)?.message ?? "Unknown error",
    });
  }
}
