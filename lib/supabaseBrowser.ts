// lib/supabaseBrowser.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-only Supabase client.
 * Uses ONLY public env vars.
 * Throws clear errors if misconfigured.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anon);
}
