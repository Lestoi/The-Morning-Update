export const dynamic = "force-dynamic";
export async function GET(){
  return Response.json({"items": [{"timeUK": "13:30", "title": "Employment Situation (NFP, UER, AHE)", "tier": 1, "source": "BLS"}, {"timeUK": "15:00", "title": "Univ. of Michigan Consumer Sentiment (prelim)", "tier": 2, "source": "U‑Mich"}, {"timeUK": "18:00", "title": "Baker Hughes rig count", "tier": 3, "source": "Baker Hughes"}], "stale": false});
}
