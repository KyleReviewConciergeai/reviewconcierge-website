export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  // Health endpoints should never be cached
  return NextResponse.json(
    {
      ok: true,
      service: "reviewconcierge",
      env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      now: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
}
