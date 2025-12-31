"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshReviewsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(
    null
  );

  // Optional polish: auto-clear success messages after a moment
  useEffect(() => {
    if (!message || message.type !== "success") return;
    const t = setTimeout(() => setMessage(null), 4500);
    return () => clearTimeout(t);
  }, [message]);

  async function refresh() {
    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch("/api/reviews/google", { method: "GET" });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        // Keep errors demo-friendly (avoid raw DB/Google messages when possible)
        const friendly =
          data?.error ||
          data?.googleError ||
          "We couldn’t refresh from Google right now. Please try again.";
        throw new Error(friendly);
      }

      const fetched = Number(data?.fetched ?? 0);
      const inserted = typeof data?.inserted === "number" ? data.inserted : null;
      const updated = typeof data?.updated === "number" ? data.updated : null;

      // Demo-friendly messaging
      if (fetched === 0) {
        setMessage({
          type: "success",
          text: "Synced from Google • No recent reviews returned (totals still verified)",
        });
      } else {
        // If your API returns inserted/updated, use that phrasing; otherwise fallback to fetched
        const detail =
          inserted !== null && updated !== null
            ? `Imported ${inserted} new • Updated ${updated}`
            : `Synced ${fetched} recent reviews`;

        setMessage({
          type: "success",
          text: `${detail} • Ratings verified`,
        });
      }

      router.refresh(); // re-fetch server data for the page
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={refresh}
        disabled={loading}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.15)",
          background: loading ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
          cursor: loading ? "not-allowed" : "pointer",
          color: "white",
          minWidth: 160,
        }}
        aria-busy={loading}
      >
        {loading ? "Refreshing…" : "Refresh from Google"}
      </button>

      {message && (
        <span
          style={{
            opacity: 0.9,
            fontSize: 14,
            color: message.type === "error" ? "#fca5a5" : "rgba(255,255,255,0.85)",
          }}
        >
          {message.type === "error" ? `❌ ${message.text}` : `✅ ${message.text}`}
        </span>
      )}
    </div>
  );
}
