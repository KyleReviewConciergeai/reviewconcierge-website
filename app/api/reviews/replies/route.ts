// app/api/reviews/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

/**
 * Reviews list API
 * - Org-safe + business-safe queries
 * - Stable ordering (newest first)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, business_name, google_place_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bizErr) {
      return NextResponse.json({ ok: false, error: "Failed to load business." }, { status: 500 });
    }

    if (!biz?.id) {
      return NextResponse.json(
        { ok: true, business: null, count: 0, reviews: [] },
        { status: 200 }
      );
    }

    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select(
        "id, business_id, source, google_review_id, rating, author_name, author_url, review_text, review_date, detected_language, created_at"
      )
      .eq("organization_id", organizationId)
      .eq("business_id", biz.id)
      .order("review_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(limit);

    if (revErr) {
      return NextResponse.json({ ok: false, error: "Failed to load reviews." }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        business: biz,
        count: reviews?.length ?? 0,
        reviews: reviews ?? [],
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Server error loading reviews." }, { status: 500 });
  }
}
