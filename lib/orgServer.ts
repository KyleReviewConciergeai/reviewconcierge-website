import "server-only";

import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseServer } from "@/lib/supabaseServer";

export type OrgContext = {
  // Session-aware client (anon + cookies) for auth & user-scoped reads
  supabase: Awaited<ReturnType<typeof supabaseServerClient>>;
  userId: string;
  organizationId: string;
  email?: string | null;
};

function defaultOrgName(email?: string | null) {
  if (!email) return "New Organization";
  const at = email.indexOf("@");
  if (at > 0) return email.slice(0, at);
  return "New Organization";
}

/**
 * Resolves the current user's org context.
 * - Requires an authenticated Supabase user (via cookies)
 * - Ensures a profile exists
 * - Ensures an organization exists (bootstraps if missing)
 */
export async function requireOrgContext(): Promise<OrgContext> {
  // Session-aware client (anon + cookies) for auth
  const supabase = await supabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    // Keep this string stable; API routes can key off it for 401s.
    throw new Error("Unauthorized");
  }

  const admin = supabaseServer(); // ✅ service role (server-only)

  // 1) Load profile (service role avoids RLS surprises)
  const { data: profile, error: profErr } = await admin
    .from("profiles")
    .select("id, organization_id, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    throw new Error(`Profile lookup failed: ${profErr.message}`);
  }

  // 2) If missing or missing org_id -> bootstrap
  if (!profile || !profile.organization_id) {
    // Create an org row
    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert([{ name: defaultOrgName(user.email ?? null) }])
      .select("id")
      .single();

    if (orgErr || !org?.id) {
      throw new Error(`Organization create failed: ${orgErr?.message || "Unknown error"}`);
    }

    // Upsert profile with org_id
    const { error: upsertErr } = await admin.from("profiles").upsert(
      {
        id: user.id,
        email: (user.email ?? null) as string | null,
        organization_id: org.id,
      },
      { onConflict: "id" }
    );

    if (upsertErr) {
      throw new Error(`Profile bootstrap failed: ${upsertErr.message}`);
    }

    return {
      supabase,
      userId: user.id,
      organizationId: org.id,
      email: user.email ?? null,
    };
  }

  // 3) Normal path (profile exists + has org_id)
  return {
    supabase,
    userId: user.id,
    organizationId: profile.organization_id,
    email: profile.email ?? user.email ?? null,
  };
}

/**
 * Convenience helper for server routes that only need the org id.
 * Keeps all org lookup/bootstrap behavior in one place.
 */
export async function requireOrgId(): Promise<string> {
  const ctx = await requireOrgContext();
  return ctx.organizationId;
}
