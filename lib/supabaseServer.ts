// lib/supabaseServer.ts
import { createClient } from "@supabase/supabase-js";

type SupabaseServerEnv = {
  url: string;
  serviceRoleKey: string;
};

function readSupabaseServerEnv(): SupabaseServerEnv {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    "";

  const missing: string[] = [];
  if (!url) missing.push("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
  if (!serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");

  if (missing.length) {
    // Helpful diagnostics without leaking secrets
    const present = {
      SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      SUPABASE_SECRET_KEY: Boolean(process.env.SUPABASE_SECRET_KEY),
      VERCEL_ENV: process.env.VERCEL_ENV || null,
      NODE_ENV: process.env.NODE_ENV || null,
    };

    throw new Error(
      [
        "Error: Missing Supabase server environment variables.",
        `Missing: ${missing.join(", ")}`,
        `Present flags: ${JSON.stringify(present)}`,
        "Fix: Add the missing env vars in Vercel (Project → Settings → Environment Variables) and redeploy.",
      ].join("\n")
    );
  }

  return { url, serviceRoleKey };
}

export function supabaseServer() {
  const { url, serviceRoleKey } = readSupabaseServerEnv();

  // Service role must NEVER be used client-side. This file should only be imported in server contexts.
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
