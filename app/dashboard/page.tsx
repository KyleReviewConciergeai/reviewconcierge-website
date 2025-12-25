"use client";

import { useEffect, useMemo, useState } from "react";
import DraftReplyPanel from "./DraftReplyPanel";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
};

type CurrentBusiness = {
  id: string;
  business_name?: string | null;
  google_place_id?: string | null;
};

type Toast = {
  message: string;
  type?: "success" | "error";
};

type PlaceIdStatus = "idle" | "loading" | "success" | "error";

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

  // API data (reviews)
  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [actionLoading, setActionLoading] = useState<
    "reload" | "google" | "logout" | "connect" | null
  >(null);
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

  // ✅ NEW: explicit onboarding UI states
  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);

  // Header
  const [userEmail, setUserEmail] = useState<string>("");

  // Filters
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  const needsOnboarding = businessLoaded && (!business || !business.google_place_id);

  function showToast(t: Toast, ms = 3000) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

  async function loadReviews() {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    const json = (await res.json()) as ReviewsApiResponse;
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

        // ✅ If already connected, reflect success state on load (nice polish)
        if (b?.google_place_id) {
          setPlaceIdStatus("success");
          setPlaceIdError(null);
        } else {
          setPlaceIdStatus("idle");
          setPlaceIdError(null);
        }
      } else {
        // If API returns ok:false, keep page usable
        setPlaceIdStatus("idle");
      }
    } catch {
      // ignore (we still want the dashboard to render)
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
      setLastRefreshedAt(new Date().toISOString());
    } catch (e: any) {
      setData({ ok: false, error: e?.message ?? "Failed to load" });
    } finally {
      setActionLoading(null);
    }
  }

  async function refreshFromGoogleThenReload() {
    if (actionLoading) return;

    // Don’t let users run Google sync if Place ID isn’t connected yet
    if (!business?.google_place_id) {
      showToast({ message: "Connect your Google Place ID first.", type: "error" }, 3500);
      return;
    }

    try {
      setActionLoading("google");

      const googleRes = await fetch("/api/reviews/google", { cache: "no-store" });
      const googleJson = await googleRes.json();

      if (!googleRes.ok || !googleJson?.ok) {
        const msg = googleJson?.error ?? googleJson?.googleError ?? "Google refresh failed";
        setData({ ok: false, error: msg });
        showToast({ message: msg, type: "error" }, 4000);
        return;
      }

      const fetched = Number(googleJson?.fetched ?? 0);
      const inserted = Number(googleJson?.inserted ?? 0);
      const updated = Number(googleJson?.updated ?? 0);
      const syncedAt = (googleJson?.synced_at as string | undefined) ?? new Date().toISOString();

      const json = await loadReviews();
      setData(json);
      setLastRefreshedAt(syncedAt);

      const msg =
        fetched === 0
          ? "Google sync complete: no reviews returned."
          : `Google sync complete: ${fetched} fetched (${inserted} new, ${updated} updated).`;

      showToast({ message: msg, type: "success" }, 3000);
    } catch (e: any) {
      const msg = e?.message ?? "Failed to refresh";
      setData({ ok: false, error: msg });
      showToast({ message: msg, type: "error" }, 4000);
    } finally {
      setActionLoading(null);
    }
  }

  async function connectGooglePlaceId() {
    if (actionLoading) return;

    const placeId = placeIdInput.trim();
    if (!placeId) return;

    // ✅ NEW: enter "loading" state and clear any previous errors
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

        // ✅ NEW: friendly error state (in-card) + toast
        setPlaceIdStatus("error");
        setPlaceIdError(msg);
        showToast({ message: msg, type: "error" }, 4000);
        return;
      }

      // update local business state so onboarding disappears immediately
      setBusiness((json.business ?? null) as CurrentBusiness | null);
      setPlaceVerify(json.verified ?? null);
      setPlaceIdInput(json.business?.google_place_id ?? placeId);

      // ✅ NEW: success state (in-card)
      setPlaceIdStatus("success");
      setPlaceIdError(null);

      showToast(
        { message: `Connected: ${json?.verified?.name ?? "Place verified"}`, type: "success" },
        3000
      );

      // optional: reload reviews so header + stats reflect current org/business
      const r = await loadReviews();
      setData(r);
      setLastRefreshedAt(new Date().toISOString());
    } catch (e: any) {
      const msg = e?.message ?? "Network error verifying Place ID. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
      showToast({ message: msg, type: "error" }, 4000);
    } finally {
      setActionLoading(null);
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

        // signed-in user (header)
        const { data: userData } = await sb.auth.getUser();
        setUserEmail(userData?.user?.email ?? "");

        // org-scoped business + place id
        await loadCurrentBusiness();

        // reviews
        const json = await loadReviews();
        setData(json);
        setLastRefreshedAt(new Date().toISOString());
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

      const haystack = [r.author_name ?? "", r.review_text ?? "", r.source ?? "", r.detected_language ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [reviews, ratingFilter, query]);

  const avgRating = useMemo(() => {
    const rated = reviews.filter((r) => typeof r.rating === "number") as Array<
      Review & { rating: number }
    >;
    if (rated.length === 0) return null;
    const sum = rated.reduce((acc, r) => acc + r.rating, 0);
    return sum / rated.length;
  }, [reviews]);

  const lastReviewDate = useMemo(() => {
    if (reviews.length === 0) return null;
    const newest = reviews
      .map((r) => r.review_date ?? r.created_at)
      .filter(Boolean)
      .sort()
      .pop();
    return newest ?? null;
  }, [reviews]);

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Dashboard</h1>
        <p style={{ opacity: 0.8 }}>Loading…</p>

        {toast && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              padding: "12px 16px",
              borderRadius: 12,
              background:
                toast.type === "error" ? "rgba(220,38,38,0.95)" : "rgba(15,23,42,0.95)",
              color: "#fff",
              fontSize: 14,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
              zIndex: 1000,
              maxWidth: 360,
            }}
          >
            {toast.message}
          </div>
        )}
      </main>
    );
  }

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
            {userEmail && <div style={{ opacity: 0.7, fontSize: 13 }}>Signed in as {userEmail}</div>}
          </div>

          <div
  style={{
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  }}
>

            <button onClick={reloadList} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "reload" ? "Reloading…" : "Reload list"}
            </button>
            <button
              onClick={refreshFromGoogleThenReload}
              disabled={actionLoading !== null || !business?.google_place_id}
              style={buttonStyle}
            >
              {actionLoading === "google" ? "Refreshing…" : "Refresh from Google"}
            </button>
            <button onClick={onLogout} disabled={actionLoading !== null} style={buttonStyle}>
              {actionLoading === "logout" ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>

        <p style={{ color: "#ffb3b3", marginTop: 12 }}>Error: {data?.error ?? "Unknown error"}</p>

        {toast && <div style={toastStyle(toast.type)}>{toast.message}</div>}
      </main>
    );
  }

  const displayBusinessName =
    business?.business_name ?? data.business?.business_name ?? (businessLoaded ? "Unknown" : "Loading…");

  const isPlaceConnectLoading = actionLoading === "connect" || placeIdStatus === "loading";
