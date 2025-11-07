export const dynamic = "force-dynamic";
export async function GET(){
  return Response.json({"items": [{"title": "All eyes on NFP at 13:30 UK — bonds, USD, and index futures poised", "source": "Reuters", "url": "https://www.reuters.com"}, {"title": "Tech tries to stabilize after week of selling; focus on mega‑cap moves", "source": "Bloomberg", "url": "https://www.bloomberg.com"}, {"title": "Earnings drip (KKR/DUK/MKTX) may sway single‑name flows", "source": "WSJ", "url": "https://www.wsj.com"}], "stale": false});
}
