// app/api/google/gbp/accounts/route.ts
import { NextResponse } from "next/server";
import { getAccessTokenFromRefreshToken } from "@/lib/googleOAuthServer";
import { createClient } from "@supabase/supabase-js";
import { requireOrgContext } from "@/lib/orgServer";

// IMPORTANT: use Service Role on the server only
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    throw new Error(
      "Missing Supabase env vars for admin client (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)"
    );
  }

  return createClient(url, service, { auth: { persistSession: false } });
}

function looksLikeGbPQuotaZero(detailText: string) {
  // Google returns quota metadata; the smoking gun is quota_limit_value "0"
  // plus the mybusinessaccountmanagement service name.
  return (
    detailText.includes("mybusinessaccountmanagement.googleapis.com") &&
    (detailText.includes('"quota_limit_value": "0"') ||
      detailText.includes("quota_limit_value") && detailText.includes("0"))
  );
}

export async function GET(_req: Request) {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const supabase = supabaseAdmin();

    // Grab any active integration row for this org to get its refresh token
    const { data, error } = await supabase
      .from("google_integrations")
      .select("refresh_token")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data?.refresh_token) {
      return NextResponse.json(
        { ok: false, code: "NO_GOOGLE_CONNECTION", error: "No Google connection yet. Complete OAuth connect first." },
        { status: 400 }
      );
    }

    const { accessToken } = await getAccessTokenFromRefreshToken(data.refresh_token);

    const r = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const text = await r.text();

    if (!r.ok) {
      // ✅ Friendly handling for “quota=0 pending approval”
      if (r.status === 429 && looksLikeGbPQuotaZero(text)) {
        return NextResponse.json(
          {
            ok: false,
            code: "GBP_ACCESS_PENDING",
            error:
              "Google Business Profile API access is still pending approval for this project, so quota is currently 0. OAuth is connected successfully; we’ll enable account/location loading as soon as Google grants access.",
            detail: text,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { ok: false, error: `Accounts fetch failed: ${r.status}`, detail: text },
        { status: 500 }
      );
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    const accounts = Array.isArray(parsed?.accounts)
      ? parsed.accounts
      : parsed?.accounts ?? parsed?.items ?? [];

    return NextResponse.json({ ok: true, accounts, raw: parsed });
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
