import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
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
      { ok: false, error: bizErr?.message ?? "No business found or missing google_place_id" },
      { status: 500 }
    );
  }

  const businessId = biz.id;
  const placeId = biz.google_place_id;

  // 2) Fetch Google reviews
  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=reviews` +
    `&key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK") {
    return NextResponse.json(
      { ok: false, googleStatus: data.status, googleError: data.error_message },
      { status: 500 }
    );
  }

  const reviews = Array.isArray(data.result?.reviews) ? data.result.reviews : [];

  // 3) Upsert into Supabase
  // NOTE: google_review_id is the unique-ish identifier we’ll use for upsert.
  // Google returns `time` (unix seconds) and `language` for reviews in many cases.
  const rows = reviews.map((r: any) => ({
    business_id: businessId,
    google_review_id: String(r.time ?? `${r.author_name ?? "unknown"}-${r.rating ?? ""}-${r.text ?? ""}`).slice(0, 255),
    rating: r.rating ?? null,
    author_name: r.author_name ?? null,
    review_text: r.text ?? null,
    review_date: r.time ? new Date(r.time * 1000).toISOString() : null,
    detected_language: r.language ?? null,
    // If you added the source column via Option 1:
    source: "google",
  }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, saved: 0, note: "No reviews returned by Google for this place" });
  }

  const { data: saved, error: saveErr } = await supabase
    .from("reviews")
    .upsert(rows, { onConflict: "google_review_id" })
    .select("id, google_review_id, rating, author_name, review_date, detected_language")
    .limit(10);

  if (saveErr) {
    return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    fetched: rows.length,
    savedPreview: saved ?? [],
  });
}
