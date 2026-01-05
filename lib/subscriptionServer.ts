import { requireOrgContext } from "@/lib/orgServer";

/**
 * Doctrine-aligned subscription helper
 * - Treats subscription checks as *capability* checks (canDraft), not “upgrade” framing
 * - Avoids leaking unnecessary PII by default (email is not required for core gating)
 * - Fails CLOSED for gated endpoints if status is unknown (DB error / missing record)
 * - Considers trialing as active (unlock drafting) while keeping status available
 */

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | null;

type SubscriptionRow = {
  status: SubscriptionStatus;
  stripe_customer_id?: string | null;
};

export type SubscriptionStatusResult =
  | {
      ok: true;
      organizationId: string;
      status: SubscriptionStatus;
      isActive: boolean; // active OR trialing
      canDraft: boolean; // alias for doctrine-friendly capability checks
    }
  | {
      ok: false;
      organizationId: string;
      status: SubscriptionStatus; // null when unknown
      isActive: boolean | null; // null when unknown
      canDraft: boolean | null; // null when unknown
      error: string;
    };

function computeIsActive(status: SubscriptionStatus) {
  return status === "active" || status === "trialing";
}

/**
 * Lightweight read: checks whether drafting is unlocked for the org.
 * NOTE: do not use this to “market” billing states; it’s just capability.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatusResult> {
  const { supabase, organizationId } = await requireOrgContext();

  const { data, error } = await supabase
    .from("org_subscriptions")
    .select("status")
    .eq("organization_id", organizationId)
    .maybeSingle<SubscriptionRow>();

  if (error) {
    // Treat as unknown, not inactive
    console.error("[subscription] lookup error", error);
    return {
      ok: false,
      organizationId,
      status: null,
      isActive: null,
      canDraft: null,
      error: error.message,
    };
  }

  const status = (data?.status ?? null) as SubscriptionStatus;
  const isActive = computeIsActive(status);

  return {
    ok: true,
    organizationId,
    status,
    isActive,
    canDraft: isActive,
  };
}

/**
 * Gated endpoints should use this.
 * - If status is unknown (DB error), fail CLOSED.
 * - If inactive, return ok:false with status details (no “upgrade” language here).
 */
export async function requireActiveSubscription() {
  const s = await getSubscriptionStatus();

  if (!s.ok) {
    return {
      ok: false as const,
      organizationId: s.organizationId,
      status: s.status,
      isActive: s.isActive,
      canDraft: s.canDraft,
      error: s.error,
    };
  }

  if (!s.isActive) {
    return {
      ok: false as const,
      organizationId: s.organizationId,
      status: s.status,
      isActive: s.isActive,
      canDraft: s.canDraft,
    };
  }

  // If you want to return supabase for downstream use, grab it again
  const { supabase } = await requireOrgContext();

  return {
    ok: true as const,
    organizationId: s.organizationId,
    status: s.status,
    isActive: s.isActive,
    canDraft: s.canDraft,
    supabase,
  };
}
