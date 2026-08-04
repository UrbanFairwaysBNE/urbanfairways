import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-MEMBERSHIP-PAYMENTS] ${step}${detailsStr}`);
};

// Map Stripe price IDs to membership tiers
async function getPriceToTierMap(supabase: any): Promise<Record<string, string>> {
  const { data: pricingConfig, error } = await supabase
    .from("pricing_config")
    .select("tier, stripe_price_id")
    .eq("is_subscription", true)
    .not("stripe_price_id", "is", null);

  if (error || !pricingConfig) {
    logStep("Failed to fetch pricing config", { error });
    return {};
  }

  const map: Record<string, string> = {};
  for (const config of pricingConfig) {
    if (config.stripe_price_id) {
      map[config.stripe_price_id] = config.tier;
    }
  }
  logStep("Price to tier map", map);
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get price to tier mapping
    const priceToTier = await getPriceToTierMap(supabaseAdmin);

    // Fetch recent paid invoices from Stripe (last 7 days)
    const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
    
    const invoices = await stripe.invoices.list({
      status: "paid",
      created: { gte: sevenDaysAgo },
      limit: 100,
      expand: ["data.subscription"],
    });

    logStep("Fetched invoices from Stripe", { count: invoices.data.length });

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    for (const invoice of invoices.data) {
      // Skip if not a subscription invoice
      if (!invoice.subscription) {
        skipped++;
        continue;
      }

      const stripeInvoiceId = invoice.id;
      const stripeCustomerId = typeof invoice.customer === "string" 
        ? invoice.customer 
        : invoice.customer?.id;

      if (!stripeCustomerId) {
        logStep("No customer ID for invoice", { invoiceId: stripeInvoiceId });
        skipped++;
        continue;
      }

      // Check if already exists in database
      const { data: existing } = await supabaseAdmin
        .from("membership_payments")
        .select("id")
        .eq("stripe_invoice_id", stripeInvoiceId)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Get customer email from Stripe
      const customer = await stripe.customers.retrieve(stripeCustomerId);
      if (customer.deleted || !("email" in customer) || !customer.email) {
        logStep("Customer deleted or no email", { customerId: stripeCustomerId });
        skipped++;
        continue;
      }

      // Find user by email
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, email")
        .eq("email", customer.email)
        .maybeSingle();

      if (!profile) {
        logStep("No profile found for email", { email: customer.email });
        skipped++;
        continue;
      }

      // Determine tier from subscription
      // Tier comes solely from the price → tier map built from pricing_config
      let tier: string | null = null;
      const subscription = invoice.subscription as Stripe.Subscription;
      if (subscription && subscription.items?.data?.[0]?.price?.id) {
        const priceId = subscription.items.data[0].price.id;
        tier = priceToTier[priceId] ?? null;
      }

      // Insert missing payment
      const amount = (invoice.amount_paid || 0) / 100;
      const paidAt = invoice.status_transitions?.paid_at 
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : new Date().toISOString();

      const periodStart = invoice.period_start 
        ? new Date(invoice.period_start * 1000).toISOString() 
        : null;
      const periodEnd = invoice.period_end 
        ? new Date(invoice.period_end * 1000).toISOString() 
        : null;

      const { error: insertError } = await supabaseAdmin
        .from("membership_payments")
        .insert({
          user_id: profile.user_id,
          stripe_invoice_id: stripeInvoiceId,
          stripe_customer_id: stripeCustomerId,
          amount,
          tier,
          paid_at: paidAt,
          period_start: periodStart,
          period_end: periodEnd,
        });

      if (insertError) {
        logStep("Failed to insert payment", { error: insertError, invoiceId: stripeInvoiceId });
        errors++;
      } else {
        logStep("Synced missing payment", { 
          email: profile.email, 
          amount, 
          tier, 
          invoiceId: stripeInvoiceId 
        });
        synced++;
      }
    }

    logStep("Sync completed", { synced, skipped, errors });

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced, 
        skipped, 
        errors,
        message: `Synced ${synced} missing payments` 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
