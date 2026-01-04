export const runtime = "nodejs";

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(_req: Request) {
  try {
    const { organizationId, supabase } = await requireOrgContext();

    const priceId = process.env.STRIPE_PRICE_ID;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.reviewconcierge.ai";

    if (!priceId) {
      return NextResponse.json(
        { ok: false, error: "Missing STRIPE_PRICE_ID" },
        { status: 500 }
      );
    }

    // Optional: get user email (nice-to-have for Stripe customer)
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email ?? undefined;

    // 1) Reuse existing Stripe customer if present
    const { data: existingSub } = await supabase
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;

    // 2) Create customer if missing; ensure org metadata exists
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

    // 3) Create Checkout Session (subscription) + set org metadata everywhere
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${siteUrl}/dashboard?billing=success`,
      cancel_url: `${siteUrl}/dashboard?billing=cancel`,
      metadata: { organization_id: organizationId },
      subscription_data: { metadata: { organization_id: organizationId } },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err: any) {
    console.error("[stripe-checkout] error", err?.message || err);
    return NextResponse.json(
      { ok: false, error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
