// app/api/google/gbp/locations/route.ts
import { NextResponse } from "next/server";
import { getAccessTokenFromRefreshToken } from "@/lib/googleOAuthServer";
import { createClient } from "@supabase/supabase-js";
import { requireOrgId } from "@/lib/orgServer";

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

function looksLikeGbpPendingQuota(detailText: string) {
  // Google sometimes includes quota_limit_value: "0" when access isn't granted yet
  return detailText.includes('"quota_limit_value": "0"') || detailText.includes("RESOURCE_EXHAUSTED");
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);

    // ✅ Reads org from authenticated session (cookies)
    const orgId = await requireOrgId();

    const accountName = url.searchParams.get("account"); // e.g. "accounts/1234567890"
    const pageToken = url.searchParams.get("pageToken") ?? "";
    const pageSize = url.searchParams.get("pageSize") ?? "100";

    if (!accountName) {
      return NextResponse.json(
        { ok: false, error: "Missing account param (e.g. accounts/123...)" },
        { status: 400 }
      );
    }

    const supabase = supabaseAdmin();

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
        { ok: false, error: "No Google connection yet. Complete OAuth connect first." },
        { status: 400 }
      );
    }

    const { accessToken } = await getAccessTokenFromRefreshToken(data.refresh_token);

    const apiUrl = new URL(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations`
    );
    apiUrl.searchParams.set("readMask", "name,title");
    apiUrl.searchParams.set("pageSize", pageSize);
    if (pageToken) apiUrl.searchParams.set("pageToken", pageToken);

    const r = await fetch(apiUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const bodyText = await r.text();

    if (!r.ok) {
      // ✅ Friendly “pending” error (quota 0)
      if (r.status === 429 && looksLikeGbpPendingQuota(bodyText)) {
        return NextResponse.json(
          {
            ok: false,
            code: "GBP_ACCESS_PENDING",
            error:
              "Google Business Profile API access is still pending approval for this project, so quota is currently 0. OAuth is connected successfully; we’ll enable location loading as soon as Google grants access.",
            detail: bodyText,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { ok: false, error: `Locations fetch failed: ${r.status}`, detail: bodyText },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(bodyText);
    const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];

    return NextResponse.json({ ok: true, locations, raw: parsed });
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
