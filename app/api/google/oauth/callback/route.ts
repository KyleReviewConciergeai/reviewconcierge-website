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
  // Matches "name=value" in a semi-colon separated cookie string
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  if (!match) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    // If decode fails, fall back to raw
    return match[1];
  }
}

export async function GET(req: Request) {
  const requestUrl = new URL(req.url);

  try {
    const code = requestUrl.searchParams.get("code");
    const state = requestUrl.searchParams.get("state");

    const oauthError = requestUrl.searchParams.get("error");
    const oauthErrorDesc = requestUrl.searchParams.get("error_description");

    // Debug (safe)
    console.log("[GBP OAUTH CALLBACK HIT]");
    console.log("url:", requestUrl.toString());
    console.log("has_code:", Boolean(code), "has_state:", Boolean(state));
    if (oauthError) {
      console.log("oauth_error:", oauthError, "desc:", oauthErrorDesc ?? "");
    }

    // If Google sent an OAuth error, surface it clearly
    if (oauthError) {
      // Clear state cookie so next attempt is clean
      const res = NextResponse.json(
        { ok: false, error: oauthError, detail: oauthErrorDesc ?? null },
        { status: 400 }
      );
      res.cookies.set("google_oauth_state", "", {
        path: "/",
        maxAge: 0,
      });
      return res;
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
      // Clear state cookie so user can retry cleanly
      const res = NextResponse.json({ ok: false, error: "Invalid state" }, { status: 400 });
      res.cookies.set("google_oauth_state", "", {
        path: "/",
        maxAge: 0,
      });
      return res;
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
      return NextResponse.json(
        { ok: false, error: `Token exchange failed: ${tokenRes.status}`, detail: tokenText },
        { status: 500 }
      );
    }

    const tokenJson = JSON.parse(tokenText) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    console.log("token_exchange_ok:", true, "has_refresh_token:", Boolean(tokenJson.refresh_token));

    // IMPORTANT:
    // refresh_token may be missing if Google thinks user already consented.
    // That’s why we used prompt=consent in /start.
    const refreshToken = tokenJson.refresh_token;
    if (!refreshToken) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No refresh_token returned. Try again (or remove app access in Google Account and retry).",
          raw: tokenJson,
        },
        { status: 400 }
      );
    }

    // Get org context from logged-in session cookies
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const supabase = supabaseAdmin();

    // Store connection for this org (table must have org_id, status, refresh_token at minimum)
    const { error: upsertErr } = await supabase.from("google_integrations").upsert(
      {
        org_id: orgId,
        status: "active",
        refresh_token: refreshToken,
      },
      { onConflict: "org_id" }
    );

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    // Clear state cookie + send user back to connect page
    const redirect = NextResponse.redirect(new URL("/connect/google", requestUrl.origin));
    redirect.cookies.set("google_oauth_state", "", {
      path: "/",
      maxAge: 0,
    });

    return redirect;
  } catch (e: any) {
    console.log("GBP OAuth callback error:", e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown server error" },
      { status: 500 }
    );
  }
}
