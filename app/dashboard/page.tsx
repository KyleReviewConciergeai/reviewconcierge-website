"use client";

import { useEffect, useMemo, useState } from "react";
import DraftReplyPanel from "./DraftReplyPanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import SubscribeButton from "./SubscribeButton";

type Review = {
  id: string;
  source: string;
  google_review_id: string;
  rating: number | null;
  author_name: string | null;
  author_url: string | null;
  review_text: string | null;
  review_date: string | null;
  detected_language: string | null;
  created_at: string | null;
};

type ReviewsApiResponse = {
  ok: boolean;
  business?: { id: string; business_name?: string | null };
  count?: number;
  reviews?: Review[];
  error?: string;
  upgradeRequired?: boolean; // ✅ gate hint from API
};

type CurrentBusiness = {
  id: string;
  business_name?: string | null;
  google_place_id?: string | null;
  google_rating?: number | null;
  google_user_ratings_total?: number | null;
  google_place_name?: string | null;
};

type Toast = {
  message: string;
  type?: "success" | "error";
};

type PlaceIdStatus = "idle" | "loading" | "success" | "error";

type PlaceCandidate = {
  place_id: string;
  name: string;
  formatted_address?: string;
};

function formatDate(iso: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function stars(rating: number | null) {
  const r = typeof rating === "number" ? Math.max(0, Math.min(5, rating)) : 0;
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function DashboardPage() {
  const sb = supabaseBrowser();

  /**
   * Mendoza-ready copy + future GBP prep notes:
   * - Today: Places API = "recent sample" of reviews for demo.
   * - Phase 2: Google Business Profile API = full history sync + official replying/management.
   */
  const COPY = {
    refreshBtn: "Refresh from Google",
    refreshBtnLoading: "Refreshing…",
    refreshTooltipDisabled: "Connect your Google Place ID first",
    refreshTooltipEnabled:
      "Imports a recent sample of Google reviews for demo. Full history sync comes in Phase 2 via Google Business Profile.",
    demoLabelTooltip:
      "Demo mode: Places API returns a recent sample. Full review history sync comes in Phase 2 via Google Business Profile.",
  };

  // API data (reviews)
  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [actionLoading, setActionLoading] = useState<
    "reload" | "google" | "logout" | "connect" | null
  >(null);

  // "Last synced from Google" (only set on Google refresh success)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  // Current business (org-scoped)
  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);

  // Place ID onboarding
  const [placeIdInput, setPlaceIdInput] = useState("");
  const [placeVerify, setPlaceVerify] = useState<{
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  } | null>(null);

  // ✅ explicit onboarding UI states
  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);

  // ✅ iPhone-friendly search flow for Place ID
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);

  // Header
  const [userEmail, setUserEmail] = useState<string>("");

  // Filters
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const needsOnboarding = businessLoaded && (!business || !business.google_place_id);
  const hasGoogleConnected = !!business?.google_place_id;

  // ✅ subscription gating UI
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const showSubscribe = upgradeRequired; // keep it simple for now

  function showToast(t: Toast, ms = 3000) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

  async function loadReviews() {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    const json = (await res.json()) as ReviewsApiResponse;

    // ✅ recommended: if list endpoint is gated, surface subscribe immediately
    if ((res.status === 402 && (json as any)?.upgradeRequired) || json?.upgradeRequired) {
      setUpgradeRequired(true);
    }

    // ✅ if it’s OK and not gated, clear it
    if (res.ok && json?.ok && !json?.upgradeRequired) {
      setUpgradeRequired(false);
    }

    return json;
  }

  async function loadCurrentBusiness() {
    try {
      const res = await fetch("/api/businesses/current", { cache: "no-store" });
      const json = await res.json();

      if (res.ok && json?.ok) {
        const b = (json.business ?? null) as CurrentBusiness | null;
        setBusiness(b);
        setPlaceIdInput(b?.google_place_id ?? "");

        if (b?.google_place_id) {
          setPlaceIdStatus("success");
          setPlaceIdError(null);
        } else {
          setPlaceIdStatus("idle");
          setPlaceIdError(null);
        }
      } else {
        setPlaceIdStatus("idle");
      }
    } catch {
      setPlaceIdStatus("idle");
    } finally {
      setBusinessLoaded(true);
    }
  }

  async function reloadList() {
    if (actionLoading) return;
    try {
      setActionLoading("reload");
      const json = await loadReviews();
      setData(json);
      // NOTE: Do not set lastRefreshedAt here — it should reflect Google fetch time only.
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "Failed to load" });
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshFromGoogleThenReload() {
    if (actionLoading) return;

    if (!business?.google_place_id) {
      showToast(
        { message: "Connect your business first, then refresh from Google.", type: "error" },
        3500
      );
      return;
    }

    try {
      setActionLoading("google");

      const googleRes = await fetch("/api/reviews/google", { cache: "no-store" });
      const googleJson = await googleRes.json();

      // ✅ If gated, show subscribe CTA (and stop here)
      if (googleRes.status === 402 && googleJson?.upgradeRequired) {
        setUpgradeRequired(true);
        showToast(
          { message: "Your plan isn’t active yet — subscribe to enable Google sync.", type: "error" },
          4500
        );
        return;
      }

      // Normal error handling
      if (!googleRes.ok || !googleJson?.ok) {
        const raw =
          googleJson?.error ??
          googleJson?.googleError ??
          googleJson?.googleStatus ??
          "Google refresh failed";

        console.error("Google refresh failed:", raw, googleJson);

        showToast(
          {
            message: "Couldn’t refresh from Google right now. Please try again in a moment.",
            type: "error",
          },
          4500
        );
        return;
      }

      // ✅ If refresh succeeds, clear upgrade flag
      setUpgradeRequired(false);

      const fetched = Number(googleJson?.fetched ?? 0);
      const inserted = Number(googleJson?.inserted ?? 0);
      const updated = Number(googleJson?.updated ?? 0);
      const syncedAt =
        (googleJson?.synced_at as string | undefined) ?? new Date().toISOString();

      // Reload local list after sync
      const json = await loadReviews();
      setData(json);
      setLastRefreshedAt(syncedAt);

      // Sales-safe success messaging
      const msg =
        fetched === 0
          ? "Synced from Google • No recent reviews returned (totals verified)."
          : `Synced recent Google reviews • ${inserted} new, ${updated} updated (totals verified).`;

      showToast({ message: msg, type: "success" }, 3500);
    } catch (e: any) {
      console.error("Refresh from Google error:", e);

      showToast(
        { message: "Couldn’t refresh from Google right now. Please try again.", type: "error" },
        4500
      );
    } finally {
      setActionLoading(null);
    }
  }

  async function connectGooglePlaceId() {
    if (actionLoading) return;

    const placeId = placeIdInput.trim();
    if (!placeId) return;

    setPlaceIdStatus("loading");
    setPlaceIdError(null);
    setPlaceVerify(null);

    try {
      setActionLoading("connect");

      const res = await fetch("/api/businesses/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: placeId }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ??
          json?.googleError ??
          "We couldn’t verify this Place ID. Please double-check it and try again.";

        setPlaceIdStatus("error");
        setPlaceIdError(msg);
        showToast({ message: msg, type: "error" }, 4000);
        return;
      }

      setBusiness((json.business ?? null) as CurrentBusiness | null);
      setPlaceVerify(json.verified ?? null);
      setPlaceIdInput(json.business?.google_place_id ?? placeId);

      setPlaceIdStatus("success");
      setPlaceIdError(null);

      showToast(
        { message: `Connected: ${json?.verified?.name ?? "Place verified"}`, type: "success" },
        3000
      );

      // clear search UI after success (nice on mobile)
      setShowPlaceSearch(false);
      setPlaceSearchQuery("");
      setPlaceSearchResults([]);
      setPlaceSearchError(null);

      const r = await loadReviews();
      setData(r);
      // NOTE: Do not set lastRefreshedAt here — only set on actual Google fetch.
    } catch (e: any) {
      const msg = e?.message ?? "Network error verifying Place ID. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
      showToast({ message: msg, type: "error" }, 4000);
    } finally {
      setActionLoading(null);
    }
  }

  // ✅ server-side Places search (iPhone-friendly)
  async function searchPlaces() {
    const q = placeSearchQuery.trim();
    if (!q || actionLoading) return;

    setPlaceSearchLoading(true);
    setPlaceSearchError(null);
    setPlaceSearchResults([]);

    try {
      const res = await fetch(`/api/google/places-search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setPlaceSearchError(json?.error ?? "Search failed");
        return;
      }

      const candidates = Array.isArray(json?.candidates)
        ? (json.candidates as PlaceCandidate[])
        : [];
      setPlaceSearchResults(candidates);
    } catch (e: any) {
      setPlaceSearchError(e?.message ?? "Search failed");
    } finally {
      setPlaceSearchLoading(false);
    }
  }

  async function onLogout() {
    if (actionLoading) return;
    try {
      setActionLoading("logout");
      await sb.auth.signOut();
      window.location.href = "/login";
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);

        const { data: userData } = await sb.auth.getUser();
        setUserEmail(userData?.user?.email ?? "");

        await loadCurrentBusiness();

        const json = await loadReviews();
        setData(json);
      } catch (e: any) {
        setData({ ok: false, error: e?.message ?? "Failed to load" });
      } finally {
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reviews = data?.reviews ?? [];

  const filteredReviews = useMemo(() => {
    const q = query.trim().toLowerCase();

    return reviews.filter((r) => {
      const matchesRating =
        ratingFilter === "all"
          ? true
          : typeof r.rating === "number" && r.rating === ratingFilter;

      if (!matchesRating) return false;
      if (!q) return true;

      const haystack = [
        r.author_name ?? "",
        r.review_text ?? "",
        r.source ?? "",
        r.detected_language ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [reviews, ratingFilter, query]);

  const avgRating = useMemo(() => {
    const n = business?.google_rating;
    return typeof n === "number" ? n : null;
  }, [business?.google_rating]);

  const totalReviews = useMemo(() => {
    const n = business?.google_user_ratings_total;
    return typeof n === "number" ? n : null;
  }, [business?.google_user_ratings_total]);

  const lastReviewDate = useMemo(() => {
    if (reviews.length === 0) return null;
    const newest = reviews
      .map((r) => r.review_date ?? r.created_at)
      .filter(Boolean)
      .sort()
      .pop();
    return newest ?? null;
  }, [reviews]);

  const displayBusinessName =
    business?.business_name ??
    data?.business?.business_name ??
    (businessLoaded ? "Unknown" : "Loading…");

  const isPlaceConnectLoading = actionLoading === "connect" || placeIdStatus === "loading";

  function maskPlaceId(pid?: string | null) {
    if (!pid) return "";
    const s = String(pid);
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}…${s.slice(-4)}`;
  }

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Dashboard</h1>
        <p style={{ opacity: 0.8 }}>Loading…</p>

        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}
      </main>
    );
  }

  // ✅ Error view
  if (!data?.ok) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 6 }}>Dashboard</h1>
            {userEmail && (
              <div style={{ opacity: 0.7, fontSize: 13 }}>Signed in as {userEmail}</div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button onClick={reloadList} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "reload" ? "Reloading…" : "Reload list"}
            </button>

            <button
              onClick={refreshFromGoogleThenReload}
              disabled={actionLoading !== null || !business?.google_place_id}
              title={!business?.google_place_id ? COPY.refreshTooltipDisabled : COPY.refreshTooltipEnabled}
              style={buttonStyle}
            >
              {actionLoading === "google" ? COPY.refreshBtnLoading : COPY.refreshBtn}
            </button>

            {/* ✅ Optional nicer placement: only show when gated */}
            {showSubscribe && <SubscribeButton />}

            <button onClick={onLogout} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "logout" ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>

        {!business?.google_place_id && (
          <div style={{ marginTop: 10, opacity: 0.7, fontSize: 13 }}>
            🔒 Connect your business to enable “Refresh from Google”.
          </div>
        )}

        {data?.error && !toast && (
          <div
            className="rc-notice"
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.25)",
              background: "rgba(2,6,23,0.35)",
              color: "rgba(226,232,240,0.9)",
              fontSize: 13,
              lineHeight: 1.35,
            }}
          >
            <strong style={{ fontWeight: 700, opacity: 0.9 }}>Notice:</strong>{" "}
            {String(data.error)}
          </div>
        )}

        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}

        <style jsx>{`
          @media (max-width: 768px) {
            .rc-notice {
              display: none;
            }
          }
        `}</style>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Dashboard</h1>
          <div style={{ opacity: 0.8 }}>
            <div>
              <strong>Business:</strong> {displayBusinessName}
            </div>
            {userEmail && (
              <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>
                Signed in as {userEmail}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button
            onClick={reloadList}
            disabled={actionLoading !== null}
            style={{ ...buttonStyle, minWidth: 120, width: "100%", maxWidth: 220 }}
            title="Reload the current list from ReviewConcierge"
          >
            {actionLoading === "reload" ? "Reloading…" : "Reload list"}
          </button>

          <button
            onClick={refreshFromGoogleThenReload}
            disabled={actionLoading !== null || !business?.google_place_id}
            style={{
              ...buttonStyle,
              minWidth: 170,
              opacity: !business?.google_place_id ? 0.6 : 1,
            }}
            title={!business?.google_place_id ? COPY.refreshTooltipDisabled : COPY.refreshTooltipEnabled}
            aria-disabled={actionLoading !== null || !business?.google_place_id}
          >
            {actionLoading === "google" ? COPY.refreshBtnLoading : COPY.refreshBtn}
          </button>

          {/* ✅ Optional nicer placement: only show when gated */}
          {showSubscribe && <SubscribeButton />}

          <button
            onClick={onLogout}
            disabled={actionLoading !== null}
            style={{ ...buttonStyle, minWidth: 110 }}
            title="Sign out"
          >
            {actionLoading === "logout" ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>

      {/* Last synced (only meaningful after Google refresh) */}
      {hasGoogleConnected && lastRefreshedAt && (
        <div
          title="Shows when reviews were last fetched from Google"
          style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}
        >
          Last synced from Google: {new Date(lastRefreshedAt).toLocaleString()}
        </div>
      )}

      {/* ✅ Onboarding card */}
      {needsOnboarding && (
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            padding: 16,
            background: "#0f172a",
            color: "#e2e8f0",
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            Connect your Google Place ID
          </div>

          <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
            On iPhone: tap “Find my business”, select it, then verify & connect.
          </div>

          {/* ✅ iPhone-friendly business search */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={() => {
                setShowPlaceSearch((v) => !v);
                setPlaceSearchError(null);
                setPlaceSearchResults([]);
              }}
              disabled={isPlaceConnectLoading}
              style={{ ...buttonStyle, minWidth: 160 }}
            >
              {showPlaceSearch ? "Hide search" : "Find my business"}
            </button>

            <div style={{ fontSize: 12, opacity: 0.75 }}>
              Tip: search “name + city” (e.g. “Delfina Palo Alto”)
            </div>
          </div>

          {showPlaceSearch && (
            <div
              style={{
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 14,
                padding: 12,
                background: "rgba(2,6,23,0.35)",
                marginTop: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={placeSearchQuery}
                  onChange={(e) => setPlaceSearchQuery(e.target.value)}
                  placeholder="Business name + city"
                  disabled={placeSearchLoading || isPlaceConnectLoading}
                  style={{
                    flex: "1 1 260px",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "rgba(15,23,42,0.7)",
                    color: "inherit",
                    outline: "none",
                    opacity: placeSearchLoading ? 0.8 : 1,
                  }}
                />

                <button
                  onClick={searchPlaces}
                  disabled={placeSearchLoading || !placeSearchQuery.trim()}
                  style={{ ...buttonStyle, minWidth: 120 }}
                >
                  {placeSearchLoading ? "Searching…" : "Search"}
                </button>
              </div>

              {placeSearchError && (
                <div style={{ marginTop: 10, fontSize: 13, color: "#f87171" }}>
                  {placeSearchError}
                </div>
              )}

              {placeSearchResults.length > 0 && (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {placeSearchResults.map((p) => (
                    <button
                      key={p.place_id}
                      onClick={() => {
                        setPlaceIdInput(p.place_id);

                        if (placeIdStatus === "error") {
                          setPlaceIdStatus("idle");
                          setPlaceIdError(null);
                        }

                        setShowPlaceSearch(false);
                        showToast({ message: `Selected: ${p.name}`, type: "success" }, 2200);
                      }}
                      style={{
                        textAlign: "left",
                        padding: "12px 12px",
                        borderRadius: 14,
                        border: "1px solid rgba(148,163,184,0.25)",
                        background: "rgba(15,23,42,0.6)",
                        color: "#e2e8f0",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                      {p.formatted_address && (
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          {p.formatted_address}
                        </div>
                      )}
                      <div style={{ fontSize: 11, opacity: 0.55, marginTop: 8, fontFamily: "monospace" }}>
                        {p.place_id}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {placeSearchResults.length === 0 &&
                !placeSearchLoading &&
                placeSearchQuery.trim() &&
                !placeSearchError && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    No results yet — try adding the city/neighborhood.
                  </div>
                )}
            </div>
          )}

          {/* Place ID input + connect */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
            <input
              value={placeIdInput}
              onChange={(e) => {
                setPlaceIdInput(e.target.value);
                if (placeIdStatus === "error") {
                  setPlaceIdStatus("idle");
                  setPlaceIdError(null);
                }
              }}
              placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4"
              disabled={isPlaceConnectLoading}
              style={{
                flex: "1 1 320px",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                color: "inherit",
                outline: "none",
                opacity: isPlaceConnectLoading ? 0.7 : 1,
              }}
            />

            <button
              onClick={connectGooglePlaceId}
              disabled={actionLoading !== null || !placeIdInput.trim() || isPlaceConnectLoading}
              style={{ ...buttonStyle, minWidth: 160 }}
            >
              {isPlaceConnectLoading ? "Verifying…" : "Verify & Connect"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {placeIdStatus === "loading" && (
              <div style={{ fontSize: 13, opacity: 0.9 }}>Verifying Place ID…</div>
            )}

            {placeIdStatus === "error" && (
              <div style={{ fontSize: 13, color: "#f87171" }}>
                {placeIdError ?? "We couldn’t verify this Place ID. Please double-check and try again."}
              </div>
            )}

            {placeIdStatus === "success" && (
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
                Connected successfully ✔
              </div>
            )}
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            You can still paste a Place ID manually, but “Find my business” is best on iPhone.
          </div>

          {placeVerify?.name && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              Connected to: <strong>{placeVerify.name}</strong> ✔
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                You can now click “Refresh from Google” above to pull in reviews.
              </div>
              {typeof placeVerify.rating === "number" ? ` • ${placeVerify.rating}★` : ""}
              {typeof placeVerify.user_ratings_total === "number" ? ` • ${placeVerify.user_ratings_total} ratings` : ""}
            </div>
          )}
        </div>
      )}

      {/* ✅ Connected confirmation card + (Plan not active + Subscribe) */}
      {!needsOnboarding && hasGoogleConnected && (
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            padding: 16,
            background: "#0f172a",
            color: "#e2e8f0",
            marginTop: 16,
            marginBottom: 16,
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div style={{ minWidth: 260 }}>
            <div style={{ fontSize: 14, fontWeight: 700, display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ color: "#22c55e" }}>●</span>
              Google Connected
            </div>

            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.9 }}>
              <div style={{ marginBottom: 6 }}>
                <span style={{ opacity: 0.75 }}>Business:</span>{" "}
                <strong>{displayBusinessName}</strong>
              </div>

              <div>
                <span style={{ opacity: 0.75 }}>Place ID:</span>{" "}
                <span style={{ fontFamily: "monospace", opacity: 0.95 }}>
                  {maskPlaceId(business?.google_place_id)}
                </span>
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Use <strong>“Refresh from Google”</strong> above to sync a recent sample of reviews.
            </div>

            {/* ✅ Step 4: show Plan not active + Subscribe inside this card */}
            {showSubscribe && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                  Plan: Not active
                </div>
                <SubscribeButton />
              </div>
            )}
          </div>
        </div>
      )}

      {/* summary cards */}
      <div
        className="summary-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 20,
          marginBottom: 24,
        }}
      >
        {/* Average Rating */}
        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Average rating</div>
          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>from Google</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {avgRating === null ? "—" : clamp(avgRating, 0, 5).toFixed(2)}
            <span style={{ opacity: 0.75, fontSize: 14, marginLeft: 10 }}>
              {avgRating === null ? "" : stars(Math.round(avgRating))}
            </span>
          </div>
        </div>

        {/* Reviews */}
        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Reviews</div>
          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>total on Google</div>

          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {totalReviews ?? data.count ?? reviews.length}
            <span style={{ opacity: 0.75, fontSize: 13, marginLeft: 10 }}>
              • showing {filteredReviews.length}
            </span>
          </div>
        </div>

        {/* Last Refresh */}
        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Last refresh</div>

          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>
            {lastRefreshedAt ? formatDate(lastRefreshedAt) : "—"}
          </div>

          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
            Latest review updated
            {lastReviewDate ? ` • ${formatDate(lastReviewDate)}` : ""}
          </div>
        </div>
      </div>

      {/* ✅ Short, non-repetitive demo disclosure (single source of truth) */}
      {hasGoogleConnected ? (
        <div
          style={{
            marginTop: -12,
            marginBottom: 18,
            fontSize: 12,
            opacity: 0.72,
            lineHeight: 1.4,
          }}
          title={COPY.demoLabelTooltip}
        >
          Demo note: showing a recent sample of reviews (totals are verified). Full history sync arrives in Phase 2 via
          Google Business Profile.
        </div>
      ) : null}

      {/* ✅ Mobile stacking (scoped only to summary cards) */}
      <style jsx>{`
        @media (max-width: 768px) {
          .summary-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <DraftReplyPanel businessName={displayBusinessName === "Unknown" ? "" : displayBusinessName} />

      {/* filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>Rating</span>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={selectStyle}
          >
            <option value="all">All</option>
            <option value="5">5</option>
            <option value="4">4</option>
            <option value="3">3</option>
            <option value="2">2</option>
            <option value="1">1</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>Search</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="author, text, language…"
            style={inputStyle}
          />
        </div>

        <button
          onClick={() => {
            setRatingFilter("all");
            setQuery("");
          }}
          style={buttonStyle}
        >
          Clear
        </button>
      </div>

      {hasGoogleConnected ? (
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }} title={COPY.demoLabelTooltip}>
          Recent Google reviews (demo sample)
        </div>
      ) : null}

      {/* list */}
      {filteredReviews.length === 0 ? (
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            padding: 14,
            background: "rgba(2,6,23,0.35)",
            color: "rgba(226,232,240,0.92)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {reviews.length === 0 ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No reviews imported yet.</div>

              {!hasGoogleConnected ? (
                <div style={{ opacity: 0.85 }}>
                  Connect your business first, then click <strong>“Refresh from Google”</strong> to import a recent
                  sample of reviews.
                </div>
              ) : (
                <div style={{ opacity: 0.85 }}>
                  Click <strong>“Refresh from Google”</strong> to import a recent sample of reviews for demo purposes.
                </div>
              )}

              {/* ✅ Step 4: subscribe CTA in the empty state */}
              {showSubscribe && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                    Plan: Not active
                  </div>
                  <SubscribeButton />
                </div>
              )}

              {hasGoogleConnected ? (
                <div style={{ marginTop: 10, opacity: 0.7 }}>
                  Demo note: showing a recent sample. Full history sync arrives in Phase 2 (Google Business Profile).
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>No results for these filters.</div>
              <div style={{ opacity: 0.85 }}>
                Try clearing filters or searching a shorter keyword (author name, “service”, “wine”, etc.).
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => {
                    setRatingFilter("all");
                    setQuery("");
                  }}
                  style={{ ...buttonStyle, padding: "10px 14px", borderRadius: 10 }}
                >
                  Clear filters
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredReviews.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>
                    {stars(r.rating)}
                    <span style={{ opacity: 0.7, marginLeft: 8, fontWeight: 600 }}>
                      {typeof r.rating === "number" ? r.rating.toFixed(0) : "—"}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, opacity: 0.9 }}>
                    {r.author_url ? (
                      <a
                        href={r.author_url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: "inherit", textDecoration: "underline", textUnderlineOffset: 3 }}
                      >
                        {r.author_name ?? "Anonymous"}
                      </a>
                    ) : (
                      <span>{r.author_name ?? "Anonymous"}</span>
                    )}
                  </div>

                  {r.detected_language && (
                    <span
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        border: "1px solid rgba(148,163,184,0.25)",
                        padding: "2px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {r.detected_language}
                    </span>
                  )}
                </div>

                <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: "nowrap" }}>
                  {formatDate(r.review_date ?? r.created_at)}
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5, opacity: 0.92 }}>
                {r.review_text ? r.review_text : <span style={{ opacity: 0.6 }}>No review text.</span>}
              </div>

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.6 }}>
                Source: {r.source}
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div style={toastStyle(toast.type)} aria-live="polite">
          {toast.message}
        </div>
      )}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  cursor: "pointer",
  color: "#e2e8f0",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  padding: 14,
  background: "#0f172a",
  color: "#e2e8f0",
};

const selectStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 240,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0",
  outline: "none",
};

function toastStyle(type?: "success" | "error"): React.CSSProperties {
  return {
    position: "fixed",
    bottom: 24,
    right: 24,
    padding: "12px 16px",
    borderRadius: 12,
    background: type === "error" ? "rgba(220,38,38,0.95)" : "rgba(15,23,42,0.95)",
    color: "#fff",
    fontSize: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    zIndex: 1000,
    maxWidth: 360,
  };
}
