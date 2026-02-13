// app/api/google/gbp/locations/select/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOrgContext } from "@/lib/orgServer";

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

type Body = {
  google_account_id: string; // "accounts/123..."
  locations: Array<{
    google_location_id: string; // "accounts/.../locations/..."
    google_location_name: string; // title
  }>;
};

export async function POST(req: Request) {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const body = (await req.json()) as Body;
    const google_account_id = body?.google_account_id?.trim();
    const locations = body?.locations;

    if (!google_account_id) {
      return NextResponse.json({ ok: false, error: "Missing google_account_id" }, { status: 400 });
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ ok: false, error: "No locations provided" }, { status: 400 });
    }

    // Validate + normalize
    const now = new Date().toISOString();
    const rows = locations
      .map((l) => ({
        google_location_id: l?.google_location_id?.trim(),
        google_location_name: l?.google_location_name?.trim(),
      }))
      .filter((l) => !!l.google_location_id)
      .map((l) => ({
        org_id: orgId,
        google_account_id,
        google_location_id: l.google_location_id as string,
        google_location_name: l.google_location_name || l.google_location_id,
        status: "active",
        updated_at: now,
      }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid locations provided" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // One row per org + google_location_id
    const { error } = await supabase
      .from("google_gbp_locations")
      .upsert(rows, { onConflict: "org_id,google_location_id" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, saved: rows.length });
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
