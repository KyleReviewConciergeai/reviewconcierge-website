// app/api/google/gbp/locations/selected/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOrgId } from "@/lib/orgServer";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// IMPORTANT: use Service Role on the server only
function supabaseAdmin() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

/**
 * Returns all ACTIVE saved GBP locations for the current org.
 */
export async function GET(_req: Request) {
  try {
    const orgId = await requireOrgId();
    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("google_gbp_locations")
      .select("google_account_id, google_location_id, google_location_name, status, updated_at")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("google_location_name", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, locations: data ?? [] });
  } catch (e: any) {
    const msg = e?.message ?? "Unknown server error";
    if (msg === "Unauthorized") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Please sign in again." },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

type DeleteBody = {
  google_location_id?: string;
};

/**
 * Soft-removes (revokes) one saved GBP location for the current org.
 * Body: { google_location_id: "accounts/.../locations/..." }
 */
export async function DELETE(req: Request) {
  try {
    const orgId = await requireOrgId();
    const supabase = supabaseAdmin();

    let body: DeleteBody | null = null;
    try {
      body = (await req.json()) as DeleteBody;
    } catch {
      body = null;
    }

    const google_location_id = body?.google_location_id?.trim();
    if (!google_location_id) {
      return NextResponse.json(
        { ok: false, error: "Missing google_location_id" },
        { status: 400 }
      );
    }

    // Soft delete by setting status to "revoked"
    const { error } = await supabase
      .from("google_gbp_locations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("org_id", orgId)
      .eq("google_location_id", google_location_id)
      .eq("status", "active");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, revoked: 1 });
  } catch (e: any) {
    const msg = e?.message ?? "Unknown server error";
    if (msg === "Unauthorized") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized. Please sign in again." },
        { status: 401 }
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
