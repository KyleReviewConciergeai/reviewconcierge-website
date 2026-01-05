export const runtime = "nodejs";

import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Doctrine:
 * - Org-first: every logged-in user must have profiles.organization_id
 * - Server is the source of truth for provisioning profile + org
 * - Use user-auth (cookie session) to identify the user
 * - Use service role for provisioning writes (avoids RLS edge cases during onboarding)
 */

function safeEmail(v: unknown) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 320) : null;
}

function newUuid() {
  // Node 18+ supports crypto.randomUUID(); use fallback just in case.
  // @ts-ignore
  return typeof crypto.randomUUID === "function"
    // @ts-ignore
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (crypto.randomBytes(1)[0] % 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

async function ensureOrganizationRow(orgId: string) {
  // Best-effort: your DB may or may not enforce an organizations FK.
  // If organizations table exists, try inserting the org id with minimal columns.
  const admin = supabaseServer();

  // Attempt 1: insert only { id }
  const attempt1 = await admin.from("organizations").insert({ id: orgId }).select("id").maybeSingle();

  if (!attempt1.error) return { ok: true as const };

  // If table doesn’t exist or insert fails due to schema differences,
  // we’ll proceed—profile update may still work if no FK exists.
  // (We deliberately do NOT throw here; profile update is the primary requirement.)
  console.warn("[profile/ensure] organizations insert attempt failed:", attempt1.error?.message);

  return { ok: false as const, error: attempt1.error?.message ?? "organizations insert failed" };
}

export async function POST(req: Request) {
  try {
    // 1) Identify user from cookie session (anon server client)
    const sb = await supabaseServerClient();
    const { data: authData, error: authErr } = await sb.auth.getUser();

    const user = authData?.user;
    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // Optional input (never trusted for identity)
    const body = await req.json().catch(() => ({}));
    const emailFromBody = safeEmail(body?.email);
    const email = user.email ?? emailFromBody ?? null;

    const admin = supabaseServer();

    // 2) Read existing profile (service role avoids RLS issues during onboarding)
    const { data: existingProfile, error: profErr } = await admin
      .from("profiles")
      .select("id, organization_id, email")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { ok: false, error: `Profile lookup failed: ${profErr.message}` },
        { status: 500 }
      );
    }

    const existingOrgId = (existingProfile?.organization_id as string | null) ?? null;

    // 3) If org already exists, ensure email is set and return
    if (existingOrgId) {
      // Optional: keep email filled in (safe + nice-to-have)
      if (email && (!existingProfile?.email || String(existingProfile.email).trim() !== email)) {
        await admin
          .from("profiles")
          .update({ email })
          .eq("id", user.id);
      }

      return NextResponse.json(
        { ok: true, organizationId: existingOrgId },
        { status: 200 }
      );
    }

    // 4) No org yet → create an org id and best-effort create org row
    const newOrgId = newUuid();

    await ensureOrganizationRow(newOrgId);

    // 5) Upsert profile with org_id
    const { error: upsertErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email,
          organization_id: newOrgId,
        },
        { onConflict: "id" }
      );

    if (upsertErr) {
      return NextResponse.json(
        { ok: false, error: `Profile upsert failed: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, organizationId: newOrgId }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
