"use client";

import { useState } from "react";

type Variant = "primary" | "compact";

type Props = {
  /**
   * primary: normal CTA button
   * compact: smaller CTA for tight spaces (header / cards)
   */
  variant?: Variant;
  /**
   * Optional inline note shown above the button to reinforce doctrine:
   * drafting is unlocked, nothing is ever auto-posted.
   */
  showNote?: boolean;
};

export default function SubscribeButton({ variant = "primary", showNote = false }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function startCheckout() {
    if (loading) return;
    setLoading(true);
    setErr(null);

    try {
      const res = await fetch("/api/stripe/checkout", { method: "POST" });
      const json = await res.json().catch(() => ({} as any));

      if (!res.ok || !json?.url) {
        setErr(typeof json?.error === "string" && json.error.trim() ? json.error : "Couldn’t open checkout.");
        setLoading(false);
        return;
      }

      window.location.href = json.url;
    } catch (e: any) {
      setErr(e?.message || "Couldn’t open checkout.");
      setLoading(false);
    }
  }

  const isCompact = variant === "compact";

  return (
    <div className="flex flex-col gap-2">
      {showNote ? (
        <div className="text-xs text-slate-600">
          Unlock drafting. You still review, edit, and post replies yourself — nothing is auto-posted.
        </div>
      ) : null}

      <button
        onClick={startCheckout}
        disabled={loading}
        className={[
          "rounded-md border border-slate-300 bg-black text-white disabled:opacity-60",
          isCompact ? "px-3 py-2 text-sm" : "px-4 py-2",
        ].join(" ")}
        title="Unlock reply drafting"
      >
        {loading ? "Opening checkout…" : "Unlock drafting"}
      </button>

      {err ? <div className="text-sm text-red-600">{err}</div> : null}
    </div>
  );
}
