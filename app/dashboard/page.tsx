"use client";

import React, { useEffect, useMemo, useState } from "react";
import DraftReplyPanel from "./DraftReplyPanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import SubscribeButton from "./SubscribeButton";
import { startCheckout } from "@/lib/startCheckout";

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
  upgradeRequired?: boolean; // gate hint from API
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

type ReviewStatus = "needs_reply" | "drafted" | "handled";

type ReviewLocalState = {
  status: ReviewStatus;
  updatedAt: string;
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
  const r0 = typeof rating === "number" ? rating : 0;
  const r = Math.round(Math.max(0, Math.min(5, r0)));
  return "★★★★★☆☆☆☆☆".slice(5 - r, 10 - r);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export default function DashboardPage() {
  const sb = supabaseBrowser();

  /**
   * Pre-Mendoza doctrine alignment:
   * - This space is for reading guest feedback and drafting replies in the owner’s voice.
   * - RC drafts. The owner edits and posts.
   * - No automation language. No “Phase 2” promises. No “workflow” framing.
   */
  const COPY = {
    title: "Your reviews",
    subtitle:
      "Read what guests wrote, then write a short reply in your own voice. You can edit it before posting.",
    reloadBtn: "Reload",
    reloadBtnLoading: "Reloading…",

    // ✅ Make “sample” explicit (Places limitation)
    syncBtn: "Refresh sample (Google Places)",
    syncBtnLoading: "Refreshing…",
    syncTooltipDisabled: "Connect your Google business first",
    syncTooltipEnabled:
      "Google Places provides a small sample of reviews (not always the latest). You can also paste any review to draft instantly.",

    connectHeader: "Connect Google reviews",
    connectBody:
      "This links your business so we can bring in a small sample of your Google reviews for drafting replies. Nothing is posted on your behalf.",
    connectBodyChange:
      "Paste a different Google Place ID to switch which business/location you’re connected to. Nothing is posted on your behalf.",
    connectTip: "Tip: search “business name + city”.",
    connectBtn: "Verify & Connect",
    connectBtnLoading: "Verifying…",
    changePlaceBtn: "Change Place ID",
    cancelChangePlaceBtn: "Cancel",

    connectedLabel: "Google connected",
    connectedHelp:
      "Use “Refresh sample (Google Places)” to bring in a small sample. You’ll always review and choose what to post.",
    planLockedTitle: "Google sync is currently locked",
    planLockedBody:
      "To bring in reviews from Google, you’ll need an active plan. Drafting and editing stays fully in your control.",

    emptyTitle: "No reviews here yet.",
    emptyBodyNoGoogle:
      "Connect your business, then refresh a sample of Google reviews to start drafting replies in your voice.",
    emptyBodyHasGoogle:
      "Refresh a sample of Google reviews to start drafting a few replies in your voice.",

    filtersRating: "Rating",
    filtersSearch: "Search",
    filtersClear: "Clear",
    filtersStatus: "Status",
    statusAll: "All",
    statusNeeds: "Needs reply",
    statusDrafted: "Drafted",
    statusHandled: "Handled",

    listLabel: "Sample from Google (Places)",
    listLabelNote: "Google Places returns a limited sample (not always the latest).",
    whyLink: "Why not all reviews?",
    whyTitle: "Why not all reviews?",
    whyBody:
      "Google Places returns a limited sample of reviews. It may not include the newest review, and the number can vary by business. You can still reply fast by pasting any review into the draft box above.",
    whyFooter:
      "Full “latest reviews inbox” syncing is enabled when the Google Business Profile (GBP) API is approved.",

    // Per-review actions
    actionDraftReply: "Draft reply",
    actionMarkHandled: "Mark handled",
    actionMarkNeeds: "Mark needs reply",
    actionCopyReview: "Copy review",

    selectHelp:
      "Selected review sent to the draft area above. You can tweak the reply before you post anywhere.",
  };

  // API data (reviews)
  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [actionLoading, setActionLoading] = useState<
    "reload" | "google" | "logout" | "connect" | null
  >(null);

  // "Last fetched from Google" (only set on Google fetch success)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  // Current business (org-scoped)
  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);

  // subscription gating UI
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null);

  // Place ID onboarding
  const [placeIdInput, setPlaceIdInput] = useState("");
  const [placeVerify, setPlaceVerify] = useState<{
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  } | null>(null);

  // explicit onboarding UI states
  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);

  // iPhone-friendly search flow for Place ID
  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);

  // ✅ allow switching Place ID even when already connected
  const [showChangePlaceId, setShowChangePlaceId] = useState(false);

  // Header
  const [userEmail, setUserEmail] = useState<string>("");

  // Filters
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");

  // Local per-review state (status only)
  const [reviewLocal, setReviewLocal] = useState<Record<string, ReviewLocalState>>({});
  const [whyOpen, setWhyOpen] = useState(false);

  // Selected review (for “Draft reply” button)
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const storageKey = useMemo(() => {
    // business scope helps prevent cross-business collisions on same browser
    return `rc_review_state:${business?.id ?? "unknown"}`;
  }, [business?.id]);

  // Derived flags
  const needsOnboarding = businessLoaded && (!business || !business.google_place_id);
  const hasGoogleConnected = !!business?.google_place_id;

  // ✅ show connect UI if onboarding OR user toggled “Change Place ID”
  const showConnectCard = needsOnboarding || showChangePlaceId;

  // single source of truth:
  // - subscriptionActive === false => show subscribe
  // - upgradeRequired === true => also show subscribe (fallback)
  // - null => unknown yet (first load), do not show
  const showSubscribe = subscriptionActive === false || upgradeRequired === true;

  function showToast(t: Toast, ms = 3000) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

  // Load local state once business is known (or changes)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = safeJsonParse<Record<string, ReviewLocalState>>(raw);
      if (parsed && typeof parsed === "object") setReviewLocal(parsed);
    } catch {
      // ignore
    }
  }, [storageKey]);

  // Persist local state
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(reviewLocal));
    } catch {
      // ignore
    }
  }, [reviewLocal, storageKey]);

  function getLocalState(id: string): ReviewLocalState {
    const existing = reviewLocal[id];
    if (existing) return existing;
    return { status: "needs_reply", updatedAt: new Date().toISOString() };
  }

  function setLocalState(id: string, patch: Partial<ReviewLocalState>) {
    setReviewLocal((prev) => {
      const current = prev[id] ?? getLocalState(id);
      const next: ReviewLocalState = {
        status: patch.status ?? current.status,
        updatedAt: new Date().toISOString(),
      };
      return { ...prev, [id]: next };
    });
  }

  async function redirectToCheckout() {
    // keep UI consistent immediately
    setUpgradeRequired(true);
    setSubscriptionActive(false);

    try {
      // After Stripe, route them to connect Google (not back to dashboard)
      await startCheckout("/connect/google");
    } catch (e: any) {
      console.error("startCheckout failed:", e);
      showToast(
        {
          message: "Couldn’t start checkout right now. Please try again in a moment.",
          type: "error",
        },
        4500
      );
    }
  }

  /**
   * After Stripe success redirect back to /dashboard?session_id=...
   * - sync the Stripe session server-side
   * - then clean the URL so refresh doesn't re-sync
   */
  async function syncStripeIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (!sessionId) return;

    try {
      await fetch("/api/stripe/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
    } catch (e) {
      console.error("[dashboard] stripe sync failed", e);
    } finally {
      params.delete("session_id");
      const clean = `${window.location.pathname}${
        params.toString() ? `?${params.toString()}` : ""
      }`;
      window.history.replaceState({}, "", clean);
    }
  }

  async function loadReviews() {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    const json = (await res.json()) as ReviewsApiResponse;

    // If backend explicitly says gated, honor it.
    if (res.status === 402 || json?.upgradeRequired) {
      setUpgradeRequired(true);
      setSubscriptionActive(false);
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

  async function loadSubscriptionStatus() {
    try {
      const res = await fetch("/api/subscription/status", { cache: "no-store" });
      const json = await res.json();

      // expects: { ok: true, isActive: boolean, status: string|null }
      if (res.ok && json?.ok) {
        const isActive = !!json?.isActive;
        setSubscriptionActive(isActive);
        setUpgradeRequired(!isActive);
        return;
      }

      // If endpoint fails, don't hard-block UI
      setSubscriptionActive(null);
      setUpgradeRequired(false);
    } catch {
      setSubscriptionActive(null);
      setUpgradeRequired(false);
    }
  }

  async function reloadList() {
    if (actionLoading) return;
    try {
      setActionLoading("reload");
      const json = await loadReviews();
      setData(json);
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "Failed to load" });
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshFromGoogleThenReload() {
    if (actionLoading) return;

    if (!business?.google_place_id) {
      showToast({ message: "Connect your Google business first.", type: "error" }, 3500);
      return;
    }

    // If we already know they're locked, don't bother calling Google sync.
    if (subscriptionActive === false || upgradeRequired === true) {
      await redirectToCheckout();
      return;
    }

    try {
      setActionLoading("google");

      const googleRes = await fetch("/api/reviews/google", { cache: "no-store" });
      const googleJson = await googleRes.json();

      if (googleRes.status === 402 || googleJson?.upgradeRequired) {
        await redirectToCheckout();
        return;
      }

      if (!googleRes.ok || !googleJson?.ok) {
        console.error("Google refresh failed:", googleJson);
        showToast(
          { message: "Couldn’t refresh right now. Please try again.", type: "error" },
          4500
        );
        return;
      }

      const fetched = Number(googleJson?.fetched ?? 0);
      const inserted = Number(googleJson?.inserted ?? 0);
      const updated = Number(googleJson?.updated ?? 0);
      const syncedAt =
        (googleJson?.synced_at as string | undefined) ?? new Date().toISOString();

      const json = await loadReviews();
      setData(json);
      setLastRefreshedAt(syncedAt);

      const msg =
        fetched === 0
          ? "Refreshed sample • No reviews returned from Google Places."
          : `Refreshed sample • ${inserted} new, ${updated} updated.`;

      showToast({ message: msg, type: "success" }, 3500);
    } catch (e: any) {
      console.error("Refresh from Google error:", e);
      showToast({ message: "Couldn’t refresh right now. Please try again.", type: "error" }, 4500);
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
        2800
      );

      // clear search UI after success (nice on mobile)
      setShowPlaceSearch(false);
      setPlaceSearchQuery("");
      setPlaceSearchResults([]);
      setPlaceSearchError(null);

      // ✅ auto-close “Change Place ID” mode after a successful connect
      setShowChangePlaceId(false);

      const r = await loadReviews();
      setData(r);
    } catch (e: any) {
      const msg = e?.message ?? "Network error verifying Place ID. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
      showToast({ message: msg, type: "error" }, 4000);
    } finally {
      setActionLoading(null);
    }
  }

  // server-side Places search (iPhone-friendly)
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

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (res.status === 402 || json?.upgradeRequired) {
        setPlaceSearchLoading(false);
        setPlaceSearchError(null);
        setPlaceSearchResults([]);
        await redirectToCheckout();
        return;
      }

      if (!res.ok || !json?.ok) {
        setPlaceSearchError(json?.error ?? "Search failed");
        return;
      }

      const candidates = Array.isArray(json?.candidates)
        ? (json.candidates as PlaceCandidate[])
        : [];

      setPlaceSearchResults(candidates);
    } catch (e: any) {
      console.error("[dashboard] places search error:", e);
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

        await syncStripeIfNeeded();
        await loadSubscriptionStatus();
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

  // Ensure we have a local state entry for reviews we see (non-destructive)
  useEffect(() => {
    if (!reviews?.length) return;

    setReviewLocal((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of reviews) {
        if (!next[r.id]) {
          next[r.id] = {
            status: "needs_reply",
            updatedAt: new Date().toISOString(),
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews?.length]);

  const filteredReviews = useMemo(() => {
    const q = query.trim().toLowerCase();

    return reviews.filter((r) => {
      const matchesRating =
        ratingFilter === "all"
          ? true
          : typeof r.rating === "number" && r.rating === ratingFilter;

      if (!matchesRating) return false;

      const local = getLocalState(r.id);
      const matchesStatus = statusFilter === "all" ? true : local.status === statusFilter;
      if (!matchesStatus) return false;

      if (!q) return true;

      const haystack = [
        r.author_name ?? "",
        r.review_text ?? "",
        r.source ?? "",
        r.detected_language ?? "",
        local.status ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews, ratingFilter, query, statusFilter, reviewLocal]);

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

  async function copyReviewToClipboard(review: Review) {
    const text = (review.review_text ?? "").trim();
    if (!text) {
      showToast({ message: "No review text to copy.", type: "error" }, 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);

      // Existing event (kept)
      window.dispatchEvent(
        new CustomEvent("rc:copy-review", {
          detail: {
            reviewText: text,
            rating: review.rating ?? null,
            authorName: review.author_name ?? null,
          },
        })
      );

      showToast({ message: "Copied review to clipboard.", type: "success" }, 2200);
    } catch (e) {
      console.error("clipboard copy failed:", e);
      showToast(
        { message: "Couldn’t copy automatically — please copy manually.", type: "error" },
        3500
      );
    }
  }

  function selectReviewForDraft(review: Review) {
    const text = (review.review_text ?? "").trim();
    if (!text) {
      showToast({ message: "No review text to draft from.", type: "error" }, 2500);
      return;
    }

    setSelectedReviewId(review.id);

    // Mark as "drafted" when user begins drafting (saved locally)
    setLocalState(review.id, { status: "drafted" });

    // ✅ DraftReplyPanel expects: { reviewId, text, rating, authorName, createdAt, language, source }
    window.dispatchEvent(
      new CustomEvent("rc:select-review", {
        detail: {
          reviewId: review.id,
          text,
          rating: review.rating ?? 0,
          authorName: review.author_name ?? null,
          createdAt: review.review_date ?? review.created_at ?? null,
          language: review.detected_language ?? null,
          source: review.source ?? null,
        },
      })
    );

    // Also copy for convenience (fastest path)
    copyReviewToClipboard(review).catch(() => null);
    showToast({ message: COPY.selectHelp, type: "success" }, 3000);

    // Scroll to drafting panel smoothly (best-effort)
    window.setTimeout(() => {
      const el = document.getElementById("rc-draft-panel-anchor");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function statusLabel(s: ReviewStatus) {
    if (s === "needs_reply") return COPY.statusNeeds;
    if (s === "drafted") return COPY.statusDrafted;
    return COPY.statusHandled;
  }

  function statusColor(s: ReviewStatus) {
    if (s === "handled") return "rgba(34,197,94,0.22)";
    if (s === "drafted") return "rgba(59,130,246,0.18)";
    return "rgba(251,191,36,0.16)";
  }

  function statusBorder(s: ReviewStatus) {
    if (s === "handled") return "rgba(34,197,94,0.35)";
    if (s === "drafted") return "rgba(59,130,246,0.30)";
    return "rgba(251,191,36,0.28)";
  }

  if (loading) {
    return (
      <>
        <h1 style={{ fontSize: 24, marginBottom: 10 }}>{COPY.title}</h1>
        <p style={{ opacity: 0.8 }}>{COPY.subtitle}</p>

        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}
      </>
    );
  }

  // Error view
  if (!data?.ok) {
    return (
      <>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 10 }}>{COPY.title}</h1>
            <p style={{ opacity: 0.8, marginTop: 0 }}>{COPY.subtitle}</p>
            {userEmail && (
              <div style={{ opacity: 0.65, fontSize: 13, marginTop: 10 }}>
                Signed in as {userEmail}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
            <button onClick={reloadList} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "reload" ? COPY.reloadBtnLoading : COPY.reloadBtn}
            </button>

            <button
              onClick={refreshFromGoogleThenReload}
              disabled={actionLoading !== null || !business?.google_place_id}
              title={!business?.google_place_id ? COPY.syncTooltipDisabled : COPY.syncTooltipEnabled}
              style={buttonStyle}
            >
              {actionLoading === "google" ? COPY.syncBtnLoading : COPY.syncBtn}
            </button>

            {showSubscribe && (
              <div style={{ width: "100%" }}>
                <SubscribeButton />
              </div>
            )}

            <button onClick={onLogout} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "logout" ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>

        {data?.error && (
          <div
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
            <strong style={{ fontWeight: 700, opacity: 0.9 }}>Couldn’t load right now:</strong>{" "}
            {String(data.error)}
          </div>
        )}

        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 10 }}>{COPY.title}</h1>
          <p style={{ opacity: 0.82, marginTop: 0, maxWidth: 680, lineHeight: 1.45 }}>
            {COPY.subtitle}
          </p>

          <div style={{ opacity: 0.82, marginTop: 12 }}>
            <div>
              <strong>Business:</strong> {displayBusinessName}
            </div>
            {userEmail && (
              <div style={{ opacity: 0.65, fontSize: 13, marginTop: 6 }}>
                Signed in as {userEmail}
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
            width: 260,
            maxWidth: "100%",
          }}
        >
          {showSubscribe && (
            <div style={{ width: "100%" }}>
              <SubscribeButton />
            </div>
          )}

          <button
            onClick={reloadList}
            disabled={actionLoading !== null}
            style={{ ...buttonStyle, width: "100%", minWidth: 0 }}
            title="Reload the list"
          >
            {actionLoading === "reload" ? COPY.reloadBtnLoading : COPY.reloadBtn}
          </button>

          <button
            onClick={refreshFromGoogleThenReload}
            disabled={actionLoading !== null || !business?.google_place_id}
            style={{
              ...buttonStyle,
              width: "100%",
              minWidth: 0,
              opacity: !business?.google_place_id ? 0.6 : 1,
            }}
            title={!business?.google_place_id ? COPY.syncTooltipDisabled : COPY.syncTooltipEnabled}
            aria-disabled={actionLoading !== null || !business?.google_place_id}
          >
            {actionLoading === "google" ? COPY.syncBtnLoading : COPY.syncBtn}
          </button>

          {hasGoogleConnected && (
            <button
              onClick={() => setWhyOpen((v) => !v)}
              disabled={actionLoading !== null}
              style={{
                ...ghostButtonStyle,
                width: "100%",
                minWidth: 0,
                textAlign: "center",
              }}
              title={COPY.whyTitle}
            >
              {COPY.whyLink}
            </button>
          )}
        </div>
      </div>

      {/* “Last fetched” */}
      {hasGoogleConnected && lastRefreshedAt && (
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 8 }}>
          Last refreshed: {new Date(lastRefreshedAt).toLocaleString()}
        </div>
      )}

      {/* Why box */}
      {hasGoogleConnected && whyOpen && (
        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(2,6,23,0.35)",
            color: "rgba(226,232,240,0.92)",
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>{COPY.whyTitle}</div>
          <div style={{ opacity: 0.9 }}>{COPY.whyBody}</div>
          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>{COPY.whyFooter}</div>
        </div>
      )}

      {/* Connected confirmation + plan status */}
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
          <div style={{ minWidth: 260, flex: "1 1 420px" }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                display: "flex",
                gap: 10,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <span style={{ color: "#22c55e" }}>●</span>
              {COPY.connectedLabel}

              <button
                onClick={() => {
                  setShowChangePlaceId((v) => !v);
                  setShowPlaceSearch(false);
                  setPlaceSearchQuery("");
                  setPlaceSearchResults([]);
                  setPlaceSearchError(null);

                  window.setTimeout(() => {
                    const el = document.getElementById("rc-connect-google-anchor");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }, 30);
                }}
                disabled={actionLoading !== null}
                style={{
                  ...ghostButtonStyle,
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 800,
                }}
                title="Switch to a different Place ID"
              >
                {showChangePlaceId ? COPY.cancelChangePlaceBtn : COPY.changePlaceBtn}
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, opacity: 0.92 }}>
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

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>
              {COPY.connectedHelp}
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.72 }}>
              Nothing is posted automatically.
            </div>
          </div>

          <div style={{ minWidth: 240, textAlign: "right" }}>
            {subscriptionActive === null ? (
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
                Google sync: Checking…
              </div>
            ) : subscriptionActive ? (
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                Google sync:{" "}
                <span style={{ color: "#22c55e", fontWeight: 800 }}>Available</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                  Google sync:{" "}
                  <span style={{ color: "#f87171", fontWeight: 800 }}>Locked</span>
                </div>
                <div
                  style={{
                    border: "1px solid rgba(148,163,184,0.18)",
                    borderRadius: 12,
                    padding: "10px 12px",
                    background: "rgba(2,6,23,0.25)",
                    fontSize: 12,
                    opacity: 0.9,
                    marginBottom: 10,
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{COPY.planLockedTitle}</div>
                  <div style={{ lineHeight: 1.4 }}>{COPY.planLockedBody}</div>
                </div>
                <SubscribeButton />
              </>
            )}
          </div>
        </div>
      )}

      {/* Anchor so Change Place ID can scroll to connect UI */}
      <div id="rc-connect-google-anchor" style={{ position: "relative", top: -10 }} />

      {/* Connect/Change card (Onboarding OR Change Place ID) */}
      {showConnectCard && (
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
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {COPY.connectHeader}
          </div>

          <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 12, lineHeight: 1.45 }}>
            {needsOnboarding ? COPY.connectBody : COPY.connectBodyChange}
          </div>

          {/* iPhone-friendly business search */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={async () => {
                if (subscriptionActive === false || upgradeRequired === true) {
                  await redirectToCheckout();
                  return;
                }
                setShowPlaceSearch((v) => !v);
                setPlaceSearchError(null);
                setPlaceSearchResults([]);
              }}
              disabled={isPlaceConnectLoading}
              style={{ ...buttonStyle, minWidth: 170 }}
            >
              {showPlaceSearch ? "Hide search" : "Find my business"}
            </button>

            <div style={{ fontSize: 12, opacity: 0.75 }}>{COPY.connectTip}</div>

            {!needsOnboarding && (
              <button
                onClick={() => {
                  setShowChangePlaceId(false);
                  setShowPlaceSearch(false);
                  setPlaceSearchQuery("");
                  setPlaceSearchResults([]);
                  setPlaceSearchError(null);
                  showToast({ message: "Canceled Place ID change.", type: "success" }, 1800);
                }}
                disabled={isPlaceConnectLoading}
                style={{ ...ghostButtonStyle, minWidth: 120 }}
              >
                {COPY.cancelChangePlaceBtn}
              </button>
            )}
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
                      <div
                        style={{
                          fontSize: 11,
                          opacity: 0.55,
                          marginTop: 8,
                          fontFamily: "monospace",
                        }}
                      >
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
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 12,
            }}
          >
            <input
              value={placeIdInput}
              onChange={(e) => {
                setPlaceIdInput(e.target.value);
                if (placeIdStatus === "error") {
                  setPlaceIdStatus("idle");
                  setPlaceIdError(null);
                }
              }}
              placeholder="Paste a Google Place ID"
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
              style={{ ...buttonStyle, minWidth: 170 }}
            >
              {isPlaceConnectLoading ? COPY.connectBtnLoading : COPY.connectBtn}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {placeIdStatus === "loading" && (
              <div style={{ fontSize: 13, opacity: 0.9 }}>Verifying…</div>
            )}

            {placeIdStatus === "error" && (
              <div style={{ fontSize: 13, color: "#f87171" }}>
                {placeIdError ??
                  "We couldn’t verify this Place ID. Please double-check and try again."}
              </div>
            )}

            {placeIdStatus === "success" && (
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>
                Connected ✔
              </div>
            )}
          </div>

          {placeVerify?.name && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9, lineHeight: 1.45 }}>
              Connected to <strong>{placeVerify.name}</strong>.
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                Next: refresh a sample of reviews above.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div
        className="summary-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginTop: 18,
          marginBottom: 20,
        }}
      >
        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Average rating</div>
          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>from Google</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {avgRating === null ? "—" : clamp(avgRating, 0, 5).toFixed(2)}
            <span style={{ opacity: 0.75, fontSize: 14, marginLeft: 10 }}>
              {avgRating === null ? "" : stars(avgRating)}
            </span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Reviews</div>
          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>on Google</div>

          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>
            {totalReviews ?? data.count ?? reviews.length}
            <span style={{ opacity: 0.75, fontSize: 13, marginLeft: 10 }}>
              • showing {filteredReviews.length}
            </span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ opacity: 0.75, fontSize: 12 }}>Last refreshed</div>

          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 6 }}>
            {lastRefreshedAt ? formatDate(lastRefreshedAt) : "—"}
          </div>

          <div style={{ opacity: 0.65, fontSize: 12, marginTop: 6 }}>
            Latest review
            {lastReviewDate ? ` • ${formatDate(lastReviewDate)}` : ""}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 768px) {
          .summary-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      {/* Anchor so “Draft reply” can scroll here */}
      <div id="rc-draft-panel-anchor" style={{ position: "relative", top: -10 }} />

      {/* Drafting panel (voice-first core) */}
      <DraftReplyPanel businessName={displayBusinessName === "Unknown" ? "" : displayBusinessName} />

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
          marginTop: 14,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>{COPY.filtersRating}</span>
          <select
            value={ratingFilter}
            onChange={(e) =>
              setRatingFilter(e.target.value === "all" ? "all" : Number(e.target.value))
            }
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

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>{COPY.filtersStatus}</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            style={selectStyle}
          >
            <option value="all">{COPY.statusAll}</option>
            <option value="needs_reply">{COPY.statusNeeds}</option>
            <option value="drafted">{COPY.statusDrafted}</option>
            <option value="handled">{COPY.statusHandled}</option>
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>{COPY.filtersSearch}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Author, text, language, status…"
            style={inputStyle}
          />
        </div>

        <button
          onClick={() => {
            setRatingFilter("all");
            setStatusFilter("all");
            setQuery("");
          }}
          style={buttonStyle}
        >
          {COPY.filtersClear}
        </button>
      </div>

      {/* List header */}
      {hasGoogleConnected ? (
        <div style={{ opacity: 0.78, fontSize: 12, marginBottom: 8 }}>
          <strong style={{ opacity: 0.9 }}>{COPY.listLabel}</strong>{" "}
          <span style={{ opacity: 0.75 }}>• {COPY.listLabelNote}</span>
        </div>
      ) : (
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 8 }}>Reviews</div>
      )}

      {/* List */}
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
              <div style={{ fontWeight: 800, marginBottom: 6 }}>{COPY.emptyTitle}</div>

              <div style={{ opacity: 0.88 }}>
                {!hasGoogleConnected ? COPY.emptyBodyNoGoogle : COPY.emptyBodyHasGoogle}
              </div>

              <div style={{ marginTop: 10, opacity: 0.72 }}>
                You’ll always choose what to post.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>No matches.</div>
              <div style={{ opacity: 0.85 }}>
                Try clearing filters or searching a shorter keyword (name, “service”, “room”, etc.).
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => {
                    setRatingFilter("all");
                    setStatusFilter("all");
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
          {filteredReviews.map((r) => {
            const local = getLocalState(r.id);
            const isSelected = selectedReviewId === r.id;

            return (
              <div
                key={r.id}
                style={{
                  ...cardStyle,
                  border: isSelected ? "1px solid rgba(59,130,246,0.45)" : cardStyle.border,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {stars(r.rating)}
                      <span style={{ opacity: 0.7, marginLeft: 8, fontWeight: 700 }}>
                        {typeof r.rating === "number" ? r.rating.toFixed(0) : "—"}
                      </span>
                    </div>

                    <div style={{ fontSize: 13, opacity: 0.92 }}>
                      {r.author_url ? (
                        <a
                          href={r.author_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "inherit",
                            textDecoration: "underline",
                            textUnderlineOffset: 3,
                          }}
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

                    {/* Status pill */}
                    <span
                      style={{
                        fontSize: 11,
                        borderRadius: 999,
                        padding: "3px 10px",
                        background: statusColor(local.status),
                        border: `1px solid ${statusBorder(local.status)}`,
                        color: "rgba(226,232,240,0.95)",
                        opacity: 0.95,
                        fontWeight: 800,
                      }}
                      title="This status is saved on this device"
                    >
                      {statusLabel(local.status)}
                    </span>

                    {local.updatedAt && (
                      <span style={{ fontSize: 11, opacity: 0.55 }}>
                        updated {formatDate(local.updatedAt)}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-end",
                      gap: 8,
                      minWidth: 170,
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: "nowrap" }}>
                      {formatDate(r.review_date ?? r.created_at)}
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        onClick={() => selectReviewForDraft(r)}
                        disabled={!r.review_text}
                        style={{
                          ...buttonStyle,
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          opacity: r.review_text ? 0.95 : 0.5,
                        }}
                        title={r.review_text ? "Send this review to the draft area" : "No review text"}
                      >
                        {COPY.actionDraftReply}
                      </button>

                      <button
                        onClick={() => copyReviewToClipboard(r)}
                        disabled={!r.review_text}
                        style={{
                          ...buttonStyle,
                          padding: "6px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          opacity: r.review_text ? 0.95 : 0.5,
                        }}
                        title={r.review_text ? "Copy review text" : "No review text to copy"}
                      >
                        {COPY.actionCopyReview}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, opacity: 0.95 }}>
                  {r.review_text ? (
                    r.review_text
                  ) : (
                    <span style={{ opacity: 0.6 }}>No review text.</span>
                  )}
                </div>

                {/* Minimal per-review status actions (no inline draft editor) */}
                <div
                  style={{
                    marginTop: 12,
                    borderTop: "1px solid rgba(148,163,184,0.18)",
                    paddingTop: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => {
                        setLocalState(r.id, { status: "handled" });
                        showToast({ message: "Marked handled.", type: "success" }, 2000);
                      }}
                      style={{
                        ...ghostButtonStyle,
                        padding: "8px 10px",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      title="If you already replied in Google, mark it handled"
                    >
                      {COPY.actionMarkHandled}
                    </button>

                    {local.status === "handled" && (
                      <button
                        onClick={() => {
                          setLocalState(r.id, { status: "needs_reply" });
                          showToast(
                            { message: "Moved back to needs reply.", type: "success" },
                            2000
                          );
                        }}
                        style={{
                          ...ghostButtonStyle,
                          padding: "8px 10px",
                          borderRadius: 10,
                          fontSize: 12,
                        }}
                        title="Move back if you still want to reply"
                      >
                        {COPY.actionMarkNeeds}
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: 11, opacity: 0.65 }}>Saved on this device</div>
                </div>

                {/* keep source metadata quiet */}
                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.5 }}>
                  Source: {r.source}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div style={toastStyle(toast.type)} aria-live="polite">
          {toast.message}
        </div>
      )}
    </>
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

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.35)",
  cursor: "pointer",
  color: "rgba(226,232,240,0.92)",
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
