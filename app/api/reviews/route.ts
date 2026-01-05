export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

/**
 * Doctrine-aligned reviews list API
 * - Returns the guest reviews exactly as stored (no workflow/status semantics)
 * - Minimal, calm errors
 * - Org-safe + business-safe queries
 * - Stable ordering (newest first), with sane fallback if review_date is null
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    // Current org's most recent business (dashboard onboarding depends on this)
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

    // No business yet → normal state (onboarding)
    if (!biz?.id) {
      return NextResponse.json({ ok: true, business: null, count: 0, reviews: [] }, { status: 200 });
    }

    // Reviews for this business + org
    // Order:
    // - review_date desc (most meaningful)
    // - created_at desc as a fallback when review_date is null/duplicate
    const { data: reviews, error: revErr } = await supabase
      .from("reviews")
      .select(
        "id, source, google_review_id, rating, author_name, author_url, review_text, review_date, detected_language, created_at"
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Server error loading reviews." }, { status: 500 });
  }
}
