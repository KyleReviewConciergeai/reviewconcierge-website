// app/api/businesses/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

type CreateBusinessBody = {
  business_name?: string;
  google_place_id?: string;
};

export async function GET() {
  try {
    const supabase = supabaseServer();

    const { data, error } = await supabase
      .from("businesses")
      .select("id, business_name, google_place_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, businesses: data ?? [] }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServer();

    const body = (await req.json()) as CreateBusinessBody;
    const business_name = body.business_name?.trim();
    const google_place_id = body.google_place_id?.trim() || null;

    if (!business_name) {
      return NextResponse.json(
        { ok: false, error: "business_name is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("businesses")
      .insert([{ business_name, google_place_id }])
      .select("id, business_name, google_place_id, created_at")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, business: data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
