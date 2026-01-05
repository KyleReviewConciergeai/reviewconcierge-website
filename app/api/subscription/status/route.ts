export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";

/**
 * Doctrine-aligned subscription status endpoint
 * - Returns minimal, demo-safe status info
 * - Avoids leaking org/user identifiers to the client (not needed for UI)
 * - Never throws “scary” errors for normal inactive states
 */

type StatusResponse = {
  ok: boolean;
  isActive?: boolean;
  status?: string | null;
  error?: string;
};

export async function GET() {
  try {
    const sub = await requireActiveSubscription();

    // If your helper returns { ok: false } for inactive, treat as normal.
    if (!sub?.ok) {
      const body: StatusResponse = {
        ok: true,
        isActive: false,
        status: sub?.status ?? null,
      };
      return NextResponse.json(body, { status: 200 });
    }

    const body: StatusResponse = {
      ok: true,
      isActive: true,
      status: sub.status ?? "active",
    };

    return NextResponse.json(body, { status: 200 });
  } catch (e: any) {
    // If the underlying helper throws for common “inactive” scenarios,
    // normalize it into ok:true + isActive:false to keep the UI calm.
    const msg = String(e?.message ?? "");
    const m = msg.toLowerCase();

    const looksLikeInactive =
      m.includes("subscription") ||
      m.includes("not active") ||
      m.includes("inactive") ||
      m.includes("upgrade") ||
      m.includes("402");

    if (looksLikeInactive) {
      const body: StatusResponse = { ok: true, isActive: false, status: null };
      return NextResponse.json(body, { status: 200 });
    }

    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to check subscription" },
      { status: 500 }
    );
  }
}
