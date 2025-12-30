export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{
      author_name?: string;
      author_url?: string;
      language?: string;
      rating?: number;
      text?: string;
      time?: number; // unix seconds
    }>;
  };
};

type ReviewUpsertRow = {
  organization_id: string;
  business_id: string;
  source: "google";
  google_review_id: string;

  author_name: string | null;
  author_url: string | null;
  rating: number | null;
  review_text: string | null;
  review_date: string | null;
  detected_language: string | null;
  raw: unknown;
};

function makeGoogleReviewId(r: {
  author_name?: string;
  time?: number;
  rating?: number;
  text?: string;
}) {
  // NOTE: Using Google "time" alone is okay for MVP but can collide in rare cases.
  // We preserve your approach but make the fallback deterministic.
  const fallbackId = `${r.author_name ?? "unknown"}-${r.time ?? ""}-${r.rating ?? ""}-${r.text ?? ""}`;
  return String(r.time ?? fallbackId).slice(0, 255);
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Optional override (debugging)
    const google_place_id_param = searchParams.get("google_place_id")?.trim() || "";

    const { supabase, organizationId } = await requireOrgContext();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY" }, { status: 500 });
    }

    // 1) Resolve google_place_id
    let placeId = google_place_id_param;

    if (!placeId) {
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, google_place_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bizErr) return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });

      if (!biz?.google_place_id) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "No google_place_id found for your organization. Create/connect a business first (via /api/businesses) and ensure it’s linked to your org.",
          },
          { status: 400 }
        );
      }

      placeId = biz.google_place_id;
    }

    // 2) Find the business row for this org + placeId
    const { data: business, error: businessErr } = await supabase
      .from("businesses")
      .select("id, google_place_id")
      .eq("organization_id", organizationId)
      .eq("google_place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (businessErr) return NextResponse.json({ ok: false, error: businessErr.message }, { status: 500 });

    if (!business?.id || !business?.google_place_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No matching business found for this org + google_place_id. Ensure your business is created and linked to your organization.",
        },
        { status: 404 }
      );
    }

    const businessId = business.id as string;

    // 3) Fetch Google details (reviews sample + authoritative summary metrics)
    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total,reviews` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as GooglePlaceDetailsResponse;

    if (data.status !== "OK") {
      return NextResponse.json(
        { ok: false, googleStatus: data.status, googleError: data.error_message },
        { status: 500 }
      );
    }

    const googleRating = typeof data.result?.rating === "number" ? data.result.rating : null;
    const googleTotal = typeof data.result?.user_ratings_total === "number" ? data.result.user_ratings_total : null;
    const googleName = typeof data.result?.name === "string" ? data.result.name : null;

    // 3a) Update the business row with authoritative stats (long-term credibility)
    // NOTE: Requires businesses.google_rating + businesses.google_user_ratings_total columns.
    const { error: bizUpdateErr } = await supabase
      .from("businesses")
      .update({
        google_rating: googleRating,
        google_user_ratings_total: googleTotal,
        google_place_name: googleName,
      })
      .eq("id", businessId)
      .eq("organization_id", organizationId);

    if (bizUpdateErr) {
      return NextResponse.json({ ok: false, error: bizUpdateErr.message }, { status: 500 });
    }

    const googleReviews = Array.isArray(data.result?.reviews) ? data.result!.reviews! : [];

    if (googleReviews.length === 0) {
      return NextResponse.json({
        ok: true,
        business_id: businessId,
        google_place_id: placeId,
        google_rating: googleRating,
        google_user_ratings_total: googleTotal,
        fetched: 0,
        upserted_total: 0,
        inserted: 0,
        updated: 0,
        synced_at: new Date().toISOString(),
        note: "No reviews returned by Google for this place (this endpoint returns a sample).",
      });
    }

    // 4) Map → upsert into schema
    const rows: ReviewUpsertRow[] = googleReviews.map((r) => ({
      organization_id: organizationId,
      business_id: businessId,
      source: "google",
      google_review_id: makeGoogleReviewId(r),

      author_name: r.author_name ?? null,
      author_url: r.author_url ?? null,
      rating: typeof r.rating === "number" ? r.rating : null,
      review_text: r.text ?? null,
      review_date: r.time ? new Date(r.time * 1000).toISOString() : null,
      detected_language: r.language ?? null,
      raw: r,
    }));

    // 4a) Pre-check which IDs already exist for this business/org/source
    const ids = rows.map((x) => x.google_review_id);

    const { data: existing, error: existingErr } = await supabase
      .from("reviews")
      .select("google_review_id")
      .eq("organization_id", organizationId)
      .eq("business_id", businessId)
      .eq("source", "google")
      .in("google_review_id", ids);

    if (existingErr) return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });

    const existingSet = new Set((existing ?? []).map((r) => r.google_review_id));

    // 4b) Upsert
    const { data: savedPreview, error: saveErr } = await supabase
      .from("reviews")
      .upsert(rows, { onConflict: "organization_id,source,google_review_id" })
      .select("id, source, google_review_id, rating, author_name, review_date, detected_language")
      .limit(10);

    if (saveErr) return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });

    const inserted = rows.reduce((acc, r) => acc + (existingSet.has(r.google_review_id) ? 0 : 1), 0);
    const updated = rows.length - inserted;

    return NextResponse.json({
      ok: true,
      business_id: businessId,
      google_place_id: placeId,
      google_rating: googleRating,
      google_user_ratings_total: googleTotal,
      fetched: rows.length,
      upserted_total: rows.length,
      inserted,
      updated,
      synced_at: new Date().toISOString(),
      savedPreview: savedPreview ?? [],
      note: "Reviews returned here are a Google sample; summary metrics are authoritative.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
