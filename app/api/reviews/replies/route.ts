// app/api/reviews/replies/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanUuid(v: unknown) {
  const s = cleanString(v, 80);
  // simple “uuid-ish” check; DB will enforce for real
  return s;
}

function parseRating(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return n;
}

type Status = "draft" | "copied" | "posted";

function parseStatus(v: unknown): Status | null {
  const s = cleanString(v, 20).toLowerCase();
  if (s === "draft" || s === "copied" || s === "posted") return s;
  return null;
}

/**
 * POST /api/reviews/replies
 * Create a reply record (draft)
 */
export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    const review_id = cleanUuid((body as any)?.review_id);
    const business_id = cleanUuid((body as any)?.business_id);
    const draft_text = cleanString((body as any)?.draft_text, 5000);

    const owner_language = cleanString((body as any)?.owner_language, 24) || null;
    const reviewer_language = cleanString((body as any)?.reviewer_language, 24) || null;

    const ratingRaw = parseRating((body as any)?.rating);
    const rating =
      Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? Math.round(ratingRaw) : null;

    if (!review_id) {
      return NextResponse.json({ ok: false, error: "review_id is required" }, { status: 400 });
    }
    if (!business_id) {
      return NextResponse.json({ ok: false, error: "business_id is required" }, { status: 400 });
    }
    if (!draft_text) {
      return NextResponse.json({ ok: false, error: "draft_text is required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("review_replies")
      .insert({
        organization_id: organizationId,
        business_id,
        review_id,
        draft_text,
        owner_language,
        reviewer_language,
        rating,
        status: "draft",
      })
      .select("id,created_at,status")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reply_record: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save reply" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/reviews/replies
 * Update status for a reply record (copied/posted)
 */
export async function PATCH(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    const id = cleanUuid((body as any)?.id);
    const status = parseStatus((body as any)?.status);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json({ ok: false, error: "status must be draft|copied|posted" }, { status: 400 });
    }

    const updates: any = { status };

    if (status === "copied") updates.copied_at = new Date().toISOString();
    if (status === "posted") updates.posted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("review_replies")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id,status,copied_at,posted_at,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reply_record: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to update reply" },
      { status: 500 }
    );
  }
}
