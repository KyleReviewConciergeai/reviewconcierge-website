// lib/googleOAuthServer.ts
import "server-only";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export async function getAccessTokenFromRefreshToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

  if (!clientId) throw new Error("Missing GOOGLE_OAUTH_CLIENT_ID");
  if (!clientSecret) throw new Error("Missing GOOGLE_OAUTH_CLIENT_SECRET");
  if (!refreshToken) throw new Error("Missing refresh token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${txt}`);
  }

  const data = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();
  return { accessToken: data.access_token, expiresAt };
}
