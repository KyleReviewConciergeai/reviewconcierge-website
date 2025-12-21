"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();

  const redirectTo = useMemo(() => params.get("redirectTo") || "/dashboard", [params]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      router.push(redirectTo);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>Log in</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Access your ReviewConcierge dashboard.
      </p>

      <form onSubmit={onLogin} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
          style={inputStyle}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="current-password"
          required
          style={inputStyle}
        />

        <button disabled={loading} style={buttonStyle}>
          {loading ? "Logging in…" : "Log in"}
        </button>

        {error && <div style={{ color: "#ffb3b3" }}>{error}</div>}

        <div style={{ display: "flex", gap: 12, fontSize: 14, opacity: 0.9 }}>
          <a href="/signup">Create account</a>
          <a href="/reset-password">Forgot password?</a>
        </div>
      </form>
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
