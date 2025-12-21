import { supabaseBrowser } from "@/lib/supabaseBrowser";

export async function ensureProfile() {
  const supabase = supabaseBrowser();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;

  const user = userData.user;
  if (!user) return; // not logged in

  // Upsert will create the row if missing, or no-op update if it exists
  const { error: upsertErr } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
      },
      { onConflict: "id" }
    );

  if (upsertErr) throw upsertErr;
}
