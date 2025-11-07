export const dynamic = "force-dynamic";
export async function GET(){
  return Response.json({"items": [{"timeUK": "12:00", "symbol": "KKR", "name": "KKR & Co.", "session": "BMO", "mcap": "$95B"}, {"timeUK": "12:00", "symbol": "DUK", "name": "Duke Energy", "session": "BMO", "mcap": "$72B"}, {"timeUK": "12:00", "symbol": "MKTX", "name": "MarketAxess", "session": "BMO", "mcap": "$14B"}], "stale": false});
}
