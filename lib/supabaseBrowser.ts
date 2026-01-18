// lib/supabaseBrowser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client using @supabase/ssr.
 * Relies on default cookie storage for PKCE code verifier and sessions.
 * This fixes common reset-password PKCE errors in SSR/Next.js by using cookies instead of localStorage.
 */
export function supabaseBrowser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    // Optional: Custom cookie adapter (only needed for advanced control).
    // The default (document.cookie) usually works fine for PKCE in browser.
    // Uncomment and customize if you need prefixed names, different encoding, etc.
    /*
    cookies: {
      get(name) {
        if (typeof document === "undefined") return undefined;
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        return match ? decodeURIComponent(match[2]) : undefined;
      },
      set(name, value, options) {
        if (typeof document === "undefined") return;
        const parts: string[] = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
        parts.push("SameSite=Lax");
        if (window.location.protocol === "https:") parts.push("Secure");
        if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
        document.cookie = parts.join("; ");
      },
      remove(name) {
        if (typeof document === "undefined") return;
        document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
      },
      // If using newer @supabase/ssr that warns about getAll/setAll, add these:
      getAll() {
        if (typeof document === "undefined") return [];
        return document.cookie.split("; ").map((c) => {
          const [name, ...rest] = c.split("=");
          return { name, value: decodeURIComponent(rest.join("=")) };
        });
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return;
        cookiesToSet.forEach(({ name, value, options }) => {
          const parts: string[] = [`${name}=${encodeURIComponent(value)}`, "Path=/"];
          parts.push("SameSite=Lax");
          if (window.location.protocol === "https:") parts.push("Secure");
          if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
          document.cookie = parts.join("; ");
        });
      },
      */
  });
}