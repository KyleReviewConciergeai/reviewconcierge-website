import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseServer";

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

export async function GET() {
  try {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // 1) Grab the most recent business row (your “Googleplex (Test)” one)
    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("id, google_place_id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bizErr || !biz?.id || !biz?.google_place_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            bizErr?.message ??
            "No business found or missing google_place_id in businesses table",
        },
        { status: 500 }
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
        { ok: false, googleStatus: data.status, googleError: data.error_message },
        { status: 500 }
      );
    }

    const reviews = Array.isArray(data.result?.reviews) ? data.result!.reviews! : [];

    if (reviews.length === 0) {
      return NextResponse.json({
        ok: true,
        fetched: 0,
        saved: 0,
        note: "No reviews returned by Google for this place",
      });
    }

    // 3) Map into YOUR Supabase schema (exact column names you provided)
    const rows = reviews.map((r) => {
      const fallbackId = `${r.author_name ?? "unknown"}-${r.time ?? ""}-${r.rating ?? ""}-${r.text ?? ""}`;

      return {
        business_id: businessId,
        source: "google",
        google_review_id: String(r.time ?? fallbackId).slice(0, 255),

        author_name: r.author_name ?? null,
        author_url: r.author_url ?? null,
        rating: typeof r.rating === "number" ? r.rating : null,
        review_text: r.text ?? null,

        // ✅ your column is review_date (timestamptz)
        review_date: r.time ? new Date(r.time * 1000).toISOString() : null,

        // ✅ your column is detected_language
        detected_language: r.language ?? null,

        // ✅ your column is raw (jsonb)
        raw: r,
      };
    });

    // IMPORTANT:
    // You said you created a unique index on (source, google_review_id)
    // so onConflict MUST match both columns.
    const { data: saved, error: saveErr } = await supabase
      .from("reviews")
      .upsert(rows, { onConflict: "source,google_review_id" })
      .select(
        "id, source, google_review_id, rating, author_name, author_url, review_date, detected_language"
      )
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
