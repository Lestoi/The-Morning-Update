// app/api/sentiment-snapshot/route.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

export const runtime = "edge";
export const revalidate = 120; // cache at the edge for ~2 minutes
export const dynamic = "force-dynamic";

type AAIISnapshot = { bull: number; bear: number };

type Snapshot = {
  vix: number | null;
  putCall: number | null;
  aaii: AAIISnapshot | null;
  fearGreed: null; // placeholder for future
  stale: boolean;
  sources: string[];
  updated: string;
};

const SOURCES = {
  STOOQ_VIX: "Stooq (^VIX daily CSV)",
  CBOE_PCR: "CBOE total put/call CSV",
  AAII: process.env.AAII_CSV_URL ? "AAII (public CSV)" : "AAII (not configured)",
};

// --- Helpers ---------------------------------------------------------------

async function fetchText(url: string) {
  const r = await fetch(url, { next: { revalidate: 120 } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.text();
}

function parseCSV(text: string): string[][] {
  // Small CSV splitter that copes with quotes
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur.trim().replace(/^"|"$/g, "").replace(/""/g, `"`));
    cur = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === `"`){
      if (inQuotes && text[i + 1] === `"`) {
        // Escaped quote
        cur += `"`;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      pushCell();
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (cur.length || row.length) pushCell();
      if (row.length) rows.push(row), (row = []);
      continue;
    }

    cur += ch;
  }
  if (cur.length || row.length) {
    pushCell();
    rows.push(row);
  }
  // remove empty lines
  return rows.filter((r) => r.some((c) => c !== ""));
}

function toNumber(x: any): number | null {
  const n = Number(String(x).replace(/[^0-9.+-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// --- VIX (Stooq) ----------------------------------------------------------

async function getVIX(): Promise<number | null> {
  // Stooq daily CSV for ^VIX
  const url = "https://stooq.com/q/d/l/?s=^vix&i=d";
  const csv = await fetchText(url);
  const rows = parseCSV(csv);
  // Expect header: Date,Open,High,Low,Close,Volume
  const body = rows.slice(1).filter((r) => r.length >= 5);
  if (!body.length) return null;
  const last = body[body.length - 1];
  const close = last[4];
  return toNumber(close);
}

// --- CBOE total put/call ---------------------------------------------------

async function getPutCall(): Promise<number | null> {
  // Classic daily market stats CSV (contains TOTAL PUT/CALL RATIO line)
  const url = "https://www.cboe.com/publish/scheduledtask/mktstat/mktstatday.csv";
  const csv = await fetchText(url);
  const rows = parseCSV(csv);

  // Look for a row that includes 'TOTAL PUT/CALL RATIO'
  // Example row (columns vary by day):
  // 'TOTAL PUT/CALL RATIO',,,,'0.92'
  const lc = (s: string) => s.toLowerCase();
  for (const row of rows) {
    if (row.some((c) => lc(c).includes("total put/call ratio"))) {
      // pick the last numeric cell in row
      for (let i = row.length - 1; i >= 0; i--) {
        const n = toNumber(row[i]);
        if (n !== null) return n;
      }
    }
  }
  return null;
}

// --- AAII from public CSV --------------------------------------------------

async function getAAII(): Promise<AAIISnapshot | null> {
  const url = process.env.AAII_CSV_URL;
  if (!url) return null;

  try {
    const csv = await fetchText(url);
    const rows = parseCSV(csv);
    if (!rows.length) return null;

    // find header
    const header = rows[0].map((h) => h.toLowerCase());
    const body = rows.slice(1).filter((r) => r.length === header.length);

    // choose columns that include 'bull' and 'bear'
    const bullIdx = header.findIndex((h) => h.includes("bull"));
    const bearIdx = header.findIndex((h) => h.includes("bear"));

    if (bullIdx === -1 || bearIdx === -1 || !body.length) return null;

    // last non-empty row
    for (let i = body.length - 1; i >= 0; i--) {
      const r = body[i];
      const bull = toNumber(r[bullIdx]);
      const bear = toNumber(r[bearIdx]);
      if (bull !== null && bear !== null) return { bull, bear };
    }
    return null;
  } catch {
    return null;
  }
}

// --- Handler ---------------------------------------------------------------

export async function GET() {
  const sources: string[] = [];
  const nowISO = new Date().toISOString();

  let vix: number | null = null;
  let putCall: number | null = null;
  let aaii: AAIISnapshot | null = null;

  // VIX
  try {
    vix = await getVIX();
    sources.push(SOURCES.STOOQ_VIX);
  } catch {
    // ignore; leave null
  }

  // Put/Call
  try {
    putCall = await getPutCall();
    sources.push(SOURCES.CBOE_PCR);
  } catch {
    // ignore; leave null
  }

  // AAII
  try {
    aaii = await getAAII();
    if (process.env.AAII_CSV_URL) sources.push(SOURCES.AAII);
  } catch {
    // ignore; leave null
  }

  const stale = vix === null && putCall === null && aaii === null;

  const data: Snapshot = {
    vix,
    putCall,
    aaii,
    fearGreed: null, // reserved for future
    stale,
    sources,
    updated: nowISO,
  };

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
