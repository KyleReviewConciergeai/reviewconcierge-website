import { supabaseServerClient } from "@/lib/supabaseServerClient";

export class OrgContextError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "org_context_error") {
    super(message);
    this.name = "OrgContextError";
    this.status = status;
    this.code = code;
  }
}

export type OrgContext = {
  supabase: Awaited<ReturnType<typeof supabaseServerClient>>;
  userId: string;
  organizationId: string;
  /**
   * Back-compat: some callers used `email`.
   * Prefer `userEmail` going forward.
   */
  email?: string | null;
  userEmail?: string | null;
};

export async function requireOrgContext(): Promise<OrgContext> {
  // ✅ Your supabaseServerClient() returns a Promise, so we must await it
  const supabase = await supabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    throw new OrgContextError("Unauthorized", 401, "unauthorized");
  }

  // Profile → org mapping (server-enforced)
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("organization_id,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profErr) {
    // Don’t leak internal schema details beyond what’s helpful
    throw new OrgContextError("Profile lookup failed", 500, "profile_lookup_failed");
  }

  const organizationId = (profile?.organization_id ?? "").trim();
  if (!organizationId) {
    throw new OrgContextError("User has no organization", 403, "missing_organization");
  }

  const resolvedEmail = (profile?.email ?? user.email ?? null) as string | null;

  return {
    supabase,
    userId: user.id,
    organizationId,
    email: resolvedEmail, // back-compat
    userEmail: resolvedEmail,
  };
}
