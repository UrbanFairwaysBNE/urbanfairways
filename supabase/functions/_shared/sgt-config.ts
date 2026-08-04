// Shared SGT club configuration.
//
// Single source of truth for the SGT club slug + club-admin credentials.
// Values live in public.sgt_club_config (service-role only) and fall back to
// the legacy environment variables so nothing breaks during rollout.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";

export interface SgtClubConfig {
  clubUrl: string;
  username: string | null;
  password: string | null;
  credentialsValid: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
}

let cached: SgtClubConfig | null = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function getSgtConfig(force = false): Promise<SgtClubConfig> {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;

  const envClub = Deno.env.get("SGT_CLUB_URL") || "";
  const envUser = Deno.env.get("SGT_USERNAME") || null;
  const envPass = Deno.env.get("SGT_PASSWORD") || null;

  let row: Record<string, unknown> | null = null;
  try {
    const { data } = await adminClient()
      .from("sgt_club_config")
      .select("*")
      .eq("id", "global")
      .maybeSingle();
    row = (data as Record<string, unknown> | null) ?? null;
  } catch (e) {
    console.error("[SGT-CONFIG] Failed to load sgt_club_config:", e);
  }

  cached = {
    clubUrl: (row?.club_url as string) || envClub || Deno.env.get("TENANT_SGT_CLUB_SLUG") || "",
    username: (row?.sgt_username as string) || envUser,
    password: (row?.sgt_password as string) || envPass,
    credentialsValid: Boolean(row?.credentials_valid),
    lastVerifiedAt: (row?.last_verified_at as string) ?? null,
    lastError: (row?.last_error as string) ?? null,
  };
  cachedAt = Date.now();
  return cached;
}

/** Convenience helper — the club slug used in every SGT club-admin URL. */
export async function getClubUrl(): Promise<string> {
  return (await getSgtConfig()).clubUrl;
}

/** Records the outcome of a credential check so the admin UI can surface it. */
export async function recordSgtStatus(
  valid: boolean,
  error: string | null,
): Promise<void> {
  try {
    await adminClient()
      .from("sgt_club_config")
      .upsert({
        id: "global",
        credentials_valid: valid,
        last_verified_at: new Date().toISOString(),
        last_error: error,
      }, { onConflict: "id" });
  } catch (e) {
    console.error("[SGT-CONFIG] Failed to record status:", e);
  }
  cached = null;
}

/**
 * Creates a fresh daily API key using the stored credentials and caches it in
 * sgt_api_config. This is the ONLY place a key should be minted.
 */
export async function createSgtApiKey(): Promise<{ key: string; expiresAt: string }> {
  const config = await getSgtConfig(true);
  if (!config.username || !config.password) {
    await recordSgtStatus(false, "SGT username/password not configured");
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", config.username);
  formData.append("password", config.password);

  const response = await fetch(`${SGT_BASE_URL}/${config.clubUrl}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!data?.success || !data?.key) {
    const message = `SGT authentication failed: ${JSON.stringify(data)}`;
    await recordSgtStatus(false, message);
    throw new Error(message);
  }

  const expiresAt = new Date(Date.now() + (data.expires ?? 86400) * 1000).toISOString();

  const client = adminClient();
  await client.from("sgt_api_config").delete().neq("api_key", "");
  await client.from("sgt_api_config").insert({
    api_key: data.key,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  await recordSgtStatus(true, null);
  return { key: data.key, expiresAt };
}

/** Returns a valid cached key, minting a new one only if the cache is empty/expired. */
export async function getSgtApiKey(): Promise<string> {
  const { data } = await adminClient()
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as { api_key: string; expires_at: string } | null;
  if (row?.api_key && new Date(row.expires_at).getTime() - Date.now() > 60_000) {
    return row.api_key;
  }

  const created = await createSgtApiKey();
  return created.key;
}
