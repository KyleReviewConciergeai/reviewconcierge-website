import Link from "next/link";
import SignOutButton from "./SignOutButton";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
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
    } catch (e) {
      alert("Unable to open billing portal.");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 18,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <Link href="/dashboard" style={linkStyle}>
            Dashboard
          </Link>

          <Link href="/dashboard/settings" style={linkStyle}>
            Settings
          </Link>

          <button
            type="button"
            onClick={openBillingPortal}
            style={buttonStyle}
            aria-label="Manage subscription"
          >
            Manage subscription
          </button>
        </div>

        {/* Right side: keep Sign out aligned to the right edge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 10,
          }}
        >
          <SignOutButton />
        </div>
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
  display: "inline-block",
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  textDecoration: "none",
  color: "#e2e8f0",
  background: "rgba(15,23,42,0.4)",
  cursor: "pointer",
};
