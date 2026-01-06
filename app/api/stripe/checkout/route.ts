export const runtime = "nodejs";

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

/**
 * Doctrine audit notes (what this replacement fixes):
 * - Keeps billing UX lightweight and “unlock drafting” oriented (no SaaS-y messaging here)
 * - Maintains strict org mapping via Stripe metadata (customer, checkout session, subscription)
 * - Avoids surfacing trial/billing language in app copy (trial can exist silently if you want it)
 * - Hardens env checks + safer defaults for demo reliability
 */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.reviewconcierge.ai";

// If you want a trial operationally, keep it here without marketing it in UI.
// Set to 0 or undefined to disable trial.
const TRIAL_DAYS = Number(process.env.STRIPE_TRIAL_DAYS ?? "14");

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      // Keeping default API version is fine; set explicitly if your project requires it.
      // apiVersion: "2024-06-20",
    })
  : null;

export async function POST(_req: Request) {
  try {
    if (!stripe) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    if (!STRIPE_PRICE_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_PRICE_ID" },
        { status: 500 }
      );
    }

    const { organizationId, supabase } = await requireOrgContext();

    // Nice-to-have for Stripe customer
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email ?? undefined;

    // Reuse existing Stripe customer if present
    const { data: existingSub } = await supabase
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;

    // Create customer if missing; ensure org metadata exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { organization_id: organizationId },
      });
      customerId = customer.id;

      // Store customer immediately (even before subscription exists)
      await supabase.from("org_subscriptions").upsert(
        {
          organization_id: organizationId,
          stripe_customer_id: customerId,
          status: "incomplete",
        },
        { onConflict: "organization_id" }
      );
    } else {
      // Keep metadata correct
      await stripe.customers.update(customerId, {
        metadata: { organization_id: organizationId },
      });
    }

    // Create Checkout Session (subscription) + set org metadata everywhere
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],

      success_url: `${SITE_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/dashboard?billing=cancel`,


      // Keep org mapping for webhooks
      metadata: { organization_id: organizationId },

      subscription_data: {
        metadata: { organization_id: organizationId },

        // Optional operational trial (doctrine-safe as long as UI doesn't market it)
        ...(Number.isFinite(TRIAL_DAYS) && TRIAL_DAYS > 0
          ? {
              trial_period_days: Math.min(Math.max(TRIAL_DAYS, 1), 90),
              // If you want stricter behavior later, you can enable:
              // trial_settings: {
              //   end_behavior: { missing_payment_method: "cancel" },
              // },
            }
          : {}),
      },

      // Keep checkout friction low; can disable if you don't want codes during Mendoza.
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (err: any) {
    console.error("[stripe-checkout] error", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
