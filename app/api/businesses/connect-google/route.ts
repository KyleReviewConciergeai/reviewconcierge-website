export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type Body = {
  google_place_id?: string;
};

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  };
};

// Explicit “row shape” to prevent Supabase generated types mismatches
type BusinessRow = {
  id: string;
  business_name: string | null;
  google_place_id: string | null;
  google_place_name: string | null;
  google_rating: number | null;
  google_user_ratings_total: number | null;
  organization_id: string;
  created_at: string | null;
};

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const placeId = (body.google_place_id ?? "").trim();
    if (!placeId) {
      return NextResponse.json(
        { ok: false, error: "google_place_id is required" },
        { status: 400 }
      );
    }

    // 1) Verify Place ID with Google
    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: "Google verification request failed", status: res.status },
        { status: 502 }
      );
    }

    const g = (await res.json()) as GooglePlaceDetailsResponse;

    if (g.status !== "OK") {
      return NextResponse.json(
        {
          ok: false,
          error: "Google verification failed",
          googleStatus: g.status,
          googleError: g.error_message,
        },
        { status: 400 }
      );
    }

    const placeName = g.result?.name ?? null;
    const googleRating = typeof g.result?.rating === "number" ? g.result.rating : null;
    const googleTotal =
      typeof g.result?.user_ratings_total === "number" ? g.result.user_ratings_total : null;

    const returningSelect =
      "id, business_name, google_place_id, google_place_name, google_rating, google_user_ratings_total, organization_id, created_at";

    // 2) Find latest business for org
    const { data: currentData, error: currentErr } = await supabase
      .from("businesses")
      .select("id, business_name, organization_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentErr) {
      return NextResponse.json({ ok: false, error: currentErr.message }, { status: 500 });
    }

    const currentBiz = (currentData as unknown as { id?: string; business_name?: string | null }) ?? null;

    // If none exists, create it
    if (!currentBiz?.id) {
      const { data: createdData, error: createErr } = await supabase
        .from("businesses")
        .insert({
          organization_id: organizationId,
          business_name: placeName ?? "My Business",
          google_place_id: placeId,
          google_rating: googleRating,
          google_user_ratings_total: googleTotal,
          google_place_name: placeName,
        })
        .select(returningSelect)
        .single();

      if (createErr) {
        return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
      }

      const created = createdData as unknown as BusinessRow;

      return NextResponse.json({
        ok: true,
        business: created,
        verified: { name: placeName, rating: googleRating, user_ratings_total: googleTotal },
      });
    }

    // Otherwise update existing business
    const updatePayload: Record<string, any> = {
      google_place_id: placeId,
      google_rating: googleRating,
      google_user_ratings_total: googleTotal,
      google_place_name: placeName,
    };

    const existingName = (currentBiz.business_name ?? "").trim();
    if (!existingName) {
      updatePayload.business_name = placeName ?? "My Business";
    }

    const { data: updatedData, error: updateErr } = await supabase
      .from("businesses")
      .update(updatePayload)
      .eq("id", currentBiz.id)
      .eq("organization_id", organizationId)
      .select(returningSelect)
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    const updated = updatedData as unknown as BusinessRow;

    return NextResponse.json({
      ok: true,
      business: updated,
      verified: { name: placeName, rating: googleRating, user_ratings_total: googleTotal },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
