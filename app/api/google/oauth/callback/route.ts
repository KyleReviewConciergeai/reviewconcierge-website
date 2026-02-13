// app/api/google/oauth/callback/route.ts
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

function safeRedact(value: string | null, keepStart = 10) {
  if (!value) return null;
  if (value.length <= keepStart) return value;
  return `${value.slice(0, keepStart)}…`;
}

function getCookieFromHeader(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

// Optional: best-effort identity fetch (email/sub) using access token
async function fetchGoogleUserInfo(accessToken: string) {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };
    return json;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);

  // helper to clear state cookie consistently
  const clearStateCookie = (res: NextResponse) => {
    res.cookies.set("google_oauth_state", "", { path: "/", maxAge: 0 });
    return res;
  };

  try {
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    const oauthError = requestUrl.searchParams.get("error");
    const oauthErrorDesc = requestUrl.searchParams.get("error_description");

    console.log("[GBP OAUTH CALLBACK HIT]");
    console.log("url:", requestUrl.toString());
    console.log("has_code:", Boolean(code), "has_state:", Boolean(state));
    if (oauthError) console.log("oauth_error:", oauthError, "desc:", oauthErrorDesc ?? "");

    // If Google sent an OAuth error, surface it clearly
    if (oauthError) {
      const res = NextResponse.json(
        { ok: false, error: oauthError, detail: oauthErrorDesc ?? null },
        { status: 400 }
      );
      return clearStateCookie(res);
    }

    if (!code) {
      return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
    }
    if (!state) {
      return NextResponse.json({ ok: false, error: "Missing state" }, { status: 400 });
    }

    // Validate state cookie
    const cookieHeader = req.headers.get("cookie") || "";
    const cookieState = getCookieFromHeader(cookieHeader, "google_oauth_state");

    console.log("state_param:", safeRedact(state), "state_cookie:", safeRedact(cookieState));

    if (!cookieState || cookieState !== state) {
      const res = NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
      return clearStateCookie(res);
    }

    // Exchange code -> tokens
    const clientId = mustEnv("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = mustEnv("GOOGLE_OAUTH_CLIENT_SECRET");
    const redirectUri = mustEnv("GOOGLE_OAUTH_REDIRECT_URI");

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      cache: "no-store",
    });

    const tokenText = await tokenRes.text();
    if (!tokenRes.ok) {
      console.log("Token exchange failed:", tokenRes.status, tokenText);
      const res = NextResponse.json(
        { ok: false, error: `Token exchange failed: ${tokenRes.status}`, detail: tokenText },
        { status: 500 }
      );
      return clearStateCookie(res);
    }

    const tokenJson = JSON.parse(tokenText) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    const accessToken = tokenJson.access_token ?? null;
    const refreshTokenFromGoogle = tokenJson.refresh_token ?? null;
    const expiresIn = tokenJson.expires_in ?? null;

    console.log("token_exchange_ok:", true, "has_access_token:", Boolean(accessToken), "has_refresh_token:", Boolean(refreshTokenFromGoogle));

    if (!accessToken) {
      const res = NextResponse.json(
        { ok: false, error: "No access_token returned from Google.", raw: tokenJson },
        { status: 500 }
      );
      return clearStateCookie(res);
    }

    // Get org context from logged-in session cookies
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const supabase = supabaseAdmin();

    // Best-effort: pull identity (email/sub) for display/debug
    const userInfo = await fetchGoogleUserInfo(accessToken);
    const googleAccountId = userInfo?.sub ?? null;
    const googleAccountEmail = userInfo?.email ?? null;

    // Compute expires_at
    const expiresAt =
      typeof expiresIn === "number" && expiresIn > 0
        ? new Date(Date.now() + expiresIn * 1000).toISOString()
        : null;

    // If refresh_token is missing (common on re-consent), preserve existing refresh_token.
    let finalRefreshToken: string | null = refreshTokenFromGoogle;

    if (!finalRefreshToken) {
      const { data: existing, error: existingErr } = await supabase
        .from("google_integrations")
        .select("refresh_token")
        .eq("org_id", orgId)
        .eq("provider", "google")
        .maybeSingle();

      if (existingErr) {
        console.log("Failed reading existing google_integrations row:", existingErr.message);
      } else {
        finalRefreshToken = existing?.refresh_token ?? null;
      }
    }

    if (!finalRefreshToken) {
      // Still none: user likely connected previously without offline access / token was never stored.
      // We surface a clear message (but don't leak tokens).
      const res = NextResponse.json(
        {
          ok: false,
          error:
            "No refresh_token available. Please retry connection with consent (or remove app access in Google Account, then reconnect).",
          detail: { has_access_token: true, has_refresh_token: false, has_existing_refresh_token: false },
        },
        { status: 400 }
      );
      return clearStateCookie(res);
    }

    // Upsert canonical integration row for this org/provider
    // NOTE: relies on UNIQUE(org_id, provider)
    const upsertPayload = {
  org_id: orgId,
  provider: "google",
  status: "active",
  refresh_token: finalRefreshToken,
  access_token: accessToken,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      google_account_id: googleAccountId,
      // keep these nullable; they can be filled later by picker
      google_location_id: null,
      google_location_name: null,
      google_place_id: null,
      meta: {
        scope: tokenJson.scope ?? null,
        token_type: tokenJson.token_type ?? null,
        google_account_email: googleAccountEmail,
        userinfo: userInfo ? { sub: userInfo.sub, email: userInfo.email, email_verified: userInfo.email_verified } : null,
      },
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("google_integrations")
      .upsert(upsertPayload, { onConflict: "org_id,provider" });

    if (upsertErr) {
      const res = NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
      return clearStateCookie(res);
    }

    // Clear state cookie + send user back to connect page (or settings page)
    const redirect = NextResponse.redirect(new URL("/connect/google", requestUrl.origin));
    return clearStateCookie(redirect);
  } catch (e: any) {
    console.log("GBP OAuth callback error:", e?.message ?? e);
    const res = NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
    return clearStateCookie(res);
  }
}
