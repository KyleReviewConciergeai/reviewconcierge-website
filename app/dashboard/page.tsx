"use client";

import { useEffect, useState } from "react";

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

export default function DashboardPage() {
  const [data, setData] = useState<ReviewsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch("/api/reviews", { cache: "no-store" });
        const json = (await res.json()) as ReviewsApiResponse;
        setData(json);
      } catch (e: any) {
        setData({ ok: false, error: e?.message ?? "Failed to load" });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Dashboard</h1>
        <p style={{ opacity: 0.8 }}>Loading reviews…</p>
      </main>
    );
  }

  if (!data?.ok) {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 12 }}>Dashboard</h1>
        <p style={{ color: "#ffb3b3" }}>
          Error loading reviews: {data?.error ?? "Unknown error"}
        </p>
        <p style={{ opacity: 0.8 }}>
          Quick check: open <code>/api/reviews</code> directly and confirm it returns JSON.
        </p>
      </main>
    );
  }

  const reviews = data.reviews ?? [];

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Dashboard</h1>

      <div style={{ opacity: 0.8, marginBottom: 18 }}>
        <div>
          <strong>Business:</strong>{" "}
          {data.business?.business_name ?? data.business?.id ?? "Unknown"}
        </div>
        <div>
          <strong>Reviews loaded:</strong> {data.count ?? reviews.length}
        </div>
      </div>

      {reviews.length === 0 ? (
        <p style={{ opacity: 0.85 }}>No reviews yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {reviews.map((r) => (
            <div
              key={r.id}
              style={{
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 14,
                padding: 14,
                background: "rgba(15,23,42,0.6)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 6,
                }}
              >
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
                    {stars(r.rating)}{" "}
                    {typeof r.rating === "number" ? `(${r.rating}/5)` : ""}
                  </span>
                </div>

                <div style={{ opacity: 0.75, fontSize: 12, textAlign: "right" }}>
                  <div>{formatDate(r.review_date)}</div>
                  <div>
                    {r.source?.toUpperCase()}{" "}
                    {r.detected_language ? `• ${r.detected_language}` : ""}
                  </div>
                </div>
              </div>

              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                {r.review_text ?? ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
