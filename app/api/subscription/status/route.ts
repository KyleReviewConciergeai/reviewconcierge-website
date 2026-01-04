export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";

export async function GET() {
  try {
    const sub = await requireActiveSubscription();

    const isActive = sub.ok === true;

    return NextResponse.json({
      ok: true,
      status: sub.status ?? null,
      isActive,
      active: isActive,
      organizationId: sub.organizationId,
      userEmail: sub.userEmail,
    });
  } catch (e: any) {
    // Treat "not subscribed" as a normal status response if your lib throws for it
    const msg = String(e?.message ?? "");
    const looksLikeInactive =
      msg.toLowerCase().includes("subscription") ||
      msg.toLowerCase().includes("not active") ||
      msg.toLowerCase().includes("upgrade");

    if (looksLikeInactive) {
      return NextResponse.json({
        ok: true,
        status: null,
        isActive: false,
        active: false,
      });
    }

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to check subscription" },
      { status: 500 }
    );
  }
}
