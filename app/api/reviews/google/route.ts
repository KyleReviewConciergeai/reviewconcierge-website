export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

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
    const google_place_id = searchParams.get("google_place_id")?.trim();

    if (!google_place_id) {
      return NextResponse.json(
        { ok: false, error: "google_place_id is required" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // 1) Find the business row that matches this google_place_id
    // (If duplicates exist, we take the most recently created.)
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, google_place_id")
      .eq("google_place_id", google_place_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bizErr) {
      return NextResponse.json(
        { ok: false, error: bizErr.message },
        { status: 500 }
      );
    }

    if (!biz?.id || !biz?.google_place_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No matching business found for google_place_id. Create the business first via /api/businesses.",
        },
        { status: 404 }
      );
    }

    const businessId = biz.id as string;
    const placeId = biz.google_place_id as string;

    // 2) Fetch Google reviews
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

    // 3) Map into your Supabase schema
    const rows = reviews.map((r) => {
      // Google does not provide a stable review ID in Place Details API.
      // We generate a deterministic fallback key.
      const fallbackId = `${r.author_name ?? "unknown"}-${r.time ?? ""}-${r.rating ?? ""}-${r.text ?? ""}`;

      return {
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
      .upsert(rows, { onConflict: "source,google_review_id" })
      .select(
        "id, source, google_review_id, rating, author_name, author_url, review_date, detected_language"
      )
      .limit(10);

    if (saveErr) {
      return NextResponse.json(
        { ok: false, error: saveErr.message },
        { status: 500 }
      );
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
