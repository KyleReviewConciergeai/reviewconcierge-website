import { supabaseBrowser } from "@/lib/supabaseBrowser";

type EnsureProfileResult = {
  ok: boolean;
  organizationId?: string | null;
  error?: string;
};

/**
 * Doctrine:
 * - Prefer server-side profile/org provisioning (org-first).
 * - Client should not be responsible for writing organization_id.
 *
 * This helper:
 * 1) If logged in, calls POST /api/profile/ensure (server does the real work).
 * 2) Fallback: upsert minimal profile fields client-side (email) if endpoint isn't present yet.
 */
export async function ensureProfile(): Promise<EnsureProfileResult> {
  const supabase = supabaseBrowser();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: userErr.message };

  const user = userData.user;
  if (!user) return { ok: true, organizationId: null }; // not logged in

  // ✅ Preferred: server ensures profile + org_id correctly (fail-closed for org logic)
  try {
    const res = await fetch("/api/profile/ensure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Send only what the server might need; server must trust auth, not this payload
      body: JSON.stringify({ email: user.email ?? null }),
      cache: "no-store",
    });

    // If route not found / not implemented yet, we'll fall back.
    if (res.ok) {
      const json = (await res.json().catch(() => ({}))) as any;
      if (json?.ok) {
        return { ok: true, organizationId: json.organizationId ?? null };
      }
      return { ok: false, error: json?.error ?? "Failed to ensure profile" };
    }

    // Fall back for 404/405 or temporary issues
  } catch {
    // ignore and fallback
  }

  // ⚠️ Fallback (temporary): minimal client-side upsert of the user's own profile.
  // This requires RLS to allow users to upsert their own row where id = auth.uid().
  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: "id" }
    );

  if (upsertErr) return { ok: false, error: upsertErr.message };

  return { ok: true, organizationId: null };
}
