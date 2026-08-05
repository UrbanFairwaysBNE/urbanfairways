import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CANCEL-MEMBERSHIP] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id } = await req.json();

    if (!user_id) throw new Error("user_id is required");
    logStep("Processing cancellation", { user_id });

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, membership_tier, custom_billing")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    logStep("Profile found", { email: profile.email, tier: profile.membership_tier });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find and cancel Stripe subscription
    const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
    
    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
        logStep("Cancelled subscription", { subscriptionId: sub.id });
      }
    } else {
      logStep("No Stripe customer found, skipping subscription cancellation");
    }

    // Update profile to visitor tier
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ membership_tier: "casual" })
      .eq("user_id", user_id);

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }
    logStep("Updated profile to visitor tier");

    // Email notification is now handled by the Stripe webhook (stripe-webhook function)
    // when the subscription.deleted event fires, preventing duplicate emails

    return new Response(
      JSON.stringify({ success: true, message: "Membership cancelled successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
