export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // OPTIONAL override (nice for debugging), but not required for normal use
    const google_place_id_param = searchParams.get("google_place_id")?.trim() || "";

    const { supabase, organizationId } = await requireOrgContext();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // 1) Resolve google_place_id
    let placeId = google_place_id_param;

    if (!placeId) {
      // Pull the most recent business for this org
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, google_place_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bizErr) {
        return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });
      }

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

    if (businessErr) {
      return NextResponse.json({ ok: false, error: businessErr.message }, { status: 500 });
    }

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

    // 3) Fetch Google reviews
    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=reviews` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as GooglePlaceDetailsResponse;

    if (data.status !== "OK") {
      return NextResponse.json(
        {
          ok: false,
          googleStatus: data.status,
          googleError: data.error_message,
        },
        { status: 500 }
      );
    }

    const reviews = Array.isArray(data.result?.reviews) ? data.result!.reviews! : [];

    if (reviews.length === 0) {
      return NextResponse.json({
        ok: true,
        fetched: 0,
        savedPreview: [],
        note: "No reviews returned by Google for this place",
      });
    }

    // 4) Map → upsert into your schema (and attach org)
    const rows = reviews.map((r) => {
      const fallbackId = `${r.author_name ?? "unknown"}-${r.time ?? ""}-${r.rating ?? ""}-${r.text ?? ""}`;

      return {
        organization_id: organizationId,
        business_id: businessId,
        source: "google",
        google_review_id: String(r.time ?? fallbackId).slice(0, 255),

        author_name: r.author_name ?? null,
        author_url: r.author_url ?? null,
        rating: typeof r.rating === "number" ? r.rating : null,
        review_text: r.text ?? null,
        review_date: r.time ? new Date(r.time * 1000).toISOString() : null,
        detected_language: r.language ?? null,
        raw: r,
      };
    });

    const { data: saved, error: saveErr } = await supabase
      .from("reviews")
      .upsert(rows, { onConflict: "organization_id,source,google_review_id" })
      .select("id, source, google_review_id, rating, author_name, review_date, detected_language")
      .limit(10);

    if (saveErr) {
      return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      fetched: rows.length,
      savedPreview: saved ?? [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
