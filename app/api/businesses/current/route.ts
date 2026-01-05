export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

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
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[businesses/current] query error", error);
      return NextResponse.json(
        { ok: false, error: "Unable to load business information." },
        { status: 500 }
      );
    }

    // IMPORTANT:
    // - business is either a single object or null
    // - no implied onboarding or connection logic here
    return NextResponse.json(
      {
        ok: true,
        business: data ?? null,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unexpected server error";
    console.error("[businesses/current] error", err);

    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
