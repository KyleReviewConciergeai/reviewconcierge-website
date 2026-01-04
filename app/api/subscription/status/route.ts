export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";

export async function GET() {
  try {
    const sub = await requireActiveSubscription();

    // requireActiveSubscription returns:
    // - ok true => includes status + org info (and supabase)
    // - ok false => includes status + org info
    const isActive = sub.ok === true;

    return NextResponse.json({
      ok: true,
      status: sub.status ?? null,
      // Provide both keys to avoid client mismatch
      isActive,
      active: isActive,
      organizationId: sub.organizationId,
      userEmail: sub.userEmail,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to check subscription" },
      { status: 500 }
    );
  }
}
