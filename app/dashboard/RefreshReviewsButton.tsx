"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshReviewsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch("/api/reviews/google", { method: "GET" });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Refresh failed");
      }

      setMessage(`✅ Synced ${data.fetched ?? 0} reviews`);
      router.refresh(); // re-fetch server data for the page
    } catch (err: any) {
      setMessage(`❌ ${err?.message ?? "Something went wrong"}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
        }}
      >
        {loading ? "Refreshing…" : "Refresh Reviews"}
      </button>

      {message && (
        <span style={{ opacity: 0.85, fontSize: 14 }}>{message}</span>
      )}
    </div>
  );
}
