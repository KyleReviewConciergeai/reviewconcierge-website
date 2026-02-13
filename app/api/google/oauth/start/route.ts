// app/api/google/oauth/start/route.ts
import { NextResponse } from "next/server";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function randomState() {
  return crypto.randomUUID();
}

export async function GET() {
  const clientId = mustEnv("GOOGLE_OAUTH_CLIENT_ID");
  const redirectUri = mustEnv("GOOGLE_OAUTH_REDIRECT_URI");

  // Minimal scopes for GBP account/location + reviews later
  const scope = [
    "https://www.googleapis.com/auth/business.manage",
    "openid",
    "email",
    "profile",
  ].join(" ");

  const state = randomState();

  // Debug (safe)
  console.log("[GOOGLE OAUTH START]", { redirectUri });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);

  // Important for refresh_token
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");

  // Helps if you add scopes later
  url.searchParams.set("include_granted_scopes", "true");

  // CSRF protection
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());

  // store state in httpOnly cookie so callback can validate it
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return res;
}
