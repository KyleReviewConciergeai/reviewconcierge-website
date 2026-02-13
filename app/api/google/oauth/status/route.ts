// app/api/google/oauth/status/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOrgContext } from "@/lib/orgServer";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// IMPORTANT: service role server-only
function supabaseAdmin() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

export async function GET() {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const supabase = supabaseAdmin();

    const { data, error } = await supabase
      .from("google_integrations")
      .select("org_id, provider, status, expires_at, updated_at, meta")
      .eq("org_id", orgId)
      .eq("provider", "google")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const email =
      (data?.meta && (data.meta as any)?.google_account_email) ? (data.meta as any).google_account_email : null;

    // "Connected" means we have a usable refresh token in storage.
    // We deliberately do NOT return tokens.
    // If you want stricter: require status === 'active' too.
    const connected = Boolean(data) && data?.status === "active";

    return NextResponse.json({
      ok: true,
      connected,
      integration: data
        ? {
            provider: data.provider,
            status: data.status,
            expires_at: data.expires_at,
            updated_at: data.updated_at,
            google_account_email: email,
          }
        : null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
