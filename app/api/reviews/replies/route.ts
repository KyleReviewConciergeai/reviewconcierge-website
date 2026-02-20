// app/api/reviews/replies/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanUuid(v: unknown) {
  return cleanString(v, 80);
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

function cleanLocationId(v: unknown) {
  // keep generous; GBP location resource names can be longer
  const s = cleanString(v, 240);
  return s || null;
}

/**
 * GET /api/reviews/replies
 * Quick ping to confirm the route exists in prod
 */
export async function GET() {
  return NextResponse.json({ ok: true, route: "reviews/replies" }, { status: 200 });
}

/**
 * POST /api/reviews/replies
 * Create a reply record (draft/copy/post)
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

    const status: Status = parseStatus((body as any)?.status) ?? "draft";

    // C1: accept location in either key (future-proof + backwards compatible)
    const google_location_id =
      cleanLocationId((body as any)?.google_location_id) ??
      cleanLocationId((body as any)?.location_id);

    if (!review_id) {
      return NextResponse.json({ ok: false, error: "review_id is required" }, { status: 400 });
    }
    if (!business_id) {
      return NextResponse.json({ ok: false, error: "business_id is required" }, { status: 400 });
    }
    if (!draft_text) {
      return NextResponse.json({ ok: false, error: "draft_text is required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const insertRow: any = {
      organization_id: organizationId,
      business_id,
      review_id,
      draft_text,
      owner_language,
      reviewer_language,
      rating,
      status,
      // C1 persistence
      google_location_id: google_location_id,
    };

    if (status === "copied") insertRow.copied_at = nowIso;
    if (status === "posted") insertRow.posted_at = nowIso;

    const { data, error } = await supabase
      .from("review_replies")
      .insert(insertRow)
      .select(
        "id,organization_id,business_id,review_id,google_location_id,draft_text,owner_language,reviewer_language,rating,status,copied_at,posted_at,created_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, hint: "review_replies insert failed" },
        { status: 500 }
      );
    }

    // If status is copied/posted, write event with FULL context
    let event_warning: string | null = null;

    if (status === "copied" || status === "posted") {
      // Optional: lookup google_review_id for the event
      let google_review_id: string | null = null;
      try {
        const { data: revRow } = await supabase
          .from("reviews")
          .select("google_review_id")
          .eq("organization_id", organizationId)
          .eq("id", review_id)
          .maybeSingle();

        if (revRow?.google_review_id) google_review_id = String(revRow.google_review_id);
      } catch {
        // ignore
      }

      const { error: evErr } = await supabase.from("review_reply_events").insert({
        organization_id: organizationId,
        review_id,
        google_review_id,
        // C1 persistence
        google_location_id: google_location_id,
        source: "app",
        rating,
        reviewer_language,
        owner_language,
        event_type: status, // "copied" | "posted"
        reply_text: draft_text,
      });

      if (evErr) event_warning = evErr.message;
    }

    return NextResponse.json({ ok: true, reply_record: data, event_warning }, { status: 200 });
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
 * Also logs an event with full context (no null placeholders).
 */
export async function PATCH(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    const id = cleanUuid((body as any)?.id);
    const status = parseStatus((body as any)?.status);

    // C1: allow passing location in PATCH too (optional)
    const google_location_id_patch =
      cleanLocationId((body as any)?.google_location_id) ??
      cleanLocationId((body as any)?.location_id);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    if (!status) {
      return NextResponse.json(
        { ok: false, error: "status must be draft|copied|posted" },
        { status: 400 }
      );
    }

    const updates: any = { status };
    const nowIso = new Date().toISOString();

    if (status === "copied") updates.copied_at = nowIso;
    if (status === "posted") updates.posted_at = nowIso;

    // If caller provided a location, persist it (future-proof)
    if (google_location_id_patch) updates.google_location_id = google_location_id_patch;

    // IMPORTANT: select the fields we need for the event (review_id, languages, rating, text, location)
    const { data, error } = await supabase
      .from("review_replies")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select(
        "id,organization_id,business_id,review_id,google_location_id,draft_text,owner_language,reviewer_language,rating,status,copied_at,posted_at,updated_at"
      )
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, hint: "review_replies update failed" },
        { status: 500 }
      );
    }

    // Log event ONLY for copied/posted, using the updated row context
    let event_warning: string | null = null;

    if (status === "copied" || status === "posted") {
      const review_id = data?.review_id ? String(data.review_id) : null;

      // Optional: lookup google_review_id from reviews
      let google_review_id: string | null = null;
      if (review_id) {
        try {
          const { data: revRow } = await supabase
            .from("reviews")
            .select("google_review_id")
            .eq("organization_id", organizationId)
            .eq("id", review_id)
            .maybeSingle();

          if (revRow?.google_review_id) google_review_id = String(revRow.google_review_id);
        } catch {
          // ignore
        }
      }

      const { error: evErr } = await supabase.from("review_reply_events").insert({
        organization_id: organizationId,
        review_id,
        google_review_id,
        // C1 persistence
        google_location_id: data?.google_location_id ?? null,
        source: "app",
        rating: typeof data?.rating === "number" ? data.rating : null,
        reviewer_language: data?.reviewer_language ?? null,
        owner_language: data?.owner_language ?? null,
        event_type: status,
        reply_text: data?.draft_text ?? null,
      });

      if (evErr) event_warning = evErr.message;
    }

    return NextResponse.json({ ok: true, reply_record: data, event_warning }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to update reply" },
      { status: 500 }
    );
  }
}
