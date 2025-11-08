export const dynamic = "force-dynamic";

function toSummary(s: string, maxSentences = 8) {
  if (!s) return "";
  // crude sentence splitter; keeps first ~5–10 sentences
  const parts = s.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).slice(0, maxSentences);
  return parts.join(" ");
}

export async function GET() {
  const key = process.env.FMP_API_KEY!;
  const url = `https://financialmodelingprep.com/api/v3/stock_news?limit=20&apikey=${key}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    const raw = await r.json();

    // Pick 3 broad-market items (Reuters/Bloomberg/WSJ-like sources often appear in feed)
    const items = (raw ?? [])
      .filter((n: any) => /reuters|bloomberg|wsj|marketwatch|yahoo/i.test(n?.site || n?.source || ""))
      .slice(0, 3)
      .map((n: any) => ({
        title: n?.title ?? "Story",
        source: n?.site || n?.source || "News",
        summary: toSummary(n?.text || n?.content || n?.description || n?.title || "")
      }));

    return Response.json({ items, stale: false });
  } catch {
    return Response.json({ items: [], stale: true });
  }
}
