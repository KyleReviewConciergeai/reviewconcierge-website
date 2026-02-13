// app/api/google/gbp/locations/route.ts
import { NextResponse } from "next/server";
import { getAccessTokenFromRefreshToken } from "@/lib/googleOAuthServer";
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

function truncate(s: string, max = 1200) {
  if (!s) return s;
  return s.length > max ? `${s.slice(0, max)}…(truncated)` : s;
}

// Detect "GBP access pending / quota 0 / API not enabled for project"
function isGbpAccessPending(detailText: string) {
  const t = detailText || "";

  const hasQuotaZero =
    t.includes('"quota_limit_value":"0"') ||
    t.includes('"quota_limit_value": "0"') ||
    (t.includes("quota_limit_value") && t.includes("0"));

  const mentionsGbpServices =
    t.includes("mybusinessaccountmanagement.googleapis.com") ||
    t.includes("mybusinessbusinessinformation.googleapis.com");

  const mentionsResourceExhausted =
    t.includes("RESOURCE_EXHAUSTED") || t.includes("Quota exceeded");

  const mentionsNotConfigured =
    t.includes("has not been used in project") ||
    t.includes("is not enabled") ||
    t.includes("Enable it by visiting") ||
    t.includes("accessNotConfigured");

  return (mentionsGbpServices && (hasQuotaZero || mentionsResourceExhausted)) || mentionsNotConfigured;
}

export async function GET(req: Request) {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const url = new URL(req.url);

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
        {
          ok: false,
          code: "NO_GOOGLE_CONNECTION",
          error: "No Google connection yet. Complete OAuth connect first.",
        },
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
      if (isGbpAccessPending(bodyText)) {
        return NextResponse.json(
          {
            ok: false,
            code: "GBP_ACCESS_PENDING",
            error:
              "Google Business Profile API access is pending approval (quota is currently 0) or not enabled for this project yet. OAuth is connected successfully; we’ll enable location loading as soon as Google grants access.",
            detail: truncate(bodyText),
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { ok: false, error: `Locations fetch failed: ${r.status}`, detail: truncate(bodyText) },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(bodyText);
    const locations = Array.isArray(parsed?.locations) ? parsed.locations : [];

    return NextResponse.json({ ok: true, locations });
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
