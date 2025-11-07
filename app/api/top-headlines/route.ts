export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    items: [
      { title: "Markets poised for US jobs data", source: "Reuters",
        summary: "Futures steady ahead of NFP; rate-path odds and USD likely to drive ES/NQ on the print and revisions." },
      { title: "Mega-cap tech stabilises after selloff", source: "Bloomberg",
        summary: "NVDA/AAPL bounce attempts; breadth mixed. Traders watching yields and USD for follow-through." },
      { title: "Oil slips on supply backdrop", source: "WSJ",
        summary: "Crude eases after inventory build; energy drag offsets some cyclical strength into NY open." }
    ],
    stale: false
  });
}
