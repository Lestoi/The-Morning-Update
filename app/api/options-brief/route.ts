export const dynamic = "force-dynamic";
export async function GET(){
  return Response.json({"es": {"oiCalls": 1320000, "oiPuts": 1540000}, "nq": {"oiCalls": 720000, "oiPuts": 860000}, "pcrTotal": 0.88, "comment": "OI skew to puts; watch post‑NFP IV crush", "stale": false});
}
