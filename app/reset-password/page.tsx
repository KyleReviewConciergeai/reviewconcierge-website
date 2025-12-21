"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();

  const [mode, setMode] = useState<"request" | "update">("request");
  const [email, setEmail] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [msg, setMsg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // If the user arrived here from a Supabase recovery link,
    // Supabase will set a session in the browser and we can update password.
    const supabase = supabaseBrowser();

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setMode("update");
    });

    // Also listen for auth state changes (some flows set session after load)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setMode("update");
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function onRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      setMsg("Password reset email sent. Please check your inbox.");
    } catch (err: any) {
      setError(err?.message || "Could not send reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function onUpdatePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMsg("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      setMsg("Password updated. Redirecting to dashboard…");
      setTimeout(() => router.push("/dashboard"), 800);
    } catch (err: any) {
      setError(err?.message || "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>
        {mode === "request" ? "Reset password" : "Choose a new password"}
      </h1>

      {mode === "request" ? (
        <>
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            Enter your email and we’ll send a password reset link.
          </p>

          <form onSubmit={onRequestReset} style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              required
              style={inputStyle}
            />
            <button disabled={loading} style={buttonStyle}>
              {loading ? "Sending…" : "Send reset link"}
            </button>

            {msg && <div style={{ color: "green" }}>{msg}</div>}
            {error && <div style={{ color: "#ffb3b3" }}>{error}</div>}

            <div style={{ fontSize: 14, opacity: 0.9 }}>
              <a href="/login">Back to login</a>
            </div>
          </form>
        </>
      ) : (
        <>
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            Enter a new password for your account.
          </p>

          <form onSubmit={onUpdatePassword} style={{ display: "grid", gap: 10, marginTop: 16 }}>
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              type="password"
              required
              style={inputStyle}
            />

            <button disabled={loading} style={buttonStyle}>
              {loading ? "Updating…" : "Update password"}
            </button>

            {msg && <div style={{ color: "green" }}>{msg}</div>}
            {error && <div style={{ color: "#ffb3b3" }}>{error}</div>}
          </form>
        </>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.15)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  cursor: "pointer",
  fontWeight: 600,
};
