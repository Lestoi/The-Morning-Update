export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    items: [
      {
        title: "Markets poised for US jobs data",
        source: "Reuters",
        summary:
`Futures are flat to slightly higher as traders position for the Nonfarm Payrolls report at 13:30 UK. 
Rates expectations have drifted modestly in recent sessions and the USD has held firm, which matters for NQ in particular. 
A payrolls beat with stable unemployment would typically lift yields and the dollar, which can cap multiple-expansion in mega-cap tech. 
However, a beat that comes with softer wage growth could be read as “goldilocks,” opening a window for ES to grind up on lower terminal-rate odds. 
Revisions often drive the second move: big upward revisions can flip an initially positive tape. 
Liquidity is thin in the first 2–5 minutes after the print; slippage usually narrows by minute 6–10. 
Traders will watch breadth and equal-weight indices to gauge follow-through beyond the first headline reaction.`
      },
      {
        title: "Mega-cap tech stabilises after selloff",
        source: "Bloomberg",
        summary:
`After several sessions of de-risking, mega-caps are attempting a stabilisation. 
Dealer gamma exposure around popular strikes may dampen intraday swings unless the macro surprise is large. 
Semis and AI-linked names remain sensitive to yield moves; a quick push higher in 10-year yields can suppress NQ outperformance. 
If the jobs data reduces rate-volatility, systematic buying (e.g., vol-targeting funds) tends to re-engage over the next few sessions. 
Watch for leadership rotation: if defensives outperform on a green tape, that often signals a fading move rather than a trend day. 
Breadth thrusts above recent 10-day averages would improve the tactical backdrop into next week.`
      },
      {
        title: "Oil slips on supply backdrop",
        source: "WSJ",
        summary:
`Crude is easing after inventory builds and steady supply guidance. 
Lower oil tends to support consumer and transport groups while trimming energy index weight’s contribution to ES. 
For macro today, a drop in crude reduces inflation-worry chatter at the margin, which can help duration-sensitive tech. 
NQ often reacts positively to lower real yields that accompany softer oil, but follow-through depends on the USD path. 
Watch refined product cracks; weakness there can compound the “disinflation” narrative that equities like. 
If crude reverses higher on a geopolitical headline, that would likely pressure NQ first and add to intraday chop.`
      }
    ],
    stale: false
  });
}
