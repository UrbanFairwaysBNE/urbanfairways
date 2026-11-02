import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";
import { complimentaryProfileUpdate, assertNoPaidMembership } from "../_shared/complimentary-membership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: auth, error: authError } = await client.auth.getUser(authorization.slice(7));
    if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);
    const { data: admin, error: roleError } = await client.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
    if (roleError || !admin) return json({ error: "Admin access required" }, 403);
    const { user_id, tier } = await req.json();
    if (typeof user_id !== "string" || typeof tier !== "string") return json({ error: "Customer and membership tier are required" }, 400);
    const { data: selectedTier, error: tierError } = await client.from("pricing_config").select("tier, is_subscription, is_default").eq("tier", tier).single();
    if (tierError || !selectedTier) return json({ error: "Membership tier not found" }, 400);
    const update = complimentaryProfileUpdate(selectedTier);
    const { data: profile, error: profileError } = await client.from("profiles").select("email, stripe_customer_id").eq("user_id", user_id).single();
    if (profileError || !profile) return json({ error: "Customer not found" }, 404);
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("Cannot verify existing billing right now. Please try again later.");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerIds = new Set<string>();
    if (profile.stripe_customer_id) customerIds.add(profile.stripe_customer_id);
    if (profile.email) {
      for await (const customer of stripe.customers.list({ email: profile.email, limit: 100 })) customerIds.add(customer.id);
    }
    for (const customerId of customerIds) {
      const statuses: string[] = [];
      for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) statuses.push(sub.status);
      let openCheckout = false;
      for await (const session of stripe.checkout.sessions.list({ customer: customerId, status: "open", limit: 100 })) {
        if (session.mode === "subscription") openCheckout = true;
      }
      assertNoPaidMembership(statuses, openCheckout);
    }
    const { data: saved, error: saveError } = await client.from("profiles").update(update).eq("user_id", user_id).select("user_id, membership_tier, custom_billing, membership_on_hold").single();
    if (saveError) throw saveError;
    return json({ success: true, profile: saved });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unable to assign membership" }, 400);
  }
});