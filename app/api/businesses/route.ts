// app/api/businesses/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type CreateOrUpdateBusinessBody = {
  business_name?: string;
  // Intentionally NOT supported here (must be verified via connect endpoint)
  google_place_id?: string;
};

export async function GET(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    // Keep this endpoint lightweight and non-"multi-location SaaS".
    // It exists mainly for internal/admin use or future evolution.
    const limitRaw = Number(new URL(req.url).searchParams.get("limit") ?? "10");
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 10;

    const { data, error } = await supabase
      .from("businesses")
      .select(
        [
          "id",
          "business_name",
          "google_place_id",
          "google_place_name",
          "google_rating",
          "google_user_ratings_total",
          "created_at",
        ].join(", ")
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        ok: true,
        businesses: data ?? [],
        note:
          "Pre-Mendoza: Review Concierge is optimized for a single connected business. For Place ID connection, use /api/businesses/connect-google.",
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const body = (await req.json().catch(() => null)) as CreateOrUpdateBusinessBody | null;
    const business_name = (body?.business_name ?? "").trim();
    const google_place_id = (body?.google_place_id ?? "").trim();

    if (!business_name) {
      return NextResponse.json({ ok: false, error: "business_name is required" }, { status: 400 });
    }

    // Doctrine: Place ID must be verified + connected via the dedicated endpoint.
    if (google_place_id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "google_place_id must be verified before saving. Use POST /api/businesses/connect-google to verify & connect.",
        },
        { status: 400 }
      );
    }

    // Pre-Mendoza posture: behave like "one business per org" (most recent record).
    const { data: current, error: currentErr } = await supabase
      .from("businesses")
      .select("id, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (currentErr) {
      return NextResponse.json({ ok: false, error: currentErr.message }, { status: 500 });
    }

    // If there is no business, create it. Otherwise, update the most recent one.
    if (!current?.id) {
      const { data: created, error: createErr } = await supabase
        .from("businesses")
        .insert({
          organization_id: organizationId,
          business_name,
        })
        .select(
          [
            "id",
            "business_name",
            "google_place_id",
            "google_place_name",
            "google_rating",
            "google_user_ratings_total",
            "created_at",
          ].join(", ")
        )
        .single();

      if (createErr) {
        return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, business: created }, { status: 201 });
    }

    const { data: updated, error: updateErr } = await supabase
      .from("businesses")
      .update({ business_name })
      .eq("id", current.id)
      .eq("organization_id", organizationId)
      .select(
        [
          "id",
          "business_name",
          "google_place_id",
          "google_place_name",
          "google_rating",
          "google_user_ratings_total",
          "created_at",
        ].join(", ")
      )
      .single();

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, business: updated }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
