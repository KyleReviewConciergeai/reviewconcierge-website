import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
      { status: 500 }
    );
  }

  // Test Place ID (Google HQ – safe public test)
  const placeId = "ChIJj61dQgK6j4AR4GeTYWZsKWw";

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${placeId}` +
    `&fields=name,rating` +
    `&key=${apiKey}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== "OK") {
    return NextResponse.json(
      { ok: false, googleStatus: data.status, googleError: data.error_message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    placeName: data.result.name,
    rating: data.result.rating,
  });
}
