"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  isConnected: boolean;
};

export default function RefreshReviewsButton({ isConnected }: Props) {
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
    if (!isConnected || loading) return;

    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch("/api/reviews/google", { method: "GET" });
      const data = await res.json();

      if (!res.ok || !data?.ok) {
        const friendly =
          data?.error ||
          data?.googleError ||
          "We couldn’t refresh from Google right now. Please try again.";
        throw new Error(friendly);
      }

      const fetched = Number(data?.fetched ?? 0);
      const inserted = typeof data?.inserted === "number" ? data.inserted : null;
      const updated = typeof data?.updated === "number" ? data.updated : null;

      if (fetched === 0) {
        setMessage({
          type: "success",
          text: "Synced from Google • No recent reviews returned (totals still verified)",
        });
      } else {
        const detail =
          inserted !== null && updated !== null
            ? `Imported ${inserted} new • Updated ${updated}`
            : `Synced ${fetched} recent reviews`;

        setMessage({
          type: "success",
          text: `${detail} • Ratings verified`,
        });
      }

      router.refresh();
    } catch (err: any) {
      setMessage({
        type: "error",
        text: err?.message ?? "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  const disabled = loading || !isConnected;

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <button
        onClick={refresh}
        disabled={disabled}
        title={!isConnected ? "Connect your business to enable refresh" : undefined}
        style={{
          padding: "10px 14px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.15)",
          background: disabled ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.10)",
          cursor: disabled ? "not-allowed" : "pointer",
          color: "white",
          minWidth: 160,
          opacity: disabled ? 0.75 : 1,
        }}
        aria-busy={loading}
      >
        {loading ? "Refreshing…" : "Refresh from Google"}
      </button>

      {!isConnected && !message && (
        <span style={{ opacity: 0.75, fontSize: 13 }}>
          Connect your business to enable refresh.
        </span>
      )}

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
