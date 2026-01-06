export const runtime = "nodejs";

import Stripe from "stripe";
import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, {
      // apiVersion: "2024-06-20",
    })
  : null;

export async function POST(req: Request) {
  try {
    if (!stripe) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const { organizationId, supabase } = await requireOrgContext();

    const body = await req.json().catch(() => ({}));
    const sessionId = typeof body?.session_id === "string" ? body.session_id : "";

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "Missing session_id" }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "customer"],
    });

    // Safety: make sure this session belongs to the org (via metadata)
    const sessOrg = session?.metadata?.organization_id;
    if (sessOrg && sessOrg !== organizationId) {
      return NextResponse.json({ ok: false, error: "Session/org mismatch" }, { status: 403 });
    }

    const subscription =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : (session.subscription as Stripe.Subscription | null);

    if (!subscription) {
      return NextResponse.json({ ok: false, error: "Missing subscription on session" }, { status: 400 });
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : (session.customer as Stripe.Customer | null)?.id ?? null;

    // Update DB to match Stripe source of truth
    const status = (subscription.status ?? "incomplete") as string;

    const { error: upsertErr } = await supabase
      .from("org_subscriptions")
      .upsert(
        {
          organization_id: organizationId,
          stripe_customer_id: customerId,
          status,
        },
        { onConflict: "organization_id" }
      );

    if (upsertErr) {
      console.error("[stripe-sync] upsert error", upsertErr);
      return NextResponse.json({ ok: false, error: "Failed to update subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status }, { status: 200 });
  } catch (err: any) {
    console.error("[stripe-sync] error", err?.message || err);
    return NextResponse.json({ ok: false, error: "Failed to sync subscription" }, { status: 500 });
  }
}
