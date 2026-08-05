import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CREATE-PACK-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

// Unambiguous alphabet (no 0/O, 1/I)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    groups.push(s);
  }
  return `PACK-${groups.join("-")}`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const { data: userData, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userError || !userData.user?.email) throw new Error("User not authenticated");
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body.product_id;
    const isGift = Boolean(body.is_gift);
    const recipientName: string | null = body.recipient_name?.toString().trim() || null;
    if (!productId) throw new Error("product_id required");
    if (isGift && recipientName && recipientName.length > 80) {
      throw new Error("Recipient name too long");
    }

    const { data: product, error: productErr } = await supabase
      .from("pack_products")
      .select("id, name, hours, price, validity_days, is_active")
      .eq("id", productId)
      .maybeSingle();

    if (productErr || !product) throw new Error("Pack not found");
    if (!product.is_active) throw new Error("That pack is no longer available");

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name")
      .eq("user_id", user.id)
      .maybeSingle();
    const purchaserName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();

    // Gift purchases get a redemption code up front
    let redemptionCode: string | null = null;
    if (isGift) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateCode();
        const { data: existing } = await supabase
          .from("pack_lots")
          .select("id")
          .eq("redemption_code", candidate)
          .maybeSingle();
        if (!existing) {
          redemptionCode = candidate;
          break;
        }
      }
      if (!redemptionCode) throw new Error("Could not generate unique code");
    }

    const { data: lot, error: lotErr } = await supabase
      .from("pack_lots")
      .insert({
        user_id: isGift ? null : user.id,
        product_id: product.id,
        product_name: product.name,
        hours_total: product.hours,
        hours_remaining: product.hours,
        price_paid: product.price,
        validity_days: product.validity_days,
        status: "pending_payment",
        is_gift: isGift,
        redemption_code: redemptionCode,
        purchaser_user_id: user.id,
        purchaser_email: user.email,
        purchaser_name: purchaserName || null,
        recipient_name: recipientName,
      })
      .select("id")
      .single();

    if (lotErr || !lot) throw new Error("Failed to create pack record");

    const tenant = await getTenant();
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const origin = req.headers.get("origin") || tenantBookingUrl(tenant, "/");

    const metadata = { purpose: "pack", pack_lot_id: lot.id, user_id: user.id };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `${product.name} — ${Number(product.hours)} hours`,
              description: isGift
                ? `Gift pack${recipientName ? ` for ${recipientName}` : ""} · valid ${product.validity_days} days from redemption`
                : `Valid ${product.validity_days} days from purchase`,
            },
            unit_amount: Math.round(Number(product.price) * 100),
          },
          quantity: 1,
        },
      ],
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/my-account?pack=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/my-account?pack=cancelled`,
    });

    await supabase.from("pack_lots").update({ stripe_session_id: session.id }).eq("id", lot.id);

    log("Checkout created", { lotId: lot.id, isGift });

    return new Response(JSON.stringify({ url: session.url, pack_lot_id: lot.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
