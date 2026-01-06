"use client";

import React, { useState } from "react";
import { startCheckout } from "@/lib/startCheckout";

export default function SubscribeButton() {
  const [loading, setLoading] = useState(false);

  async function handleSubscribe() {
    if (loading) return;
    try {
      setLoading(true);
      await startCheckout("/dashboard");
    } catch (e) {
      console.error(e);
      // Optional: you can add a toast system here later if desired
      alert("Couldn’t start checkout right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleSubscribe}
      disabled={loading}
      style={{
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid rgba(148,163,184,0.35)",
        background: "#0f172a",
        cursor: "pointer",
        color: "#e2e8f0",
        opacity: loading ? 0.7 : 1,
        minWidth: 160,
      }}
      title="Start your 14-day free trial"
    >
      {loading ? "Starting trial…" : "Start free trial"}
    </button>
  );
}
