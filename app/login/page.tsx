"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/**
 * Prevent open redirects. Only allow relative paths starting with "/".
 * Fallback to "/dashboard" if invalid.
 */
function safeNextPath(raw: string | null | undefined) {
  const v = (raw ?? "").trim();
  if (!v) return "/dashboard";

  // Only allow same-origin relative paths
  if (!v.startsWith("/")) return "/dashboard";

  // Disallow protocol-relative URLs like "//evil.com"
  if (v.startsWith("//")) return "/dashboard";

  // Optional: you can restrict to known routes if you want stricter:
  // const allowedPrefixes = ["/dashboard", "/connect", "/welcome", "/account"];
  // if (!allowedPrefixes.some((p) => v.startsWith(p))) return "/dashboard";

  return v;
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const supabase = useMemo(() => supabaseBrowser(), []);

  // Support both legacy `next` and newer `redirectTo`
  const next = useMemo(() => {
    const raw = searchParams.get("redirectTo") || searchParams.get("next") || "/dashboard";
    return safeNextPath(raw);
  }, [searchParams]);

  // If already logged in, skip this page.
  useEffect(() => {
    let isMounted = true;

    async function boot() {
      const { data, error } = await supabase.auth.getUser();
      if (!isMounted) return;

      // If user exists, redirect away (avoid login screen flash)
      if (!error && data?.user) {
        router.replace(next);
        router.refresh();
      }
    }

    boot();

    return () => {
      isMounted = false;
    };
  }, [supabase, router, next]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setLoading(true);

    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInErr) {
        setError(signInErr.message);
        setLoading(false);
        return;
      }

      // Replace keeps browser history clean (no back to login after success)
      router.replace(next);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Log in</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          disabled={loading}
          style={inputStyle}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
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
          {loading ? "Logging in…" : "Log in"}
        </button>

        {error ? <div style={{ color: "#ffb3b3", fontSize: 13 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 12, marginTop: 6, opacity: 0.85 }}>
          <a href="/signup" style={{ color: "inherit", textDecoration: "underline" }}>
            Create account
          </a>
          <a href="/reset-password" style={{ color: "inherit", textDecoration: "underline" }}>
            Reset password
          </a>
        </div>
      </form>
    </main>
  );
}

export default function LoginPage() {
  // ✅ Suspense wrapper required when using useSearchParams in App Router
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <LoginInner />
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
