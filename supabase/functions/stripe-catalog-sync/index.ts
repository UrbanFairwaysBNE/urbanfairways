// TEMPORARY one-off: creates Stripe products + prices for membership tiers and packs.
// Guarded by a one-time token; deleted after use.
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-setup-token",
};

const TOKEN = "uf-catalog-2026-08-08-4f7a1c";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (req.headers.get("x-setup-token") !== TOKEN) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const results: unknown[] = [];

    // ---- Membership tiers -> recurring weekly prices ----
    const { data: tiers } = await supabase
      .from("pricing_config")
      .select("tier, display_name, weekly_subscription_price, hourly_rate, is_subscription, stripe_product_id, stripe_price_id")
      .eq("is_subscription", true)
      .order("display_order");

    for (const t of tiers ?? []) {
      const amount = Math.round(Number(t.weekly_subscription_price ?? 0) * 100);
      if (!amount) continue;

      let productId = t.stripe_product_id as string | null;
      if (!productId) {
        const product = await stripe.products.create({
          name: `${t.display_name} Membership`,
          description: `Urban Fairways ${t.display_name} membership — $${Number(t.weekly_subscription_price).toFixed(2)}/week, $${Number(t.hourly_rate).toFixed(2)}/hour bay hire`,
          metadata: { tier: t.tier, kind: "membership" },
        });
        productId = product.id;
      }

      let priceId = t.stripe_price_id as string | null;
      if (!priceId) {
        const price = await stripe.prices.create({
          product: productId,
          currency: "aud",
          unit_amount: amount,
          recurring: { interval: "week" },
          metadata: { tier: t.tier },
        });
        priceId = price.id;
        await stripe.products.update(productId, { default_price: priceId });
      }

      await supabase
        .from("pricing_config")
        .update({ stripe_product_id: productId, stripe_price_id: priceId })
        .eq("tier", t.tier);

      results.push({ type: "membership", tier: t.tier, productId, priceId });
    }

    // ---- Packs -> one-off prices ----
    const { data: packs } = await supabase
      .from("pack_products")
      .select("id, name, hours, price, validity_days, is_corporate, stripe_product_id, stripe_price_id");

    for (const p of packs ?? []) {
      const amount = Math.round(Number(p.price) * 100);
      if (!amount) continue;

      let productId = p.stripe_product_id as string | null;
      if (!productId) {
        const product = await stripe.products.create({
          name: `${p.name} — ${Number(p.hours)} hours`,
          description: `Valid ${p.validity_days} days${p.is_corporate ? " · corporate shared wallet" : ""}`,
          metadata: { pack_id: p.id, kind: p.is_corporate ? "corporate_pack" : "prepaid_pack" },
        });
        productId = product.id;
      }

      let priceId = p.stripe_price_id as string | null;
      if (!priceId) {
        const price = await stripe.prices.create({
          product: productId,
          currency: "aud",
          unit_amount: amount,
          metadata: { pack_id: p.id },
        });
        priceId = price.id;
        await stripe.products.update(productId, { default_price: priceId });
      }

      await supabase
        .from("pack_products")
        .update({ stripe_product_id: productId, stripe_price_id: priceId })
        .eq("id", p.id);

      results.push({ type: "pack", name: p.name, productId, priceId });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
