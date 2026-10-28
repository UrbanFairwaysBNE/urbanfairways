import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { getTenant } from "../_shared/tenant.ts";
import { normalizeEmail, validUnsubscribeToken } from "../_shared/marketing-unsubscribe.ts";

const schema = z.object({ email: z.string().trim().email().max(254), token: z.string().nullable().optional(), source: z.enum(["admin", "link"]).optional() });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = new URL(req.url);
    const body = req.headers.get("content-type")?.includes("application/json")
      ? await req.json()
      : { email: url.searchParams.get("email"), token: url.searchParams.get("token") };
    const parsed = schema.safeParse(body);
    if (!parsed.success) return json({ error: "A valid email address is required" }, 400);
    const email = normalizeEmail(parsed.data.email);
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", secret, { auth: { persistSession: false } });
    const isAdminRequest = parsed.data.source === "admin";
    if (isAdminRequest) {
      const authorization = req.headers.get("Authorization");
      if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
      const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
      if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
      const { data: admin, error: roleError } = await client.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
      if (roleError || !admin) return json({ error: "Admin access required" }, 403);
    } else {
      const tenant = await getTenant();
      if (!parsed.data.token || !await validUnsubscribeToken(email, parsed.data.token, secret, tenant.venue_name)) {
        return json({ error: "Invalid unsubscribe link. Please use the link in your email." }, 400);
      }
    }
    // Persist suppression for every address, including recipients without a profile.
    const { data: existing, error: readError } = await client.from("marketing_unsubscribes").select("id").eq("email", email).limit(1);
    if (readError) throw readError;
    if (!existing?.length) {
      const { error } = await client.from("marketing_unsubscribes").insert({ email, reason: isAdminRequest ? "admin_unsubscribed" : "user_unsubscribed" });
      if (error) throw error;
    }
    const { error } = await client.from("profiles").update({ marketing_opt_out: true }).ilike("email", email);
    if (error) throw error;
    return json({ success: true, message: "Unsubscribed successfully" });
  } catch (error) {
    console.error("[marketing-unsubscribe] Request failed", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Unable to unsubscribe right now. Please try again." }, 500);
  }
});