const hasGoogleConnected = !!business?.google_place_id;

function maskPlaceId(pid?: string | null) {
  if (!pid) return "";
  const s = String(pid);
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
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

        <div
  style={{
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    flexWrap: "wrap",
  }}
>

          <button onClick={reloadList} disabled={actionLoading !== null} style={{
  ...buttonStyle,
  minWidth: 120,
  width: "100%",
  maxWidth: 220,
}}
>
            {actionLoading === "reload" ? "Reloading…" : "Reload list"}
          </button>

          <button
            onClick={refreshFromGoogleThenReload}
            disabled={actionLoading !== null || !business?.google_place_id}
            style={{ ...buttonStyle, minWidth: 170, opacity: !business?.google_place_id ? 0.6 : 1 }}
            title={!business?.google_place_id ? "Connect your Google Place ID first" : "Fetch from Google and reload"}
          >
            {actionLoading === "google" ? "Refreshing…" : "Refresh from Google"}
          </button>

          <button onClick={onLogout} disabled={actionLoading !== null} style={{ ...buttonStyle, minWidth: 110 }}>
            {actionLoading === "logout" ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>

      {/* ✅ Onboarding card: show if business missing OR missing google_place_id */}
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
            Paste a Place ID to verify your business and enable “Refresh from Google”.
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={placeIdInput}
              onChange={(e) => {
                setPlaceIdInput(e.target.value);
                // ✅ Reset error UI as user types again
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

          {/* ✅ NEW: Inline status messaging (Loading / Success / Friendly Error) */}
          <div style={{ marginTop: 10 }}>
            {placeIdStatus === "loading" && (
              <div style={{ fontSize: 13, opacity: 0.9 }}>Verifying Place ID…</div>
            )}

            {placeIdStatus === "error" && (
              <div style={{ fontSize: 13, color: "#f87171" }}>
                {placeIdError ?? "We couldn’t verify this Place ID. Please double-check and try again."}
              </div>
            )}

            {/* NOTE: success state will usually disappear quickly because onboarding card hides after setBusiness updates.
                Still useful for the brief moment before re-render / when business exists but place_id not yet in state. */}
            {placeIdStatus === "success" && (
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>
                Connected successfully ✔
              </div>
            )}
          </div>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
            Need help?{" "}
            <a
              href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
              target="_blank"
              rel="noreferrer"
              style={{ textDecoration: "underline", color: "inherit" }}
            >
              Find your Google Place ID
            </a>
          </div>

          {placeVerify?.name && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              Connected to: <strong>{placeVerify.name}</strong> ✔
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              You can now click “Refresh from Google” to pull in reviews.
              </div>
              {typeof placeVerify.rating === "number" ? ` • ${placeVerify.rating}★` : ""}
              {typeof placeVerify.user_ratings_total === "number" ? ` • ${placeVerify.user_ratings_total} ratings` : ""}
            </div>
          )}

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
            Tip: if you don’t know your Place ID, use the finder link above.
          </div>
        </div>
      )}

{/* ✅ Connected confirmation card (shows after Place ID is connected) */}
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
        You can now click “Refresh from Google” to sync reviews.
      </div>
    </div>

    <div
  style={{
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    width: "100%",
  }}
>
  <button
    onClick={refreshFromGoogleThenReload}
    disabled={actionLoading !== null}
    style={{
      ...buttonStyle,
      minWidth: 170,
      width: "100%",
      maxWidth: 240,
    }}
    title="Fetch from Google and reload"
  >
    {actionLoading === "google" ? "Refreshing…" : "Refresh from Google"}
  </button>
</div>

  </div>
)}

      {/* summary cards */}
      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 16,
    marginTop: 16,
  }}
