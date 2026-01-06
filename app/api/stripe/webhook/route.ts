export const runtime = "nodejs";

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase admin client (service role)
 * IMPORTANT: service role key must only be used server-side.
 */
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Idempotency: reserve event id (race-safe)
 * Insert the event row first; if duplicate, we consider it already processed OR in-flight.
 *
 * Doctrine tweak:
 * - If handler fails, we DELETE the reserved row so Stripe retries will process again.
 */
async function reserveEvent(
  sb: ReturnType<typeof supabaseAdmin>,
  eventId: string,
  eventType: string
): Promise<{ deduped: boolean }> {
  const { error } = await sb.from("stripe_events").insert({
    event_id: eventId,
    event_type: eventType,
  });

  if (!error) return { deduped: false };

  const msg = String((error as any)?.message || "").toLowerCase();
  const isDup = msg.includes("duplicate") || msg.includes("already exists");

  if (isDup) return { deduped: true };

  console.error("[stripe-webhook] reserveEvent error", { eventId, eventType, msg });
  throw error;
}

/**
 * If handler fails AFTER reservation, delete the reservation so Stripe retry can re-process.
 */
async function unreserveEvent(
  sb: ReturnType<typeof supabaseAdmin>,
  eventId: string
) {
  const { error } = await sb.from("stripe_events").delete().eq("event_id", eventId);
  if (error) {
    // Not fatal, but important: this may cause retry to dedupe/skip.
    console.error("[stripe-webhook] unreserveEvent failed", {
      eventId,
      error: (error as any)?.message || String(error),
    });
  }
}

/**
 * Resolve org id from Stripe metadata
 * Priority:
 * 1) subscription.metadata.organization_id
 * 2) customer.metadata.organization_id (fallback)
 */
async function resolveOrganizationIdFromStripe(
  stripe: Stripe,
  customerId?: string | null,
  subscription?: Stripe.Subscription | null
): Promise<string | null> {
  const orgFromSub =
    (subscription?.metadata?.organization_id as string | undefined) ?? null;
  if (orgFromSub) return orgFromSub;

  if (!customerId) return null;

  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer && !("deleted" in customer)) {
      const orgFromCustomer =
        (customer.metadata?.organization_id as string | undefined) ?? null;
      if (orgFromCustomer) return orgFromCustomer;
    }
  } catch (err: any) {
    console.error("[stripe-webhook] failed to retrieve customer", {
      customerId,
      error: err?.message || String(err),
    });
  }

  return null;
}

/**
 * Upsert subscription state for org
 * TS-SAFE: some Stripe type configs don't include current_period_end/cancel_at/canceled_at
 */
async function upsertOrgSubscriptionFromSub(
  sb: ReturnType<typeof supabaseAdmin>,
  organizationId: string,
  sub: Stripe.Subscription
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;

  // TS-safe timestamp reads
  const anySub = sub as any;
  const currentPeriodEnd =
    typeof anySub.current_period_end === "number" ? anySub.current_period_end : null;
  const cancelAt = typeof anySub.cancel_at === "number" ? anySub.cancel_at : null;
  const canceledAt = typeof anySub.canceled_at === "number" ? anySub.canceled_at : null;

  const payload = {
    organization_id: organizationId,
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status: sub.status,
    current_period_end: currentPeriodEnd
      ? new Date(currentPeriodEnd * 1000).toISOString()
      : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    cancel_at: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
    canceled_at: canceledAt ? new Date(canceledAt * 1000).toISOString() : null,
  };

  const { error } = await sb.from("org_subscriptions").upsert(payload, {
    onConflict: "organization_id",
  });

  if (error) {
    console.error("[stripe-webhook] upsert org_subscriptions error", {
      organizationId,
      subscriptionId: sub.id,
      status: sub.status,
      error: (error as any)?.message || String(error),
    });
    throw error;
  }
}

/**
 * Handle checkout session -> retrieve subscription -> upsert
 * Note: Checkout Session should include metadata.organization_id (you already do)
 */
async function handleCheckoutSession(
  stripe: Stripe,
  sb: ReturnType<typeof supabaseAdmin>,
  session: Stripe.Checkout.Session
) {
  const orgId = (session.metadata?.organization_id as string | undefined) ?? null;

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null;

  const customerId = typeof session.customer === "string" ? session.customer : null;

  if (!subscriptionId) {
    console.warn("[stripe-webhook] checkout session missing subscription id", {
      sessionId: session.id,
      orgId,
      customerId,
    });
    return;
  }

  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // Prefer org from subscription/customer metadata if session metadata missing
  const resolvedOrg =
    orgId || (await resolveOrganizationIdFromStripe(stripe, customerId, sub));

  if (!resolvedOrg) {
    console.warn("[stripe-webhook] checkout session could not resolve org id", {
      sessionId: session.id,
      subscriptionId,
      customerId,
    });
    return;
  }

  await upsertOrgSubscriptionFromSub(sb, resolvedOrg, sub);
}

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
  }
  if (!webhookSecret) {
    return NextResponse.json({ ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });
  }

  // Create Stripe client only after env checks (no empty-string client)
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  let event: Stripe.Event;

  // Stripe requires verifying signature against RAW request body
  try {
    const rawBody = await req.text();
    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return NextResponse.json(
        { ok: false, error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("[stripe-webhook] signature verification failed", err?.message || String(err));
    return NextResponse.json(
      { ok: false, error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  let sb: ReturnType<typeof supabaseAdmin>;
  try {
    sb = supabaseAdmin();
  } catch (e: any) {
    console.error("[stripe-webhook] supabase admin init failed", e?.message || String(e));
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  // Idempotency (race-safe): reserve event row first
  try {
    const reserved = await reserveEvent(sb, event.id, event.type);
    if (reserved.deduped) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Failed idempotency reservation" },
      { status: 500 }
    );
  }

  try {
    switch (event.type) {
      // Checkout completion variants
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutSession(stripe, sb, session);
        break;
      }

      // Subscription lifecycle
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;

        const orgId = await resolveOrganizationIdFromStripe(stripe, customerId, sub);
        if (!orgId) {
          console.warn("[stripe-webhook] subscription event missing organization_id", {
            type: event.type,
            subscriptionId: sub.id,
            customerId,
          });
          break;
        }

        await upsertOrgSubscriptionFromSub(sb, orgId, sub);
        break;
      }

      // Optional invoice events (no-op for MVP)
      case "invoice.paid":
      case "invoice.payment_failed": {
        break;
      }

      default: {
        // ignore other events
        break;
      }
    }

    return NextResponse.json({ ok: true });
} catch (err: any) {
  console.error("[stripe-webhook] handler error:", err?.message || err);
  return NextResponse.json(
    { ok: false, error: err?.message ?? String(err) ?? "Webhook handler failed" },
    { status: 500 }
  );
}
}
