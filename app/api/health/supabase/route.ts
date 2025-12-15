import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, where: "supabase", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, sample: data ?? [] }, { status: 200 });
}
