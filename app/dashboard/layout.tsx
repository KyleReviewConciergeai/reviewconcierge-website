import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  async function onSignOut() {
    try {
      // Supabase sign-out endpoint (added in earlier work)
      await fetch("/api/auth/signout", { method: "POST" });
    } finally {
      // Always bounce to home (safe even if request fails)
      window.location.href = "/";
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link href="/dashboard" style={linkStyle}>
            Dashboard
          </Link>
          <Link href="/dashboard/settings" style={linkStyle}>
            Settings
          </Link>
        </div>

        <button type="button" onClick={onSignOut} style={buttonStyle}>
          Sign out
        </button>
      </div>

      {children}
    </main>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  textDecoration: "none",
  color: "#e2e8f0",
  background: "rgba(15,23,42,0.4)",
};

const buttonStyle: React.CSSProperties = {
  ...linkStyle,
  cursor: "pointer",
  fontWeight: 700,
};
