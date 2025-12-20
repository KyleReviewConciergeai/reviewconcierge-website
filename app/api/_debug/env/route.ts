export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function GET() {
  const present = {
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    VERCEL_ENV: process.env.VERCEL_ENV || null,
    NODE_ENV: process.env.NODE_ENV || null,
  };

  return NextResponse.json({ ok: true, present });
}
