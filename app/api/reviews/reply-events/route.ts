// app/api/reviews/reply-event/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLanguage(v: unknown) {
  const raw = cleanString(v, 20) || "";
  return raw.slice(0, 12).toLowerCase();
}

function parseRating(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return n;
}

type Body = {
  event_type?: "drafted" | "copied" | "posted";
  review_id?: string | null; // internal reviews.id if available
  google_review_id?: string | null;
  source?: string | null;
  rating?: number | string | null;
  reviewer_language?: string | null;
  owner_language?: string | null;
  reply_text?: string | null;
};

export async function POST(req: Request) {
  try {
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        { ok: false, upgradeRequired: true, error: "Upgrade required" },
        { status: 402 }
      );
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const event_type = body.event_type;
    if (event_type !== "drafted" && event_type !== "copied" && event_type !== "posted") {
      return NextResponse.json({ ok: false, error: "event_type must be drafted|copied|posted" }, { status: 400 });
    }

    const { supabase, organizationId } = await requireOrgContext();

    const review_id = cleanString(body.review_id, 80) || null;
    const google_review_id = cleanString(body.google_review_id, 120) || null;
    const source = cleanString(body.source, 40) || null;
    const reviewer_language = cleanLanguage(body.reviewer_language) || null;
    const owner_language = cleanLanguage(body.owner_language) || null;

    const ratingNum = parseRating(body.rating);
    const rating =
      Number.isFinite(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? Math.round(ratingNum) : null;

    const reply_text = cleanString(body.reply_text, 2000) || null;

    const { error } = await supabase.from("review_reply_events").insert({
      organization_id: organizationId,
      review_id: review_id,
      google_review_id,
      source,
      rating,
      reviewer_language,
      owner_language,
      event_type,
      reply_text,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error: "Failed to log reply event", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    console.error("REPLY-EVENT ERROR:", err);
    const message = err instanceof Error ? err.message : "Server error logging reply event";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
