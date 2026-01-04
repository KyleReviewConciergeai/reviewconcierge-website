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

export async function requireActiveSubscription() {
  const { supabase, organizationId } = await requireOrgContext();

  // Optional: user email (for logging / UI messages if needed)
  const { data: userData } = await supabase.auth.getUser();
  const userEmail = userData?.user?.email ?? null;

  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("status")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("[subscription] lookup error", error);
  }

  const status = (data?.status ?? null) as SubscriptionStatus;
  const isActive = status === "active" || status === "trialing";

  if (!isActive) {
    return {
      ok: false as const,
      organizationId,
      userEmail,
      status,
    };
  }

  return {
    ok: true as const,
    organizationId,
    userEmail,
    status,
    supabase,
  };
}
