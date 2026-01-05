"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  isConnected: boolean;
};

type Msg =
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | { type: "upgrade"; text: string };

function friendlyErrorFromResponse(payload: any): string {
  return (
    payload?.error ||
    payload?.googleError ||
    payload?.message ||
    "We couldn’t refresh from Google right now. Please try again."
  );
}

export default function RefreshReviewsButton({ isConnected }: Props) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Msg | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // Auto-clear success messages after a moment
  useEffect(() => {
    if (!message || message.type !== "success") return;
    const t = setTimeout(() => {
      if (mountedRef.current) setMessage(null);
    }, 4500);
    return () => clearTimeout(t);
  }, [message]);

  async function refresh() {
    if (!isConnected || loading) return;

    // cancel any prior in-flight request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      setLoading(true);
      setMessage(null);

      const res = await fetch("/api/reviews/google", {
        method: "GET",
        cache: "no-store",
        signal: ac.signal,
      });

      // Parse JSON safely (some upstream errors might not be JSON)
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      // Subscription gating
      if (res.status === 402 || data?.upgradeRequired) {
        const text =
          "Sync requires an active subscription. Start your trial to enable Google refresh.";
        if (mountedRef.current) {
          setMessage({ type: "upgrade", text });
        }
        return;
      }

      if (!res.ok || !data?.ok) {
        throw new Error(friendlyErrorFromResponse(data));
      }

      const fetched = Number(data?.fetched ?? 0);
      const inserted = typeof data?.inserted === "number" ? data.inserted : null;
      const updated = typeof data?.updated === "number" ? data.updated : null;

      const text =
        fetched === 0
          ? "Synced from Google • No recent reviews returned (totals still verified)"
          : inserted !== null && updated !== null
          ? `Imported ${inserted} new • Updated ${updated} • Ratings verified`
          : `Synced ${fetched} recent reviews • Ratings verified`;

      if (mountedRef.current) {
        setMessage({ type: "success", text });
      }

      router.refresh();
    } catch (err: any) {
      // Ignore abort errors
      if (err?.name === "AbortError") return;

      if (mountedRef.current) {
        setMessage({
          type: "error",
          text: err?.message ?? "Something went wrong. Please try again.",
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
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
          minWidth: 170,
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
            color:
              message.type === "error"
                ? "#fca5a5"
                : message.type === "upgrade"
                ? "#fde68a"
                : "rgba(255,255,255,0.85)",
          }}
        >
          {message.type === "error"
            ? `❌ ${message.text}`
            : message.type === "upgrade"
            ? `⚡ ${message.text}`
            : `✅ ${message.text}`}
        </span>
      )}
    </div>
  );
}
