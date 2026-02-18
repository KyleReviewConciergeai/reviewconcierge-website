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
    const google_account_id = body?.google_account_id?.trim(); // saved on google_gbp_locations
    const locations = body?.locations;

    if (!google_account_id) {
      return NextResponse.json({ ok: false, error: "Missing google_account_id" }, { status: 400 });
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json({ ok: false, error: "No locations provided" }, { status: 400 });
    }

    const now = new Date().toISOString();

    const normalized = locations
      .map((l) => ({
        google_location_id: l?.google_location_id?.trim(),
        google_location_name: l?.google_location_name?.trim(),
      }))
      .filter((l) => !!l.google_location_id)
      .map((l) => ({
        google_location_id: l.google_location_id as string,
        google_location_name: l.google_location_name || (l.google_location_id as string),
      }));

    if (normalized.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid locations provided" }, { status: 400 });
    }

    const supabase = supabaseAdmin();

    // 1) Save selected GBP locations (source of truth)
    const gbpRows = normalized.map((l) => ({
      org_id: orgId,
      google_account_id,
      google_location_id: l.google_location_id,
      google_location_name: l.google_location_name,
      status: "active",
      updated_at: now,
    }));

    const { error: gbpErr } = await supabase
      .from("google_gbp_locations")
      .upsert(gbpRows, { onConflict: "org_id,google_location_id" });

    if (gbpErr) {
      return NextResponse.json({ ok: false, error: gbpErr.message }, { status: 500 });
    }

    // 2) Ensure a matching "business" row exists per GBP location
    // IMPORTANT:
    // Your DB uses a PARTIAL unique index:
    //   (organization_id, google_location_id) WHERE google_location_id IS NOT NULL
    // Postgres requires the ON CONFLICT clause to include the same WHERE predicate,
    // but supabase-js upsert() can't express that.
    // So we do a manual upsert: select -> update else insert.

    for (const l of normalized) {
      const google_location_id = l.google_location_id;
      const google_location_name = l.google_location_name;

      // Check if business already exists for this org+location
      const { data: existing, error: findErr } = await supabase
        .from("businesses")
        .select("id")
        .eq("organization_id", orgId)
        .eq("google_location_id", google_location_id)
        .maybeSingle();

      if (findErr) {
        return NextResponse.json(
          { ok: false, error: `Saved locations, but business lookup failed: ${findErr.message}` },
          { status: 500 }
        );
      }

      if (existing?.id) {
        // Update the existing row (keep it simple + safe)
        const { error: updErr } = await supabase
          .from("businesses")
          .update({
            business_name: google_location_name,
            google_location_name: google_location_name,
            // do NOT set created_at on updates
          })
          .eq("id", existing.id);

        if (updErr) {
          return NextResponse.json(
            { ok: false, error: `Saved locations, but business update failed: ${updErr.message}` },
            { status: 500 }
          );
        }
      } else {
        // Insert a new business row
        const { error: insErr } = await supabase.from("businesses").insert({
          organization_id: orgId,
          business_name: google_location_name, // NOT NULL
          business_type: "google_gbp_location", // NOT NULL (your choice)
          google_location_id, // must be NOT NULL for the partial unique index
          google_location_name,
          // created_at likely has a default in DB; if not, uncomment next line:
          // created_at: now,
        });

        if (insErr) {
          return NextResponse.json(
            { ok: false, error: `Saved locations, but business insert failed: ${insErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    return NextResponse.json({ ok: true, saved: normalized.length });
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
