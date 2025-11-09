// app/api/macro/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Temporary macro route (FRED-backed placeholder)
 * Goal: remove FMP dependency and stop 401s.
 * Returns an empty calendar with a clear "FRED" source tag.
 * You can swap this for a real calendar provider later.
 */
export async function GET() {
  try {
    // If you want to prove envs are present, uncomment the next line:
    // console.log("FRED_API_KEY present?", !!process.env.FRED_API_KEY);

    // For now we return an empty list so the UI renders without errors.
    // (We’ll wire a real calendar feed next.)
    const payload = {
      items: [],            // no events yet
      stale: false,         // not a fallback/error
      source: "FRED"        // tag so you can see it switched off FMP
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      {
        items: [],
        stale: true,
        source: "FRED",
        error: err?.message ?? "Unknown error",
      },
      { status: 200 }
    );
  }
}
