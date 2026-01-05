export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function jsonOk(payload: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}

function jsonFail(error: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function safeDetail(msg: unknown) {
  const s = String(msg ?? "");
  // keep it short to avoid dumping anything unexpected
  return s.length > 300 ? s.slice(0, 300) + "…" : s;
}

export async function GET() {
  const vercelEnv = process.env.VERCEL_ENV ?? null;
  const nodeEnv = process.env.NODE_ENV ?? null;

  try {
    // Server-side health check should not rely on browser anon client.
    // Uses service role so it can succeed even if RLS blocks anon.
    const sb = supabaseServer();

    // Small, predictable query against a known table.
    // You said you have `organizations (id, name)` — perfect for this.
    const { data, error } = await sb.from("organizations").select("id").limit(1);

    if (error) {
      return jsonFail("Supabase query failed", 500, {
        where: "supabase",
        vercelEnv,
        nodeEnv,
        detail: safeDetail(error.message),
        ts: new Date().toISOString(),
      });
    }

    return jsonOk(
      {
        where: "supabase",
        status: "ok",
        vercelEnv,
        nodeEnv,
        sampleCount: Array.isArray(data) ? data.length : 0,
        ts: new Date().toISOString(),
      },
      200
    );
  } catch (err: any) {
    console.error("[health/supabase] error", err?.message || String(err));
    return jsonFail("Supabase health check error", 500, {
      where: "supabase",
      vercelEnv,
      nodeEnv,
      detail: safeDetail(err?.message || err),
      ts: new Date().toISOString(),
    });
  }
}
