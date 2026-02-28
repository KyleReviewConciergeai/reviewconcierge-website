export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOrgContext } from "@/lib/orgServer";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function supabaseAdmin() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function POST() {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;
    const supabase = supabaseAdmin();

    // Fetch existing integration to get refresh token for revocation
    const { data: integration, error: fetchErr } = await supabase
      .from("google_integrations")
      .select("refresh_token")
      .eq("org_id", orgId)
      .eq("provider", "google")
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ ok: false, error: fetchErr.message }, { status: 500 });
    }

    if (!integration) {
      return NextResponse.json({ ok: false, error: "No Google connection found." }, { status: 404 });
    }

    // Best-effort: revoke token with Google
    if (integration.refresh_token) {
      try {
        await fetch(
          `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(integration.refresh_token)}`,
          { method: "POST", cache: "no-store" }
        );
      } catch {
        // Non-fatal — we still clean up locally even if Google revocation fails
      }
    }

    // Mark integration as revoked in Supabase
    const { error: updateErr } = await supabase
      .from("google_integrations")
      .update({
        status: "revoked",
        refresh_token: null,
        access_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq("org_id", orgId)
      .eq("provider", "google");

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, revoked: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}