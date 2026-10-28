export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function unsubscribeToken(email: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(normalizeEmail(email)));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}

export async function validUnsubscribeToken(email: string, token: string, secret: string, venueName: string): Promise<boolean> {
  if (token === await unsubscribeToken(email, secret)) return true;
  // Preserve links in previously delivered emails during the token upgrade.
  for (const salt of ["venue-unsubscribe-salt", `${venueName.toLowerCase().replace(/\s+/g, "-")}-unsubscribe-salt`]) {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizeEmail(email) + salt));
    const legacy = Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
    if (token === legacy) return true;
  }
  return false;
}

export function unsubscribeUrl(domain: string, email: string, token: string): string {
  const origin = new URL(/^https?:\/\//i.test(domain) ? domain : `https://${domain}`).origin;
  const url = new URL("/unsubscribe", origin);
  url.searchParams.set("email", normalizeEmail(email));
  url.searchParams.set("token", token);
  return url.toString();
}

export async function isMarketingSuppressed(client: any, email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  const [{ data: profiles, error: profileError }, { data: events, error: eventError }] = await Promise.all([
    client.from("profiles").select("marketing_opt_out").ilike("email", normalized),
    client.from("marketing_unsubscribes").select("id").eq("email", normalized).limit(1),
  ]);
  if (profileError || eventError) throw new Error("Unable to check marketing preferences");
  return profiles?.some((p: { marketing_opt_out: boolean }) => p.marketing_opt_out) || events?.length > 0;
}