// lib/supabaseBrowser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client.
 * Uses cookies for auth storage (including PKCE code verifier),
 * which fixes reset-password PKCE errors in some browsers/settings.
 */
function getCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, options?: { maxAge?: number }) {
  if (typeof document === "undefined") return;

  const parts: string[] = [];
  parts.push(`${name}=${encodeURIComponent(value)}`);
  parts.push("Path=/");
  parts.push("SameSite=Lax");

  // Your site is HTTPS in prod, so keep Secure on.
  // (On localhost, Secure cookies won't set — that's OK.)
  if (window.location.protocol === "https:") parts.push("Secure");

  if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);

  document.cookie = parts.join("; ");
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anon, {
    cookies: {
      get(name) {
        return getCookie(name) ?? undefined;
      },
      set(name, value, options) {
        // options.maxAge exists in the ssr cookie contract
        setCookie(name, value, { maxAge: (options as any)?.maxAge });
      },
      remove(name) {
        deleteCookie(name);
      },
    },
  });
}
