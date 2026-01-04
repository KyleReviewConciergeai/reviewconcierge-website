import { requireOrgContext } from "@/lib/orgServer";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | null;

export async function getSubscriptionStatus() {
  const { supabase, organizationId } = await requireOrgContext();

  const { data: userData } = await supabase.auth.getUser();
  const userEmail = userData?.user?.email ?? null;

  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    // Treat as unknown, not inactive
    console.error("[subscription] lookup error", error);
    return {
      ok: false as const,
      organizationId,
      userEmail,
      status: null as SubscriptionStatus,
      isActive: null as boolean | null,
      error: error.message,
    };
  }

  const status = (data?.status ?? null) as SubscriptionStatus;
  const isActive = status === "active" || status === "trialing";

  return {
    ok: true as const,
    organizationId,
    userEmail,
    status,
    isActive,
  };
}

export async function requireActiveSubscription() {
  const s = await getSubscriptionStatus();

  // Remove `ok` from the spread so we don't define it twice
  const { ok: _ignoredOk, ...rest } = s;

  // If we can’t determine status because DB errored, fail CLOSED for gated endpoints
  if (!s.ok || s.isActive !== true) {
    return { ok: false as const, ...rest };
  }

  // If you want to return supabase for downstream use, grab it again
  const { supabase } = await requireOrgContext();
  return { ok: true as const, ...rest, supabase };
}
