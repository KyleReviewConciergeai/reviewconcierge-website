"use client";

import { useState } from "react";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    try {
      setLoading(true);
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <button type="button" onClick={onSignOut} style={buttonStyle} disabled={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}

const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  textDecoration: "none",
  color: "#e2e8f0",
  background: "rgba(15,23,42,0.4)",
  cursor: "pointer",
  fontWeight: 700,
  opacity: 1,
};
