export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import crypto from "crypto";

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    rating?: number;
    user_ratings_total?: number;
    reviews?: Array<{
      author_name?: string;
      author_url?: string;
      language?: string;
      rating?: number;
      text?: string;
      time?: number; // unix seconds
    }>;
  };
};

type ReviewUpsertRow = {
  organization_id: string;
  business_id: string;
  source: "google";
  google_review_id: string;
  google_location_id: string; // ✅ C1/C3
  author_name: string | null;
  author_url: string | null;
  rating: number | null;
  review_text: string | null;
  review_date: string | null;
  detected_language: string | null;
  raw: unknown;
};

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

/**
 * Deterministic, short, low-collision ID derived from place + review payload.
 * (Places API doesn't give stable review IDs.)
 */
function makeGoogleReviewId(
  placeId: string,
  r: { author_name?: string; time?: number; rating?: number; text?: string }
) {
  const payload = JSON.stringify({
    p: placeId,
    t: typeof r.time === "number" ? r.time : null,
    a: (r.author_name ?? "").trim(),
    r: typeof r.rating === "number" ? r.rating : null,
    x: (r.text ?? "").trim(),
  });

  const hash = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 40);
  return `${placeId}:${hash}`.slice(0, 255);
}

async function upsertSyncStatus(params: {
  supabase: any;
  organizationId: string;
  google_location_id: string;
  source: "google_places";
  status: "success" | "error";
  errorMessage?: string | null;
  fetched?: number | null;
  inserted?: number | null;
  updated?: number | null;
}) {
  const {
    supabase,
    organizationId,
    google_location_id,
    source,
    status,
    errorMessage,
    fetched,
    inserted,
    updated,
  } = params;

  const nowIso = new Date().toISOString();

  try {
    await supabase.from("location_sync_status").upsert(
      {
        organization_id: organizationId,
        google_location_id,
        source,
        last_sync_at: nowIso,
        last_sync_status: status,
        last_sync_error: status === "error" ? (errorMessage ?? "Unknown error") : null,
        last_fetched: typeof fetched === "number" ? fetched : null,
        last_inserted: typeof inserted === "number" ? inserted : null,
        last_updated: typeof updated === "number" ? updated : null,
        updated_at: nowIso,
      },
      { onConflict: "organization_id,google_location_id,source" }
    );
  } catch {
    // best-effort; never fail the main request because of status bookkeeping
  }
}

