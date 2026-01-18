"use client";

import * as React from "react";

export default function ManageSubscriptionButton({
  style,
}: {
  style: React.CSSProperties;
}) {
  async function openBillingPortal() {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json?.ok || !json?.url) {
        alert(json?.error || "Unable to open billing portal.");
        return;
      }

      window.location.href = json.url;
    } catch {
      alert("Unable to open billing portal.");
    }
  }

  return (
    <button
      type="button"
      onClick={openBillingPortal}
      style={style}
      aria-label="Manage subscription"
    >
      Manage subscription
    </button>
  );
}
