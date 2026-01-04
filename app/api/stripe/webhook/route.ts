export const runtime = "nodejs";

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Stripe client
 * - Do NOT set apiVersion here to avoid TS mismatch in stripe v20 types.
 * - Stripe will use your account’s default API version.
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

/**
 * Supabase admin client (service role)
 * IMPORTANT: service role key must only be used server-side.
 */
function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

/**
 * Idempotency: check if we already processed this event
 */
async function alreadyProcessedEvent(
  eventId: string,
  sb: ReturnType<typeof supabaseAdmin>
): Promise<boolean> {
  const { data, error } = await sb
    .from("stripe_events")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();

  if (error) {
    console.error("[stripe-webhook] idempotency check error", error);
    return false;
  }
  return !!data?.event_id;
}

/**
 * Idempotency: mark processed
 */
async function markEventProcessed(
  eventId: string,
  eventType: string,
  sb: ReturnType<typeof supabaseAdmin>
) {
  const { error } = await sb.from("stripe_events").insert({
    event_id: eventId,
    event_type: eventType,
  });

  // If duplicate PK insert happens, ignore.
  if (error) {
    const msg = String((error as any)?.message || "").toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("already exists")) {
      console.error("[stripe-webhook] mark processed error", error);
    }
  }
}

/**
 * Resolve org id from Stripe metadata
 * Priority:
 * 1) subscription.metadata.organization_id
 * 2) customer.metadata.organization_id (fallback)
 */
async function resolveOrganizationIdFromStripe(
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
    console.error("[stripe-webhook] failed to retrieve customer", customerId, err?.message || err);
  }

  return null;
}

/**
 * Upsert subscription state for org
 * Uses safe casts to avoid TS issues around current_period_end in some stripe type configs.
 */
async function upsertOrgSubscriptionFromSub(
  organizationId: string,
  sub: Stripe.Subscription,
  sb: ReturnType<typeof supabaseAdmin>
) {
  const customerId = typeof sub.customer === "string" ? sub.customer : null;
  const priceId =
    sub.items?.data?.[0]?.price?.id ?? null;

  const currentPeriodEnd = (sub as any).current_period_end as number | undefined;

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
  };

  const { error } = await sb.from("org_subscriptions").upsert(payload, {
    onConflict: "organization_id",
  });

  if (error) {
    console.error("[stripe-webhook] upsert org_subscriptions error", error, payload);
    throw error;
  }
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing STRIPE_WEBHOOK_SECRET" },
      { status: 500 }
    );
  }

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
    console.error("[stripe-webhook] signature verification failed", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Webhook signature verification failed" },
      { status: 400 }
    );
  }

  const sb = supabaseAdmin();

  // Idempotency check
  if (await alreadyProcessedEvent(event.id, sb)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  try {
    switch (event.type) {
      /**
       * MVP: subscription Checkout completion
       * Recommended: your Checkout Session should include metadata.organization_id
       */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const orgId =
          (session.metadata?.organization_id as string | undefined) ?? null;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;

        if (orgId && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          await upsertOrgSubscriptionFromSub(orgId, sub, sb);
        } else {
          console.log("[stripe-webhook] checkout.session.completed missing org/sub", {
            orgId,
            subscriptionId,
            customer: session.customer,
          });
        }
        break;
      }

      /**
       * MVP: subscription lifecycle events
       */
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;

        const orgId = await resolveOrganizationIdFromStripe(customerId, sub);

        if (!orgId) {
          console.warn("[stripe-webhook] subscription event missing organization_id", {
            type: event.type,
            subscription: sub.id,
            customer: customerId,
          });
          break;
        }

        await upsertOrgSubscriptionFromSub(orgId, sub, sb);
        break;
      }

      /**
       * Optional: use invoice events for future billing banners.
       * Subscription.updated generally reflects status changes already.
       */
      case "invoice.paid":
      case "invoice.payment_failed": {
        break;
      }

      default: {
        // ignore other events
        break;
      }
    }

    await markEventProcessed(event.id, event.type, sb);

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[stripe-webhook] handler error", event.type, err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
