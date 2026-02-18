// app/api/google/gbp/reviews/sync/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireOrgContext } from "@/lib/orgServer";
import { getAccessTokenFromRefreshToken } from "@/lib/googleOAuthServer";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// IMPORTANT: use Service Role on the server only
function supabaseAdmin() {
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const service = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, service, { auth: { persistSession: false } });
}

// Google often includes quota_limit_value "0" when GBP access isn't approved yet.
function looksLikeQuotaZero(detailText: string) {
  const t = String(detailText || "");
  return (
    (t.includes("quota_limit_value") && t.includes('"0"')) ||
    (t.includes("quota_limit_value") && t.includes(": 0")) ||
    t.includes("RESOURCE_EXHAUSTED")
  );
}

// When GBP access isn’t approved / permitted yet, you may see 403 with various messages.
function looksLikeGbpAccessPending403(detailText: string) {
  const t = String(detailText || "").toLowerCase();
  return (
    t.includes("has not been used in project") ||
    t.includes("is disabled") ||
    t.includes("access not configured") ||
    t.includes("not authorized") ||
    t.includes("permission denied") ||
    t.includes("insufficient permission") ||
    t.includes("the caller does not have permission") ||
    t.includes("google business profile api has not been used") ||
    t.includes("mybusiness") // often appears in these payloads
  );
}

function parseStarRating(v: any): number {
  if (typeof v === "number") return v;
  const s = String(v ?? "").toUpperCase();

  if (s === "ONE") return 1;
  if (s === "TWO") return 2;
  if (s === "THREE") return 3;
  if (s === "FOUR") return 4;
  if (s === "FIVE") return 5;

  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;

  return 0;
}

function extractGoogleReviewId(review: any): string | null {
  if (review?.reviewId) return String(review.reviewId);

  // review.name often looks like:
  // "accounts/123/locations/456/reviews/abcdefg"
  const name = review?.name ? String(review.name) : "";
  if (name.includes("/reviews/")) {
    const parts = name.split("/reviews/");
    const tail = parts[1]?.trim();
    if (tail) return tail;
  }

  if (name.includes("/")) {
    const tail = name.split("/").pop()?.trim();
    if (tail) return tail;
  }

  return null;
}

type Body = {
  google_location_id?: string; // optional: sync only one location
  pageSize?: number; // optional: default 50 (max 50)
  maxPages?: number; // optional: safety cap
};

type LocationRow = {
  google_account_id: string;
  google_location_id: string;
  google_location_name: string | null;
};

