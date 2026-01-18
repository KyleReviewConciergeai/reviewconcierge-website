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
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type")?.toLowerCase();

    (async () => {
      if (token_hash && type === "recovery") {
        setLoading(true);
        try {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash,
            type: "recovery",
          });
          if (verifyError) throw verifyError;

          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setMode("update");
            setMsg("Reset link verified. Enter your new password below.");
          } else {
            throw new Error("Session not established after verification.");
          }
        } catch (err: any) {
          setError(
            err?.message || "Invalid or expired reset link. Please request a new one."
          );
          setMode("request");
        } finally {
          setLoading(false);
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setMode("update");
        }
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setMode("update");
    });

    return () => sub.subscription.unsubscribe();
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
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
      setMsg("Password updated successfully. Redirecting to login…");

      setTimeout(() => {
        router.push("/login?next=/dashboard");
        router.refresh();
      }, 1500);
    } catch (err: any) {
      setError(err?.message || "Could not update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>
        {mode === "request" ? "Reset password" : "Choose a new password"}
      </h1>

      {mode === "request" ? (
        <>
          <p style={{ opacity: 0.8, margin: "0 0 16px 0", fontSize: 15 }}>
            Enter your email and we’ll send a password reset link.
          </p>
          <form onSubmit={onRequestReset} style={{ display: "grid", gap: 10 }}>
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
            <button
              type="submit"
              disabled={loading || !email.trim()}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                fontWeight: 600,
                opacity: loading || !email.trim() ? 0.7 : 1,
                color: "inherit",
              }}
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>

            {msg && <div style={{ color: "lightgreen", fontSize: 13 }}>{msg}</div>}
            {error && <div style={{ color: "#ffb3b3", fontSize: 13 }}>{error}</div>}

            <div style={{ display: "flex", gap: 12, marginTop: 6, opacity: 0.85 }}>
              <a href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
                Back to login
              </a>
            </div>
          </form>
        </>
      ) : (
        <>
          <p style={{ opacity: 0.8, margin: "0 0 16px 0", fontSize: 15 }}>
            Enter a new password for your account.
          </p>
          <form onSubmit={onUpdatePassword} style={{ display: "grid", gap: 10 }}>
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
            <button
              type="submit"
              disabled={loading || !newPassword.trim() || !confirmPassword.trim()}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                cursor:
                  loading || !newPassword.trim() || !confirmPassword.trim()
                    ? "not-allowed"
                    : "pointer",
                fontWeight: 600,
                opacity:
                  loading || !newPassword.trim() || !confirmPassword.trim() ? 0.7 : 1,
                color: "inherit",
              }}
            >
              {loading ? "Updating…" : "Update password"}
            </button>

            {msg && <div style={{ color: "lightgreen", fontSize: 13 }}>{msg}</div>}
            {error && <div style={{ color: "#ffb3b3", fontSize: 13 }}>{error}</div>}
          </form>
        </>
      )}
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.7)",
  color: "inherit",
  outline: "none",
};