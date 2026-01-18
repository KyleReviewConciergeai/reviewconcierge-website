"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Mode = "request" | "update";

function getBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "https://www.reviewconcierge.ai";
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [error, setError] = useState<string>("");

  const baseUrl = useMemo(() => getBaseUrl(), []);

  useEffect(() => {
    const supabase = supabaseBrowser();

    const code = searchParams.get("code");
    const type = (searchParams.get("type") || "").toLowerCase();
    const hasRecoverySignals =
      type === "recovery" ||
      !!code ||
      !!searchParams.get("token") ||
      !!searchParams.get("access_token");

    // If the reset link includes a "code" (PKCE), exchange it for a session.
    // This is what makes the "Choose a new password" view reliably appear in prod.
    (async () => {
      try {
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setError(error.message || "Invalid or expired reset link. Please request a new one.");
            setMode("request");
            return;
          }
          setMode("update");
          return;
        }

        // If no code, but we have other recovery signals, try session.
        if (hasRecoverySignals) {
          const { data } = await supabase.auth.getSession();
          if (data.session) setMode("update");
        } else {
          // Normal visit
          const { data } = await supabase.auth.getSession();
          if (data.session) setMode("update");
        }
      } catch (e: any) {
        // Fail open to request mode with a helpful message
        setMode("request");
        setError(e?.message || "Could not validate reset link. Please request a new one.");
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setMode("update");
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function onRequestReset(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setMsg("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const redirectTo = `${baseUrl}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
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
    if (loading) return;

    setError("");
    setMsg("");

    const pw = newPassword.trim();
    const pw2 = confirmPassword.trim();

    if (pw.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pw !== pw2) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;

      await supabase.auth.signOut();

      setMsg("Password updated. Redirecting…");
      setTimeout(() => {
        router.push("/login?next=/dashboard");
        router.refresh();
      }, 700);
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
              autoComplete="email"
              disabled={loading}
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
              placeholder="New password (min 8 chars)"
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
              style={inputStyle}
            />

            <input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              type="password"
              autoComplete="new-password"
              required
              disabled={loading}
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

export default function ResetPasswordPage() {
  // ✅ REQUIRED when using useSearchParams in App Router
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <ResetPasswordInner />
    </Suspense>
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
