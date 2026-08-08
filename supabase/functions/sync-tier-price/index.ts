import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const log = (step: string, details?: unknown) =>
  console.log(`[SYNC-TIER-PRICE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // --- auth: admins only -------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);
    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    );
    const { data: userData, error: userErr } = await anon.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Not authenticated" }, 401);

    const { data: isAdmin } = await admin.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) return json({ error: "Admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const tierKey: string | undefined = body.tierKey;
    const weeklyPrice = Number(body.weeklyPrice);
    const dryRun = body.dryRun === true;

    if (!tierKey || !Number.isFinite(weeklyPrice) || weeklyPrice <= 0) {
      return json({ error: "tierKey and a positive weeklyPrice are required" }, 400);
    }

    const { data: tier, error: tierErr } = await admin
      .from("pricing_config")
      .select("tier,display_name,stripe_product_id,stripe_price_id,weekly_subscription_price,is_subscription,is_default")
      .eq("tier", tierKey)
      .maybeSingle();
    if (tierErr || !tier) return json({ error: "Tier not found" }, 404);
    if (tier.is_default || !tier.is_subscription) {
      return json({ error: "That tier is not a Stripe subscription tier" }, 400);
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const unitAmount = Math.round(weeklyPrice * 100);

    // --- resolve / create the Stripe product -------------------------------
    let productId = tier.stripe_product_id as string | null;
    if (!productId && tier.stripe_price_id) {
      const existing = await stripe.prices.retrieve(tier.stripe_price_id);
      productId = typeof existing.product === "string" ? existing.product : existing.product.id;
    }
    if (!productId) {
      if (dryRun) return json({ error: "Tier has no Stripe product yet" }, 400);
      const product = await stripe.products.create({
        name: tier.display_name,
        metadata: { tier: tier.tier },
      });
      productId = product.id;
      log("Created product", { productId });
    }

    const oldPriceId = tier.stripe_price_id as string | null;

    // Already on the right amount? Nothing to do.
    if (oldPriceId) {
      const current = await stripe.prices.retrieve(oldPriceId);
      if (current.active && current.unit_amount === unitAmount && current.currency === "aud") {
        return json({ ok: true, unchanged: true, priceId: oldPriceId, migrated: 0 });
      }
    }

    // How many live subscriptions will move?
    const affected: { subscriptionId: string; itemId: string }[] = [];
    if (oldPriceId) {
      let starting_after: string | undefined;
      // Stripe caps list pages at 100 — page through them all.
      while (true) {
        const page = await stripe.subscriptions.list({
          price: oldPriceId,
          status: "active",
          limit: 100,
          starting_after,
        });
        for (const sub of page.data) {
          const item = sub.items.data.find((i) => i.price.id === oldPriceId);
          if (item) affected.push({ subscriptionId: sub.id, itemId: item.id });
        }
        if (!page.has_more) break;
        starting_after = page.data[page.data.length - 1]?.id;
      }
    }

    if (dryRun) {
      return json({ ok: true, dryRun: true, affected: affected.length, oldPriceId });
    }

    // --- create the new weekly price ---------------------------------------
    const newPrice = await stripe.prices.create(
      {
        product: productId,
        currency: "aud",
        unit_amount: unitAmount,
        recurring: { interval: "week" },
        metadata: { tier: tier.tier },
      },
      { idempotencyKey: `tierprice_${tier.tier}_${unitAmount}_aud_week` },
    );
    log("Created price", { priceId: newPrice.id, unitAmount });

    const { error: updErr } = await admin
      .from("pricing_config")
      .update({
        stripe_price_id: newPrice.id,
        stripe_product_id: productId,
        weekly_subscription_price: weeklyPrice,
      })
      .eq("tier", tier.tier);
    if (updErr) throw new Error(`Saved in Stripe but not in the database: ${updErr.message}`);

    // --- move every active subscriber onto the new price -------------------
    let migrated = 0;
    const failures: { subscriptionId: string; error: string }[] = [];
    for (const a of affected) {
      try {
        await stripe.subscriptions.update(a.subscriptionId, {
          items: [{ id: a.itemId, price: newPrice.id }],
          proration_behavior: "create_prorations",
          billing_cycle_anchor: "unchanged",
        });
        migrated++;
      } catch (e) {
        failures.push({ subscriptionId: a.subscriptionId, error: (e as Error).message });
      }
    }

    // Retire the old price so nothing new can attach to it.
    if (oldPriceId && failures.length === 0) {
      try {
        await stripe.prices.update(oldPriceId, { active: false });
      } catch (e) {
        log("Could not archive old price", { oldPriceId, error: (e as Error).message });
      }
    }

    log("Done", { migrated, failures: failures.length });
    return json({ ok: true, priceId: newPrice.id, migrated, failures });
  } catch (e) {
    log("ERROR", { message: (e as Error).message });
    return json({ error: (e as Error).message }, 500);
  }
});