>
  {/* Average Rating */}
  <div style={cardStyle}>
    <div style={{ opacity: 0.75, fontSize: 12 }}>Average rating</div>
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
    <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
      {data.count ?? reviews.length}
      <span style={{ opacity: 0.75, fontSize: 13, marginLeft: 10 }}>
        showing {filteredReviews.length}
      </span>
    </div>
  </div>

  {/* Last Refresh */}
  <div style={cardStyle}>
    <div style={{ opacity: 0.75, fontSize: 12 }}>Last refresh</div>
    <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>
      {lastRefreshedAt ? formatDate(lastRefreshedAt) : "—"}
    </div>
    <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
      Latest review: {lastReviewDate ? formatDate(lastReviewDate) : "—"}
    </div>
  </div>
</div>

{/* Mobile stacking */}
<style jsx>{`
  @media (max-width: 768px) {
    div {
      grid-template-columns: 1fr !important;
    }
  }
`}</style>

      {/* ✅ Pass business name down so DraftReplyPanel is not hardcoded */}
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

      {/* list */}
      {filteredReviews.length === 0 ? (
        <p style={{ opacity: 0.85 }}>No reviews match your filters.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {filteredReviews.map((r) => (
            <div key={r.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {r.author_url ? (
                    <a
                      href={r.author_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "inherit", textDecoration: "underline" }}
                    >
                      {r.author_name ?? "Anonymous"}
                    </a>
                  ) : (
                    <span>{r.author_name ?? "Anonymous"}</span>
                  )}
                  <span style={{ opacity: 0.8, marginLeft: 10 }}>
                    {stars(r.rating)} {typeof r.rating === "number" ? `(${r.rating}/5)` : ""}
                  </span>
                </div>

                <div style={{ opacity: 0.75, fontSize: 12, textAlign: "right" }}>
                  <div>{formatDate(r.review_date)}</div>
                  <div>
                    {r.source?.toUpperCase()} {r.detected_language ? `• ${r.detected_language}` : ""}
                  </div>
                </div>
              </div>

              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{r.review_text ?? ""}</div>
            </div>
          ))}
        </div>
      )}

      {/* toast */}
      {toast && <div style={toastStyle(toast.type)}>{toast.message}</div>}
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  cursor: "pointer",
  color: "#e2e8f0", // ✅ force readable text
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  padding: 14,
  background: "#0f172a",
  color: "#e2e8f0", // ✅ force readable text
};

const selectStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0", // ✅ force readable text
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 240,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0", // ✅ force readable text
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
