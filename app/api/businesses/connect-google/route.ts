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

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY" }, { status: 500 });
    }

    const body = (await req.json()) as Body;
    const placeId = (body.google_place_id ?? "").trim();

    if (!placeId) {
      return NextResponse.json({ ok: false, error: "google_place_id is required" }, { status: 400 });
    }

    // 1) Verify Place ID with Google (fast + demo friendly)
    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });
    const g = (await res.json()) as GooglePlaceDetailsResponse;

    if (g.status !== "OK") {
      return NextResponse.json(
        { ok: false, error: "Google verification failed", googleStatus: g.status, googleError: g.error_message },
        { status: 400 }
      );
    }

    const placeName = g.result?.name ?? null;

    // 2) Find current business or create one
    const { data: currentBiz, error: currentErr } = await supabase
      .from("businesses")
      .select("id, business_name, google_place_id, organization_id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentErr) {
      return NextResponse.json({ ok: false, error: currentErr.message }, { status: 500 });
    }

    let businessId: string;

    if (!currentBiz?.id) {
      // Create a business row if none exists yet
      const { data: created, error: createErr } = await supabase
        .from("businesses")
        .insert({
          organization_id: organizationId,
          name: placeName ?? "My Business",
          google_place_id: placeId,
        })
        .select("id, business_name, google_place_id, organization_id, created_at")
        .single();

      if (createErr) {
        return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        business: created,
        verified: { name: placeName, rating: g.result?.rating ?? null, user_ratings_total: g.result?.user_ratings_total ?? null },
      });
    }

    businessId = currentBiz.id;

    // Update existing business (org FK + RLS safe)
    const { data: updated, error: updateErr } = await supabase
      .from("businesses")
      .update({
        google_place_id: placeId,
        // only set name if empty (optional)
        ...(currentBiz.business_name ? {} : { business_name: placeName ?? "My Business" }),
      })
      .eq("id", businessId)
      .eq("organization_id", organizationId)
      .select("id, business_name, google_place_id, organization_id, created_at")
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      business: updated,
      verified: { name: placeName, rating: g.result?.rating ?? null, user_ratings_total: g.result?.user_ratings_total ?? null },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
