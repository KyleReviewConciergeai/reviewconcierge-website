"use client";

import { useState } from "react";

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json?.url) {
        setErr(json?.error || "Failed to start checkout");
        setLoading(false);
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message || "Failed to start checkout");
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={startCheckout}
        disabled={loading}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {loading ? "Redirecting…" : "Subscribe"}
      </button>
      {err ? <div className="text-sm text-red-600">{err}</div> : null}
    </div>
  );
}
