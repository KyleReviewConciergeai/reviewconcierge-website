"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Optional: support redirects like /login?next=/dashboard
  const next = searchParams.get("next") || "/dashboard";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = supabaseBrowser();

    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInErr) {
      setError(signInErr.message);
      return;
    }

    router.push(next);
    router.refresh();
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
          style={inputStyle}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.7)",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        {error ? <div style={{ color: "#ffb3b3" }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 12, marginTop: 6, opacity: 0.85 }}>
          <a href="/signup" style={{ color: "inherit", textDecoration: "underline" }}>
            Create account
          </a>
          <a
            href="/reset-password"
            style={{ color: "inherit", textDecoration: "underline" }}
          >
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
