import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Unambiguous alphabet (no 0/O, 1/I)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateCode(): string {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    groups.push(s);
  }
  return `GIFT-${groups.join("-")}`;
}

interface Body {
  amount: number;
  recipient_name: string;
  recipient_email: string;
  sender_name: string;
  sender_email: string;
  personal_message?: string;
  scheduled_for?: string; // YYYY-MM-DD (Brisbane local)
  delivery_method: "email_recipient" | "print_to_sender" | "both";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const tenant = await getTenant();


    // Validation
    const amount = Number(body.amount);
    if (!amount || amount < 10 || amount > 1000) {
      throw new Error("Amount must be between $10 and $1000");
    }
    if (!body.recipient_name || body.recipient_name.trim().length === 0) {
      throw new Error("Recipient name required");
    }
    if (!body.recipient_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.recipient_email)) {
      throw new Error("Valid recipient email required");
    }
    if (!body.sender_name || body.sender_name.trim().length === 0) {
      throw new Error("Sender name required");
    }
    if (!body.sender_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.sender_email)) {
      throw new Error("Valid sender email required");
    }
    if (!["email_recipient", "print_to_sender", "both"].includes(body.delivery_method)) {
      throw new Error("Invalid delivery method");
    }
    if (body.personal_message && body.personal_message.length > 280) {
      throw new Error("Message too long (max 280 chars)");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-07-30.basil",
    });

    // Generate unique redemption code (retry on collision)
    let redemption_code = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateCode();
      const { data: existing } = await supabase
        .from("gift_cards")
        .select("id")
        .eq("redemption_code", candidate)
        .maybeSingle();
      if (!existing) {
        redemption_code = candidate;
        break;
      }
    }
    if (!redemption_code) throw new Error("Could not generate unique code");

    // Insert pending gift card row
    const { data: giftCard, error: insertErr } = await supabase
      .from("gift_cards")
      .insert({
        recipient_email: body.recipient_email.toLowerCase().trim(),
        recipient_name: body.recipient_name.trim(),
        sender_email: body.sender_email.toLowerCase().trim(),
        sender_name: body.sender_name.trim(),
        personal_message: body.personal_message?.trim() || null,
        amount,
        status: "pending_payment",
        source: "web",
        delivery_method: body.delivery_method,
        scheduled_for: body.scheduled_for || null,
        redemption_code,
      })
      .select("id")
      .single();

    if (insertErr || !giftCard) {
      console.error("[create-gift-checkout] Insert error:", insertErr);
      throw new Error("Failed to create gift card record");
    }

    const origin = req.headers.get("origin") || tenantBookingUrl(tenant, "/");

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: body.sender_email.toLowerCase().trim(),
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `${tenant.venue_name} Gift Card — $${amount.toFixed(2)}`,
              description: `For ${body.recipient_name}`,
            },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        purpose: "gift_card",
        gift_card_id: giftCard.id,
      },
      payment_intent_data: {
        metadata: {
          purpose: "gift_card",
          gift_card_id: giftCard.id,
        },
      },
      success_url: `${origin}/gift?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift?cancelled=1`,
    });

    // Save session id for traceability
    await supabase
      .from("gift_cards")
      .update({ stripe_session_id: session.id })
      .eq("id", giftCard.id);

    return new Response(JSON.stringify({ url: session.url, gift_card_id: giftCard.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[create-gift-checkout] Error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
