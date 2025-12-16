import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
      const limitRaw = Number(
      new URL(req.url).searchParams.get("limit") ?? "50"
    );

    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 50;

  try {
    const supabase = supabaseServer();

    // Fetch latest business (same pattern as /api/reviews/google)
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, business_name")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bizErr || !biz?.id) {
      return NextResponse.json(
        { ok: false, error: bizErr?.message ?? "No business found" },
        { status: 500 }
      );
    }

    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select(
        "id, source, google_review_id, rating, author_name, author_url, review_text, review_date, detected_language, created_at"
      )
      .eq("business_id", biz.id)
      .order("review_date", { ascending: false })
      .limit(limit);

    if (revErr) {
      return NextResponse.json(
        { ok: false, error: revErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { ok: true, business: biz, count: reviews?.length ?? 0, reviews: reviews ?? [] },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
