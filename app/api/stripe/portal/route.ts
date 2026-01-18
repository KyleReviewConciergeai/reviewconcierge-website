// app/api/stripe/portal/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { requireOrgContext } from "@/lib/orgServer";

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    // ✅ Pull Stripe customer id from org_subscriptions
    const { data: sub, error } = await supabase
      .from("org_subscriptions")
      .select("stripe_customer_id")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const customerId = sub?.stripe_customer_id ?? null;

    if (!customerId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No Stripe customer found for this organization. (org_subscriptions.stripe_customer_id is missing)",
        },
        { status: 400 }
      );
    }

    // ✅ Works in prod/preview/local without env vars
    const origin = req.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
