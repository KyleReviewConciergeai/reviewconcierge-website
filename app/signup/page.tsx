"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Prevent open redirects. Only allow relative paths starting with "/".
 * Fallback to "/welcome" if invalid.
 */
function safeNextPath(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (!v) return "/welcome";
  if (!v.startsWith("/")) return "/welcome";
  if (v.startsWith("//")) return "/welcome";
  return v;
}

function isLikelyStrongPassword(pw: string) {
  // Light guardrails; Supabase may enforce stronger rules via auth settings anyway.
  return pw.length >= 8;
}

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [successNote, setSuccessNote] = useState<string>("");

  // Support both `next` and `redirectTo` (consistent with login)
  const next = useMemo(() => {
    const raw = searchParams.get("redirectTo") || searchParams.get("next") || "/welcome";
    return safeNextPath(raw);
  }, [searchParams]);

  async function ensureOrgAndProfile(userId: string, userEmail: string | null) {
    /**
     * Doctrine: org-first scoping.
     * Create an organization row, then store org_id on profile.
     * If you already have a DB trigger that creates org/profile automatically,
     * this will typically no-op (or you can remove it).
     */

    // 1) Create org
    const { data: org, error: orgErr } = await supabase
      .from("organizations")
      .insert({
        name: userEmail ? userEmail.split("@")[0] : "My Organization",
      })
      .select("id")
      .single();

    if (orgErr) throw orgErr;
    const organizationId = org?.id;
    if (!organizationId) throw new Error("Failed to create organization.");

    // 2) Upsert profile with org_id
    const { error: profErr } = await supabase.from("profiles").upsert(
      {
        id: userId,
        email: userEmail,
        organization_id: organizationId,
      },
      { onConflict: "id" }
    );

    if (profErr) throw profErr;
  }

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setSuccessNote("");

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }
    if (!password) {
      setError("Password is required.");
      return;
    }
    if (!isLikelyStrongPassword(password)) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        // Optional: if you use email confirmations and want a specific callback
        // options: { emailRedirectTo: `${window.location.origin}/welcome` },
      });

      if (signUpErr) throw signUpErr;

      const user = data?.user ?? null;
      const session = data?.session ?? null;

      // If we have a user id, create org/profile now (prevents later requireOrgContext failures).
      if (user?.id) {
        await ensureOrgAndProfile(user.id, user.email ?? trimmedEmail);
      }

      // If email confirmation is enabled, session can be null.
      if (!session) {
        setSuccessNote(
          "Check your email to confirm your account, then come back to log in."
        );
        router.replace("/login");
        router.refresh();
        return;
      }

      // If session exists, user is logged in immediately — send them onward.
      router.replace(next);
      router.refresh();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Signup failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Create account</h1>
      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Start replying to reviews with confidence.
      </p>

      <form onSubmit={onSignup} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
          disabled={loading}
          style={inputStyle}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ characters)"
          type="password"
          autoComplete="new-password"
          required
          disabled={loading}
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.7)",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
            opacity: loading || !email.trim() || !password ? 0.7 : 1,
          }}
        >
          {loading ? "Creating…" : "Create account"}
        </button>

        {error ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{error}</div> : null}
        {successNote ? (
          <div style={{ color: "rgba(226,232,240,0.85)", fontSize: 13 }}>
            {successNote}
          </div>
        ) : null}

        <div style={{ marginTop: 6, opacity: 0.85 }}>
          <a href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
            Back to login
          </a>
        </div>
      </form>
    </main>
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
