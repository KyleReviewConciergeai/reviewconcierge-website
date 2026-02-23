// app/dashboard/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import DraftReplyPanel from "./DraftReplyPanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import SubscribeButton from "./SubscribeButton";
import { startCheckout } from "@/lib/startCheckout";

type Review = {
  id: string;
  business_id: string;
  source: string;
  google_review_id: string;
  google_location_id?: string | null; // ✅ C2
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

// ✅ C3: this matches what your /api/location-sync-status currently returns
type SyncStatusRow = {
  google_location_id: string;
  source: string; // "google_places"
  last_synced_at: string | null;
  last_error: string | null;
  last_fetched: number | null;
  last_inserted: number | null;
  last_updated: number | null;
  updated_at: string | null;
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

function maskLocationId(id?: string | null) {
  if (!id) return "Unknown";
  const s = String(id);
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function maskPlaceId(pid?: string | null) {
  if (!pid) return "";
  const s = String(pid);
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

export default function DashboardPage() {
  const sb = supabaseBrowser();

  const COPY = {
    title: "Your reviews",
    subtitle:
      "Read what guests wrote, then write a short reply in your own voice. You can edit it before posting.",
    reloadBtn: "Reload",
    reloadBtnLoading: "Reloading…",

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
    filtersLocation: "Location", // ✅ C2
    statusAll: "All",
    statusNeeds: "Needs reply",
    statusDrafted: "Drafted",
    statusHandled: "Handled",

    locationAll: "All locations", // ✅ C2

    // ✅ C3 copy
    syncStatusTitle: "Sync status",
    syncStatusHelp: "Shows the last Places sync for the selected location.",
    syncStatusOk: "Healthy",
    syncStatusErr: "Needs attention",
    syncStatusNone: "No sync yet.",
    syncStatusSource: "Source",
    syncStatusLast: "Last sync",
    syncStatusCounts: "Counts",
    syncStatusError: "Error",

    listLabel: "Sample from Google (Places)",
    listLabelNote: "Google Places returns a limited sample (not always the latest).",
    whyLink: "Why not all reviews?",
    whyTitle: "Why not all reviews?",
    whyBody:
      "Google Places returns a limited sample of reviews. It may not include the newest review, and the number can vary by business. You can still reply fast by pasting any review into the draft box above.",
    whyFooter:
      "Full “latest reviews inbox” syncing is enabled when the Google Business Profile (GBP) API is approved.",

    actionDraftReply: "Draft reply",
    actionMarkHandled: "Mark handled",
    actionMarkNeeds: "Mark needs reply",
    actionCopyReview: "Copy review",

    selectHelp:
      "Selected review sent to the draft area above. You can tweak the reply before you post anywhere.",
  };

  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState<
    "reload" | "google" | "logout" | "connect" | null
  >(null);

  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);

  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState<boolean | null>(null);

  const [placeIdInput, setPlaceIdInput] = useState("");
  const [placeVerify, setPlaceVerify] = useState<{
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  } | null>(null);

  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);

  const [showPlaceSearch, setShowPlaceSearch] = useState(false);
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);

  const [showChangePlaceId, setShowChangePlaceId] = useState(false);

  const [userEmail, setUserEmail] = useState<string>("");

  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | "all">("all");

  const [reviewLocal, setReviewLocal] = useState<Record<string, ReviewLocalState>>({});
  const [whyOpen, setWhyOpen] = useState(false);

  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  // ✅ C2: location filter + persistence
  const [locationFilter, setLocationFilter] = useState<string>("all");

  // ✅ C3: sync status
  const [syncStatus, setSyncStatus] = useState<SyncStatusRow | null>(null);
  const [syncStatusLoading, setSyncStatusLoading] = useState(false);

  const storageKey = useMemo(() => {
    return `rc_review_state:${business?.id ?? "unknown"}`;
  }, [business?.id]);

  const locationStorageKey = useMemo(() => {
    return `rc_location_filter:${business?.id ?? "unknown"}`;
  }, [business?.id]);

  const needsOnboarding = businessLoaded && (!business || !business.google_place_id);
  const hasGoogleConnected = !!business?.google_place_id;
  const showConnectCard = needsOnboarding || showChangePlaceId;

  const showSubscribe = subscriptionActive === false || upgradeRequired === true;

  function showToast(t: Toast, ms = 3000) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = safeJsonParse<Record<string, ReviewLocalState>>(raw);
      if (parsed && typeof parsed === "object") setReviewLocal(parsed);
    } catch {
      // ignore
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(reviewLocal));
    } catch {
      // ignore
    }
  }, [reviewLocal, storageKey]);

  // ✅ C2: load persisted location filter
  useEffect(() => {
    try {
      const raw = localStorage.getItem(locationStorageKey);
      const parsed = safeJsonParse<{ location: string }>(raw);
      if (parsed?.location) setLocationFilter(parsed.location);
    } catch {
      // ignore
    }
  }, [locationStorageKey]);

  // ✅ C2: persist location filter
  useEffect(() => {
    try {
      localStorage.setItem(locationStorageKey, JSON.stringify({ location: locationFilter }));
    } catch {
      // ignore
    }
  }, [locationFilter, locationStorageKey]);

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
    setUpgradeRequired(true);
    setSubscriptionActive(false);

    try {
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

      if (res.ok && json?.ok) {
        const isActive = !!json?.isActive;
        setSubscriptionActive(isActive);
        setUpgradeRequired(!isActive);
        return;
      }

      setSubscriptionActive(null);
      setUpgradeRequired(false);
    } catch {
      setSubscriptionActive(null);
      setUpgradeRequired(false);
    }
  }

  // ✅ C3: load per-location sync status from server API
  // IMPORTANT: your route is /api/location-sync-status (NOT /api/org/location-sync-status)
  async function loadSyncStatus(google_location_id: string | null) {
    if (!google_location_id) {
      setSyncStatus(null);
      return;
    }

    setSyncStatusLoading(true);
    try {
      const res = await fetch(
        `/api/location-sync-status?google_location_id=${encodeURIComponent(
          google_location_id
        )}&source=google_places`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setSyncStatus(null);
        return;
      }

      const rows = Array.isArray(json?.rows) ? (json.rows as SyncStatusRow[]) : [];
      setSyncStatus(rows.length ? rows[0] : null);
    } catch {
      setSyncStatus(null);
    } finally {
      setSyncStatusLoading(false);
    }
  }

  // ✅ C3: determine which location to show sync status for
  const statusLocationId = useMemo(() => {
    if (locationFilter !== "all") return locationFilter;
    return business?.google_place_id ?? null;
  }, [locationFilter, business?.google_place_id]);

  // ✅ C3: reload status when selection changes
  useEffect(() => {
    loadSyncStatus(statusLocationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusLocationId]);

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
        await loadSyncStatus(statusLocationId);
        return;
      }

      const fetched = Number(googleJson?.fetched ?? 0);
      const inserted = Number(googleJson?.inserted ?? 0);
      const updated = Number(googleJson?.updated ?? 0);
      const fetchedAt = (googleJson?.fetched_at as string | undefined) ?? new Date().toISOString();

      const json = await loadReviews();
      setData(json);
      setLastRefreshedAt(fetchedAt);

      const msg =
        fetched === 0
          ? "Refreshed sample • No reviews returned from Google Places."
          : `Refreshed sample • ${inserted} new, ${updated} updated.`;

      showToast({ message: msg, type: "success" }, 3500);

      await loadSyncStatus(statusLocationId);
    } catch (e: any) {
      console.error("Refresh from Google error:", e);
      showToast({ message: "Couldn’t refresh right now. Please try again.", type: "error" }, 4500);
      await loadSyncStatus(statusLocationId);
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

      setShowPlaceSearch(false);
      setPlaceSearchQuery("");
      setPlaceSearchResults([]);
      setPlaceSearchError(null);

      setShowChangePlaceId(false);

      const r = await loadReviews();
      setData(r);

      await loadSyncStatus(json.business?.google_place_id ?? null);
    } catch (e: any) {
      const msg = e?.message ?? "Network error verifying Place ID. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
      showToast({ message: msg, type: "error" }, 4000);
    } finally {
      setActionLoading(null);
    }
  }

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

  // ✅ C2: compute available locations from current review rows
  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of reviews) {
      const loc = (r as any)?.google_location_id;
      if (typeof loc === "string" && loc.trim()) set.add(loc.trim());
    }

    // If we have a connected place id but reviews are missing location, include it as an option
    if (business?.google_place_id) set.add(String(business.google_place_id));

    return Array.from(set).sort();
  }, [reviews, business?.google_place_id]);

  // ✅ C2: if the saved filter points to a location that no longer exists, reset to all
  useEffect(() => {
    if (locationFilter === "all") return;
    if (locationOptions.includes(locationFilter)) return;
    setLocationFilter("all");
  }, [locationFilter, locationOptions]);

  useEffect(() => {
    if (!reviews?.length) return;

    setReviewLocal((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const r of reviews) {
        if (!next[r.id]) {
          next[r.id] = { status: "needs_reply", updatedAt: new Date().toISOString() };
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
      // ✅ C2 location filter
      if (locationFilter !== "all") {
        const loc = (r as any)?.google_location_id;
        const normalized = typeof loc === "string" ? loc.trim() : "";
        if (normalized !== locationFilter) return false;
      }

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
  }, [reviews, ratingFilter, query, statusFilter, reviewLocal, locationFilter]);

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

  async function copyReviewToClipboard(review: Review) {
    const text = (review.review_text ?? "").trim();
    if (!text) {
      showToast({ message: "No review text to copy.", type: "error" }, 2500);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);

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

    setLocalState(review.id, { status: "drafted" });

    window.dispatchEvent(
      new CustomEvent("rc:select-review", {
        detail: {
          reviewId: review.id,
          businessId: review.business_id,
          google_location_id:
            (review.google_location_id ?? null) || (business?.google_place_id ?? null),
          text,
          rating: typeof review.rating === "number" ? review.rating : null,
          authorName: review.author_name ?? null,
          createdAt: review.review_date ?? review.created_at ?? null,
          language: review.detected_language ?? null,
          source: review.source ?? null,
        },
      })
    );

    copyReviewToClipboard(review).catch(() => null);
    showToast({ message: COPY.selectHelp, type: "success" }, 3000);

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

  const syncTone = useMemo(() => {
    // Your schema doesn’t have last_sync_status; infer:
    // - if last_synced_at present and last_error null => success
    // - if last_error present => error
    // - else => neutral
    if (syncStatus?.last_error) return "error" as const;
    if (syncStatus?.last_synced_at) return "success" as const;
    return "neutral" as const;
  }, [syncStatus?.last_error, syncStatus?.last_synced_at]);

  function syncPillStyle(tone: "neutral" | "success" | "error"): React.CSSProperties {
    const base: React.CSSProperties = {
      fontSize: 12,
      padding: "6px 10px",
      borderRadius: 999,
      border: "1px solid rgba(148,163,184,0.28)",
      background: "rgba(15,23,42,0.75)",
      color: "#e2e8f0",
      whiteSpace: "nowrap",
      fontWeight: 800,
    };

    if (tone === "success") {
      return {
        ...base,
        border: "1px solid rgba(34,197,94,0.35)",
        background: "rgba(34,197,94,0.12)",
      };
    }

    if (tone === "error") {
      return {
        ...base,
        border: "1px solid rgba(248,113,113,0.45)",
        background: "rgba(248,113,113,0.12)",
      };
    }

    return base;
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
              type="button"
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

      {/* ✅ C3 Sync status card */}
      {hasGoogleConnected && (
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            padding: 14,
            background: "rgba(2,6,23,0.35)",
            color: "rgba(226,232,240,0.92)",
            marginTop: 14,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>{COPY.syncStatusTitle}</div>
              <div style={{ fontSize: 12, opacity: 0.72 }}>{COPY.syncStatusHelp}</div>
              <div style={{ fontSize: 12, opacity: 0.72, marginTop: 6 }}>
                Location:{" "}
                <span style={{ fontFamily: "monospace", opacity: 0.95 }}>
                  {maskLocationId(statusLocationId)}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
              <span style={syncPillStyle(syncTone)}>
                {syncTone === "success"
                  ? COPY.syncStatusOk
                  : syncTone === "error"
                  ? COPY.syncStatusErr
                  : COPY.syncStatusNone}
              </span>

              {/* FIX: never render a “dead” button — allow click, guard inside handler */}
              <button
                type="button"
                onClick={async () => {
                  if (!statusLocationId) {
                    showToast({ message: "No location selected.", type: "error" }, 2500);
                    return;
                  }
                  await loadSyncStatus(statusLocationId);
                }}
                disabled={syncStatusLoading}
                style={{
                  ...ghostButtonStyle,
                  padding: "8px 10px",
                  borderRadius: 10,
                  fontSize: 12,
                  opacity: syncStatusLoading ? 0.7 : 1,
                  cursor: syncStatusLoading ? "not-allowed" : "pointer",
                }}
                title="Refresh sync status"
              >
                {syncStatusLoading ? "Refreshing…" : "Refresh status"}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              <div style={{ opacity: 0.7 }}>{COPY.syncStatusSource}</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {syncStatus?.source ?? "google_places"}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              <div style={{ opacity: 0.7 }}>{COPY.syncStatusLast}</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {syncStatus?.last_synced_at ? formatDate(syncStatus.last_synced_at) : "—"}
              </div>
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              <div style={{ opacity: 0.7 }}>{COPY.syncStatusCounts}</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>
                {syncStatus
                  ? `${syncStatus.last_inserted ?? 0} new • ${syncStatus.last_updated ?? 0} updated • ${
                      syncStatus.last_fetched ?? 0
                    } fetched`
                  : "—"}
              </div>
            </div>
          </div>

          {syncTone === "error" && syncStatus?.last_error && (
            <div style={{ marginTop: 12, fontSize: 12, color: "#fecaca", lineHeight: 1.4 }}>
              <div style={{ fontWeight: 900, marginBottom: 4 }}>{COPY.syncStatusError}</div>
              <div style={{ opacity: 0.95 }}>{syncStatus.last_error}</div>
            </div>
          )}
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

      <div id="rc-draft-panel-anchor" style={{ position: "relative", top: -10 }} />
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
        {/* ✅ C2 Location */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>{COPY.filtersLocation}</span>
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            style={selectStyle}
            disabled={locationOptions.length <= 0}
            title={
              locationOptions.length === 0 ? "No locations available yet" : "Filter by location"
            }
          >
            <option value="all">{COPY.locationAll}</option>
            {locationOptions.map((loc) => (
              <option key={loc} value={loc}>
                {maskLocationId(loc)}
              </option>
            ))}
          </select>
        </div>

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
          type="button"
          onClick={() => {
            setLocationFilter("all");
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

              <div style={{ marginTop: 10, opacity: 0.72 }}>You’ll always choose what to post.</div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>No matches.</div>
              <div style={{ opacity: 0.85 }}>
                Try clearing filters or searching a shorter keyword (name, “service”, “room”, etc.).
              </div>
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    setLocationFilter("all");
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
                        type="button"
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
                        type="button"
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
                  {r.review_text ? r.review_text : <span style={{ opacity: 0.6 }}>No review text.</span>}
                </div>

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
                      type="button"
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
                        type="button"
                        onClick={() => {
                          setLocalState(r.id, { status: "needs_reply" });
                          showToast({ message: "Moved back to needs reply.", type: "success" }, 2000);
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

                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.5 }}>Source: {r.source}</div>
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