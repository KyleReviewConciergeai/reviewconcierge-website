import { supabaseServerClient } from "@/lib/supabaseServerClient";

export type OrgContext = {
  supabase: Awaited<ReturnType<typeof supabaseServerClient>>;
  userId: string;
  organizationId: string;
  email?: string | null;
};

export async function requireOrgContext(): Promise<OrgContext> {
  // ✅ Your supabaseServerClient() returns a Promise, so we must await it
  const supabase = await supabaseServerClient();

  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("organization_id,email")
    .eq("id", user.id)
    .single();

  if (profErr) throw new Error(`Profile lookup failed: ${profErr.message}`);
  if (!profile?.organization_id) throw new Error("User has no organization_id");

  return {
    supabase,
    userId: user.id,
    organizationId: profile.organization_id,
    email: profile.email ?? user.email ?? null,
  };
}
