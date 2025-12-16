import { NextResponse } from "next/server";

type GooglePlacesDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    rating?: number;
  };
};

export async function GET() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_TEST_PLACE_ID;

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
      { status: 500 }
    );
  }

  if (!placeId) {
    return NextResponse.json(
      { ok: false, error: "Missing GOOGLE_TEST_PLACE_ID" },
      { status: 500 }
    );
  }

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,rating` +
    `&key=${encodeURIComponent(apiKey)}`;

  let data: GooglePlacesDetailsResponse;

  try {
    const res = await fetch(url, { cache: "no-store" });
    data = (await res.json()) as GooglePlacesDetailsResponse;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed to reach Google Places API" },
      { status: 500 }
    );
  }

  if (data.status !== "OK") {
    return NextResponse.json(
      {
        ok: false,
        googleStatus: data.status,
        googleError: data.error_message ?? null,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    placeName: data.result?.name ?? null,
    rating: data.result?.rating ?? null,
  });
}
