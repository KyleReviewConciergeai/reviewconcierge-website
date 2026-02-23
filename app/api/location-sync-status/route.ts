// app/api/location-sync-status/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

export async function GET(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const url = new URL(req.url);

    const google_location_id = (url.searchParams.get("google_location_id") ?? "").trim();
    const source = (url.searchParams.get("source") ?? "google_places").trim();

    let q = supabase
      .from("location_sync_status")
      .select(
        "google_location_id,source,last_synced_at,last_error,last_fetched,last_inserted,last_updated,updated_at"
      )
      .eq("organization_id", organizationId)
      .eq("source", source)
      .order("updated_at", { ascending: false })
      .limit(25);

    if (google_location_id) {
      q = q.eq("google_location_id", google_location_id);
    }

    const { data, error } = await q;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, rows: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to load sync status" },
      { status: 500 }
    );
  }
}