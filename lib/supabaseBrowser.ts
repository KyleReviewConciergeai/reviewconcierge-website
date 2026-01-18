// lib/supabaseBrowser.ts
"use client";

import { createClient } from "@supabase/supabase-js";

/**
 * Browser-only Supabase client.
 * Uses localStorage for auth (PKCE verifier storage).
 * This avoids "PKCE code verifier not found" issues in reset-password flows.
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!anon) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce", // IMPORTANT: reset-password links are coming in as ?code=...
    },
  });
}