export async function GET(req: Request) {
  // Best-effort C3 context so we can mark errors even if we exit early
  let orgCtx: { supabase: any; organizationId: string } | null = null;
  let placeIdForStatus: string | null = null;

  try {
    // 1) Org context
    const { supabase, organizationId } = await requireOrgContext();
    orgCtx = { supabase, organizationId };

    // 2) Subscription gating (unlock Google fetch)
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        {
          ok: false,
          upgradeRequired: true,
          status: sub.status ?? null,
          error: "Drafting isn’t unlocked yet.",
        },
        { status: 402 }
      );
    }

    const { searchParams } = new URL(req.url);
    const google_place_id_param = asString(searchParams.get("google_place_id")).trim();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    // 3) Resolve placeId
    let placeId = google_place_id_param;

    if (!placeId) {
      const { data: biz, error: bizErr } = await supabase
        .from("businesses")
        .select("id, google_place_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bizErr) {
        return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });
      }

      if (!biz?.google_place_id) {
        return NextResponse.json(
          {
            ok: false,
            error: "No connected Google Place ID found. Connect your business first.",
          },
          { status: 400 }
        );
      }

      placeId = biz.google_place_id;
    }

    placeIdForStatus = placeId;

    // 4) Find matching business row for org + placeId
    const { data: business, error: businessErr } = await supabase
      .from("businesses")
      .select("id, google_place_id")
      .eq("organization_id", organizationId)
      .eq("google_place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (businessErr) {
      return NextResponse.json({ ok: false, error: businessErr.message }, { status: 500 });
    }

    if (!business?.id || !business?.google_place_id) {
      return NextResponse.json(
        { ok: false, error: "No matching business found for this connected Place ID." },
        { status: 404 }
      );
    }

    const businessId = business.id as string;

    // 5) Fetch Place details (includes a limited set of recent reviews + summary metrics)
    const url =
      "https://maps.googleapis.com/maps/api/place/details/json" +
      `?place_id=${encodeURIComponent(placeId)}` +
      `&fields=name,rating,user_ratings_total,reviews` +
      `&key=${encodeURIComponent(apiKey)}`;

    const res = await fetch(url, { cache: "no-store" });
    const google = (await res.json()) as GooglePlaceDetailsResponse;

    if (google.status !== "OK") {
      // ✅ C3: mark sync error
      await upsertSyncStatus({
        supabase,
        organizationId,
        google_location_id: placeId,
        source: "google_places",
        status: "error",
        errorMessage: `${google.status}${google.error_message ? `: ${google.error_message}` : ""}`,
      });

      return NextResponse.json(
        { ok: false, googleStatus: google.status, googleError: google.error_message },
        { status: 502 }
      );
    }

    const googleRating = typeof google.result?.rating === "number" ? google.result.rating : null;
    const googleTotal =
      typeof google.result?.user_ratings_total === "number"
        ? google.result.user_ratings_total
        : null;
    const googleName = typeof google.result?.name === "string" ? google.result.name : null;

    // 5a) Update business row with summary stats
    const { error: bizUpdateErr } = await supabase
      .from("businesses")
      .update({
        google_rating: googleRating,
        google_user_ratings_total: googleTotal,
        google_place_name: googleName,
      })
      .eq("id", businessId)
      .eq("organization_id", organizationId);

    if (bizUpdateErr) {
      // ✅ C3: mark sync error (we did hit Google but failed locally)
      await upsertSyncStatus({
        supabase,
        organizationId,
        google_location_id: placeId,
        source: "google_places",
        status: "error",
        errorMessage: bizUpdateErr.message,
      });

      return NextResponse.json({ ok: false, error: bizUpdateErr.message }, { status: 500 });
    }

    const googleReviews = Array.isArray(google.result?.reviews) ? google.result!.reviews! : [];

    // Note: Places API returns a limited set of reviews (often recent / helpful), not full history.
    if (googleReviews.length === 0) {
      // ✅ C3: record a successful sync with 0 fetched
      await upsertSyncStatus({
        supabase,
        organizationId,
        google_location_id: placeId,
        source: "google_places",
        status: "success",
        fetched: 0,
        inserted: 0,
        updated: 0,
      });

      return NextResponse.json({
        ok: true,
        business_id: businessId,
        google_place_id: placeId,
        google_rating: googleRating,
        google_user_ratings_total: googleTotal,
        fetched: 0,
        upserted_total: 0,
        inserted: 0,
        updated: 0,
        fetched_at: new Date().toISOString(),
        note: "Google returned no reviews in this fetch.",
      });
    }

    // 6) Map → upsert rows
    const rows: ReviewUpsertRow[] = googleReviews.map((r) => ({
      organization_id: organizationId,
      business_id: businessId,
      source: "google",
      google_review_id: makeGoogleReviewId(placeId, r),
      google_location_id: placeId, // ✅ C1: always set it for Places
      author_name: r.author_name ?? null,
      author_url: r.author_url ?? null,
      rating: typeof r.rating === "number" ? r.rating : null,
      review_text: r.text ?? null,
      review_date: r.time ? new Date(r.time * 1000).toISOString() : null,
      detected_language: r.language ?? null,
      raw: r,
    }));

    // 6a) Pre-check existing IDs for inserted/updated counts
    const ids = rows.map((x) => x.google_review_id);

    const { data: existing, error: existingErr } = await supabase
      .from("reviews")
      .select("google_review_id")
      .eq("organization_id", organizationId)
      .eq("business_id", businessId)
      .eq("source", "google")
      .in("google_review_id", ids);

    if (existingErr) {
      await upsertSyncStatus({
        supabase,
        organizationId,
        google_location_id: placeId,
        source: "google_places",
        status: "error",
        errorMessage: existingErr.message,
      });

      return NextResponse.json({ ok: false, error: existingErr.message }, { status: 500 });
    }

    const existingSet = new Set((existing ?? []).map((r) => r.google_review_id));
    const inserted = rows.reduce(
      (acc, r) => acc + (existingSet.has(r.google_review_id) ? 0 : 1),
      0
    );
    const updated = rows.length - inserted;

    // 6b) Upsert
    const { data: savedPreview, error: saveErr } = await supabase
      .from("reviews")
      .upsert(rows, { onConflict: "organization_id,source,google_review_id" })
      .select("id, source, google_review_id, rating, author_name, review_date, detected_language")
      .limit(10);

    if (saveErr) {
      await upsertSyncStatus({
        supabase,
        organizationId,
        google_location_id: placeId,
        source: "google_places",
        status: "error",
        errorMessage: saveErr.message,
        fetched: rows.length,
        inserted,
        updated,
      });

      return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });
    }

    // ✅ C3: mark sync success with counts
    await upsertSyncStatus({
      supabase,
      organizationId,
      google_location_id: placeId,
      source: "google_places",
      status: "success",
      fetched: rows.length,
      inserted,
      updated,
    });

    return NextResponse.json({
      ok: true,
      business_id: businessId,
      google_place_id: placeId,
      google_rating: googleRating,
      google_user_ratings_total: googleTotal,
      fetched: rows.length,
      upserted_total: rows.length,
      inserted,
      updated,
      fetched_at: new Date().toISOString(),
      savedPreview: savedPreview ?? [],
      note: "This fetch may include only a limited set of reviews from Google (not full history).",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // ✅ C3: best-effort error status update if we have enough context
    if (orgCtx?.supabase && orgCtx.organizationId && placeIdForStatus) {
      await upsertSyncStatus({
        supabase: orgCtx.supabase,
        organizationId: orgCtx.organizationId,
        google_location_id: placeIdForStatus,
        source: "google_places",
        status: "error",
        errorMessage: message,
      });
    }

    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}