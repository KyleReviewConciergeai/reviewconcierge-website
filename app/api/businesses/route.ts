import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKeyRaw = process.env.GOOGLE_PLACES_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY"
  );
}

if (!googleApiKeyRaw) {
  throw new Error("Missing env var: GOOGLE_PLACES_API_KEY");
}

// ✅ TS now knows this is a string (fixes encodeURIComponent error)
const GOOGLE_API_KEY: string = googleApiKeyRaw;

const supabase = createClient(supabaseUrl, serviceRoleKey);

type GooglePlaceDetails = {
  status: string;
  error_message?: string;
  result?: { name?: string };
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const google_place_id = String(body?.google_place_id ?? "").trim();

    if (!google_place_id) {
      return NextResponse.json(
        { error: "google_place_id is required" },
        { status: 400 }
      );
    }

    // 1) Fetch place name from Google (because business_name is NOT NULL)
    const placeId: string = google_place_id;

    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name` +
      `&key=${encodeURIComponent(GOOGLE_API_KEY)}`;

    const res = await fetch(url, { cache: "no-store" });
    const data = (await res.json()) as GooglePlaceDetails;

    if (data.status !== "OK") {
      return NextResponse.json(
        {
          error: "Google Place Details failed",
          googleStatus: data.status,
          googleError: data.error_message,
        },
        { status: 500 }
      );
    }

    const business_name = data.result?.name?.trim();
    if (!business_name) {
      return NextResponse.json(
        { error: "Could not determine business name from Google" },
        { status: 500 }
      );
    }

    // 2) Insert business
   const business_type = "winery"; // MVP default (change later if needed)

const { data: inserted, error } = await supabase
  .from("businesses")
  .insert([{ google_place_id: placeId, business_name, business_type }])
  .select("id, google_place_id, business_name, business_type, created_at")
  .single();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          details: (error as any).details,
          hint: (error as any).hint,
          code: (error as any).code,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ business: inserted }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Invalid request body";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