export async function POST(req: Request) {
  try {
    const ctx = await requireOrgContext();
    const orgId = ctx.organizationId;

    const supabase = supabaseAdmin();

    // Body is optional
    let body: Body = {};
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const filterLocationId = body?.google_location_id?.trim() || null;
    const pageSize = Math.min(Math.max(Number(body?.pageSize ?? 50), 1), 50);
    const maxPages = Math.min(Math.max(Number(body?.maxPages ?? 10), 1), 50); // safety cap

    // 1) Fetch refresh token for this org
    const { data: integ, error: integErr } = await supabase
      .from("google_integrations")
      .select("refresh_token")
      .eq("org_id", orgId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (integErr) {
      return NextResponse.json({ ok: false, error: integErr.message }, { status: 500 });
    }

    if (!integ?.refresh_token) {
      return NextResponse.json(
        {
          ok: false,
          code: "NO_GOOGLE_CONNECTION",
          error: "No Google connection yet. Complete OAuth connect first.",
        },
        { status: 400 }
      );
    }

    const { accessToken } = await getAccessTokenFromRefreshToken(integ.refresh_token);

    // 2) Load active saved GBP locations for the org
    let locQuery = supabase
      .from("google_gbp_locations")
      .select("google_account_id, google_location_id, google_location_name")
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("google_location_name", { ascending: true });

    if (filterLocationId) {
      locQuery = locQuery.eq("google_location_id", filterLocationId);
    }

    const { data: locations, error: locErr } = await locQuery;

    if (locErr) {
      return NextResponse.json({ ok: false, error: locErr.message }, { status: 500 });
    }

    if (!locations || locations.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: filterLocationId ? "No matching active location saved." : "No active locations saved yet.",
        },
        { status: 400 }
      );
    }

    const locs = locations as LocationRow[];

    // 2.5) Prefetch business ids for all location ids (faster + fewer queries)
    const locationIds = locs.map((l) => l.google_location_id);
    const { data: bizRows, error: bizErr } = await supabase
      .from("businesses")
      .select("id, google_location_id")
      .eq("organization_id", orgId)
      .in("google_location_id", locationIds);

    if (bizErr) {
      return NextResponse.json({ ok: false, error: bizErr.message }, { status: 500 });
    }

    const businessIdByLocation = new Map<string, string>();
    (bizRows ?? []).forEach((b: any) => {
      if (b?.google_location_id && b?.id) {
        businessIdByLocation.set(String(b.google_location_id), String(b.id));
      }
    });

    // If a business row is missing, that’s a setup issue (select route should have created it).
    // We’ll skip it rather than hard-fail the whole sync.
    let totalFetched = 0;
    let totalUpserted = 0;
    let locationsProcessed = 0;
    let locationsSkipped = 0;

    const errors: Array<{
      google_location_id: string;
      status?: number;
      code: string;
      message: string;
    }> = [];

    // 3) For each saved location, fetch reviews (paged) + upsert
    for (const loc of locs) {
      const google_account_id = String(loc.google_account_id);
      const google_location_id = String(loc.google_location_id);

      const businessId = businessIdByLocation.get(google_location_id);
      if (!businessId) {
        locationsSkipped += 1;
        errors.push({
          google_location_id,
          code: "MISSING_BUSINESS_ROW",
          message: "No businesses row found for this google_location_id (expected from locations/select upsert).",
        });
        continue;
      }

      locationsProcessed += 1;

      let pageToken = "";
      let pages = 0;

      while (pages < maxPages) {
        pages += 1;

        // GBP v4 reviews endpoint:
        // GET https://mybusiness.googleapis.com/v4/{parent=accounts/*/locations/*}/reviews
        const reviewsUrl = new URL(`https://mybusiness.googleapis.com/v4/${google_location_id}/reviews`);
        reviewsUrl.searchParams.set("pageSize", String(pageSize));
        reviewsUrl.searchParams.set("orderBy", "updateTime desc");
        if (pageToken) reviewsUrl.searchParams.set("pageToken", pageToken);

        const r = await fetch(reviewsUrl.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });

        const text = await r.text();

        if (!r.ok) {
          // ✅ Friendly: approval pending / quota=0 (429)
          if (r.status === 429 && looksLikeQuotaZero(text)) {
            return NextResponse.json(
              {
                ok: false,
                code: "GBP_ACCESS_PENDING",
                error:
                  "Google Business Profile API access is still pending approval for this project (quota appears to be 0). OAuth is connected successfully; review sync will work as soon as Google grants access.",
                detail: text,
              },
              { status: 429 }
            );
          }

          // ✅ Friendly: access not approved / disabled / not authorized (403)
          if (r.status === 403 && looksLikeGbpAccessPending403(text)) {
            return NextResponse.json(
              {
                ok: false,
                code: "GBP_ACCESS_PENDING",
                error:
                  "Google Business Profile API access is not available for this project/account yet (403). OAuth is connected; review sync will work once GBP API access is granted/enabled.",
                detail: text,
              },
              { status: 403 }
            );
          }

          // ✅ Skip invalid location (404) or other per-location failures without crashing the whole job
          if (r.status === 404) {
            locationsSkipped += 1;
            errors.push({
              google_location_id,
              status: 404,
              code: "LOCATION_NOT_FOUND",
              message: "Google returned 404 for this location. It may be invalid or no longer accessible.",
            });
            break; // stop paging this location
          }

          // Other errors: record and move on
          locationsSkipped += 1;
          errors.push({
            google_location_id,
            status: r.status,
            code: "REVIEWS_FETCH_FAILED",
            message: text || `Reviews fetch failed: ${r.status}`,
          });
          break;
        }

        let parsed: any = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = { raw: text };
        }

        const reviews = Array.isArray(parsed?.reviews) ? parsed.reviews : [];
        totalFetched += reviews.length;

        if (reviews.length > 0) {
          const now = new Date().toISOString();

          const rows = reviews
            .map((rv: any) => {
              const google_review_id = extractGoogleReviewId(rv);
              if (!google_review_id) return null;

              const rating = parseStarRating(rv?.starRating);
              const authorName =
                rv?.reviewer?.displayName ??
                rv?.reviewer?.name ??
                rv?.reviewer?.profileName ??
                null;

              const comment = rv?.comment ?? rv?.reviewText ?? null;
              const reviewDate = rv?.updateTime ?? rv?.createTime ?? null;

              return {
                organization_id: orgId,
                business_id: businessId,
                source: "google_gbp",
                google_review_id,
                rating: rating || 0,
                author_name: authorName ? String(authorName) : null,
                review_text: comment ? String(comment) : null,
                review_date: reviewDate ? String(reviewDate) : null,
                detected_language: rv?.languageCode ? String(rv.languageCode) : null,

                // helpful for multi-location
                google_account_id,
                google_location_id,

                raw: rv ?? {},
                created_at: now,
              };
            })
            .filter(Boolean) as any[];

          if (rows.length > 0) {
            const { error: upErr } = await supabase
              .from("reviews")
              .upsert(rows, { onConflict: "organization_id,source,google_review_id" });

            if (upErr) {
              errors.push({
                google_location_id,
                code: "REVIEWS_UPSERT_FAILED",
                message: upErr.message,
              });
              // don’t crash the whole job; stop paging this location
              break;
            }

            totalUpserted += rows.length;
          }
        }

        pageToken = parsed?.nextPageToken ? String(parsed.nextPageToken) : "";
        if (!pageToken) break;
      }
    }

    return NextResponse.json({
      ok: true,
      locations_total: locs.length,
      locations_processed: locationsProcessed,
      locations_skipped: locationsSkipped,
      total_fetched: totalFetched,
      total_upserted: totalUpserted,
      errors,
    });
  } catch (e: any) {
    const msg = e?.message ?? "Unknown server error";
    if (msg === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized. Please sign in again." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
