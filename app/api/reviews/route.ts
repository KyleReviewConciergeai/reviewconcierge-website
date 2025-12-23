export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

export async function GET(req: Request) {
  const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    // Get the current org's most recent business
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, business_name, google_place_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bizErr) {
      return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });
    }

    // If no business yet, return ok with null business (dashboard should show onboarding)
    if (!biz?.id) {
      return NextResponse.json({ ok: true, business: null, count: 0, reviews: [] }, { status: 200 });
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
      return NextResponse.json({ ok: false, error: revErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { ok: true, business: biz, count: reviews?.length ?? 0, reviews: reviews ?? [] },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
