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

  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"reload" | "google" | "logout" | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null);
  
  const [toast, setToast] = useState<{
  message: string;
  type?: "success" | "error";
} | null>(null);

  // NEW: signed-in user email for header
  const [userEmail, setUserEmail] = useState<string>("");

  // filters
  const [ratingFilter, setRatingFilter] = useState<number | "all">("all");
  const [query, setQuery] = useState("");

  async function loadReviews() {
    const res = await fetch("/api/reviews", { cache: "no-store" });
    const json = (await res.json()) as ReviewsApiResponse;
    return json;
  }

  async function reloadList() {
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
  // Guard against double clicks
  if (actionLoading !== null) return;

  try {
    setActionLoading("google");

    const googleRes = await fetch("/api/reviews/google", { cache: "no-store" });
    const googleJson = await googleRes.json();

    if (!googleRes.ok || !googleJson?.ok) {
      const msg = googleJson?.error ?? googleJson?.googleError ?? "Google refresh failed";
      setData({ ok: false, error: msg });
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

    setToast({ message: msg, type: "success" });
setTimeout(() => setToast(null), 3000);
  } catch (e: any) {
    setData({ ok: false, error: e?.message ?? "Failed to refresh" });
  } finally {
    setActionLoading(null);
  }
}

  async function onLogout() {
    try {
      setActionLoading("logout");
      await sb.auth.signOut();
      // middleware should redirect, but this helps locally too:
      window.location.href = "/login";
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);

        // NEW: get user once for header display
        const { data: userData } = await sb.auth.getUser();
        setUserEmail(userData?.user?.email ?? "");

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
        ratingFilter === "all" ? true : typeof r.rating === "number" && r.rating === ratingFilter;

      if (!matchesRating) return false;
      if (!q) return true;

      const haystack = [r.author_name ?? "", r.review_text ?? "", r.source ?? "", r.detected_language ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [reviews, ratingFilter, query]);

  const avgRating = useMemo(() => {
    const rated = reviews.filter((r) => typeof r.rating === "number") as Array<Review & { rating: number }>;
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
        <p style={{ opacity: 0.8 }}>Loading reviews…</p>

        {toast && (
  <div
    style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      padding: "12px 16px",
      borderRadius: 12,
      background:
        toast.type === "error"
          ? "rgba(220,38,38,0.95)"
          : "rgba(15,23,42,0.95)",
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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 24, marginBottom: 6 }}>Dashboard</h1>
            {userEmail && <div style={{ opacity: 0.7, fontSize: 13 }}>Signed in as {userEmail}</div>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <button
              onClick={reloadList}
              disabled={actionLoading !== null}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                cursor: "pointer",
              }}
            >
              {actionLoading === "reload" ? "Reloading…" : "Reload list"}
            </button>

            <button
              onClick={refreshFromGoogleThenReload}
              disabled={actionLoading !== null}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                cursor: "pointer",
              }}
            >
              {actionLoading === "google" ? "Refreshing…" : "Refresh from Google"}
            </button>

            <button
              onClick={onLogout}
              disabled={actionLoading !== null}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                cursor: "pointer",
              }}
            >
              {actionLoading === "logout" ? "Logging out…" : "Log out"}
            </button>
          </div>
        </div>

        <p style={{ color: "#ffb3b3", marginTop: 12 }}>Error: {data?.error ?? "Unknown error"}</p>

        <p style={{ opacity: 0.8, marginTop: 12 }}>
          Quick check: open <code>/api/reviews</code> directly and confirm it returns JSON.
        </p>
        {toast && (
  <div
    style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      padding: "12px 16px",
      borderRadius: 12,
      background:
        toast.type === "error"
          ? "rgba(220,38,38,0.95)"
          : "rgba(15,23,42,0.95)",
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

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div>
          <h1 style={{ fontSize: 24, marginBottom: 6 }}>Dashboard</h1>
          <div style={{ opacity: 0.8 }}>
            <div>
              <strong>Business:</strong> {data.business?.business_name ?? data.business?.id ?? "Unknown"}
            </div>
            {userEmail && <div style={{ opacity: 0.7, fontSize: 13, marginTop: 6 }}>Signed in as {userEmail}</div>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <button
            onClick={reloadList}
            disabled={actionLoading !== null}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            {actionLoading === "reload" ? "Reloading…" : "Reload list"}
          </button>

          <button
            onClick={refreshFromGoogleThenReload}
            disabled={actionLoading !== null}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              cursor: "pointer",
              minWidth: 170,
            }}
            title="Fetch latest from Google and save to Supabase, then reload"
          >
            {actionLoading === "google" ? "Refreshing…" : "Refresh from Google"}
          </button>

          <button
            onClick={onLogout}
            disabled={actionLoading !== null}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              cursor: "pointer",
              minWidth: 110,
            }}
          >
            {actionLoading === "logout" ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>

      {/* summary cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 12,
          marginTop: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          <div style={{ opacity: 0.75, fontSize: 12 }}>Average rating</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {avgRating === null ? "—" : clamp(avgRating, 0, 5).toFixed(2)}
            <span style={{ opacity: 0.75, fontSize: 14, marginLeft: 10 }}>
              {avgRating === null ? "" : stars(Math.round(avgRating))}
            </span>
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          <div style={{ opacity: 0.75, fontSize: 12 }}>Reviews</div>
          <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>
            {data.count ?? reviews.length}
            <span style={{ opacity: 0.75, fontSize: 13, marginLeft: 10 }}>showing {filteredReviews.length}</span>
          </div>
        </div>

        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 14,
            padding: 14,
            background: "rgba(15,23,42,0.6)",
          }}
        >
          <div style={{ opacity: 0.75, fontSize: 12 }}>Last refresh</div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 8 }}>
            {lastRefreshedAt ? formatDate(lastRefreshedAt) : "—"}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 6 }}>
            Latest review: {lastReviewDate ? formatDate(lastReviewDate) : "—"}
          </div>
        </div>
      </div>

      <DraftReplyPanel />

      {/* filters */}
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ opacity: 0.8, fontSize: 13 }}>Rating</span>
          <select
            value={ratingFilter}
            onChange={(e) => setRatingFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              color: "inherit",
              outline: "none",
            }}
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
            style={{
              width: "100%",
              minWidth: 240,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              color: "inherit",
              outline: "none",
            }}
          />
        </div>

        <button
          onClick={() => {
            setRatingFilter("all");
            setQuery("");
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.7)",
            cursor: "pointer",
          }}
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
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(15,23,42,0.6)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {r.author_url ? (
                    <a href={r.author_url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>
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
      {toast && (
  <div
    style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      padding: "12px 16px",
      borderRadius: 12,
      background:
        toast.type === "error"
          ? "rgba(220,38,38,0.95)"
          : "rgba(15,23,42,0.95)",
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
