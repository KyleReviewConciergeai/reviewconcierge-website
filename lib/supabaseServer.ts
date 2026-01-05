// lib/supabaseServer.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseServerEnv = {
  url: string;
  serviceRoleKey: string;
};

function readSupabaseServerEnv(): SupabaseServerEnv {
  /**
   * Canonical env vars:
   * - NEXT_PUBLIC_SUPABASE_URL (safe to expose; still used server-side)
   * - SUPABASE_SERVICE_ROLE_KEY (server-only, NEVER ship to client)
   */
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

  const missing: string[] = [];
  if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length) {
    // Helpful diagnostics without leaking secrets
    const presentFlags = {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      NODE_ENV: process.env.NODE_ENV || null,
    };

    throw new Error(
      [
        "Missing Supabase server environment variables.",
        `Missing: ${missing.join(", ")}`,
        `Present flags: ${JSON.stringify(presentFlags)}`,
        "Fix: Add env vars in Vercel (Project → Settings → Environment Variables) and redeploy.",
      ].join("\n")
    );
  }

  return { url, serviceRoleKey };
}

/**
 * Guardrail: Service role must never be used in a browser bundle.
 * If this file is accidentally imported client-side, hard fail.
 */
function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseServer() was imported client-side. This must be server-only.");
  }
}

let _client: SupabaseClient | null = null;

/**
 * Supabase admin client (service role)
 * Use ONLY in server routes / server actions / webhooks.
 */
export function supabaseServer(): SupabaseClient {
  assertServerOnly();

  if (_client) return _client;

  const { url, serviceRoleKey } = readSupabaseServerEnv();

  _client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return _client;
}
