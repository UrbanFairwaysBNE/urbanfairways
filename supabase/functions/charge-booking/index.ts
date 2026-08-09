import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getTenant, tenantBookingUrl } from "../_shared/tenant.ts";
import { loadTiers, calculateTierHourlyRate } from "../_shared/tiers.ts";

// Off-peak: Mon-Fri 5:30am-4:00pm, Sat-Sun 5:30am-10:00am. Everything else is peak.
function isPeakTime(dateStr: string, startTime: string): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay();
  const [h, m] = startTime.split(":").map(Number);
  const minutes = h * 60 + (m || 0);
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const start = 5 * 60 + 30;
  const end = weekend ? 10 * 60 : 16 * 60;
  return !(minutes >= start && minutes < end);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHARGE-BOOKING] ${step}${detailsStr}`);
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { bookingId, amount, description, paymentMethodId, mode } = await req.json();
    const tenant = await getTenant();

    if (!bookingId || !amount) throw new Error("Missing bookingId or amount");
    logStep("Request parsed", { bookingId, amount, description, paymentMethodId, mode });

    // Fix B: guard against rapid duplicate bookings. If this user already has
    // ANOTHER confirmed booking created in the last 90s (different bookingId),
    // block this charge to prevent double-charging on accidental double-clicks.
    const { data: currentBooking } = await supabaseClient
      .from("bookings")
      .select("id, bay_id, booking_date, start_time, duration_hours, pack_hours_used, status")
      .eq("id", bookingId)
      .maybeSingle();


    if (currentBooking) {
      const since = new Date(Date.now() - 90 * 1000).toISOString();
      const { data: recentDupes } = await supabaseClient
        .from("bookings")
        .select("id, stripe_payment_intent_id, created_at")
        .eq("user_id", user.id)
        .eq("status", "confirmed")
        .neq("id", bookingId)
        .gte("created_at", since);

      if (recentDupes && recentDupes.length > 0) {
        logStep("Blocked duplicate booking attempt", {
          bookingId,
          existingBookingId: recentDupes[0].id,
          windowSeconds: 90,
        });
        return new Response(JSON.stringify({
          error: "You just made another booking a few seconds ago. If that wasn't intentional, please refresh — otherwise wait a minute before trying again.",
          code: "duplicate_booking_blocked",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
    }

    // ── Server-authoritative price ceiling ──
    // Never trust the amount from the browser. Recompute the session cost from
    // `pricing_config` for this booking's date/time/duration and the user's tier,
    // subtract prepaid pack hours and any credit the client just consumed, and
    // charge the lower of (client amount, server amount).
    let chargeAmount = Number(amount);
    if (currentBooking) {
      try {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("membership_tier, custom_hourly_rate")
          .eq("user_id", user.id)
          .maybeSingle();

        const tiers = await loadTiers(supabaseClient);
        const hours = Number(currentBooking.duration_hours) || 0;
        const [sh, sm] = String(currentBooking.start_time).split(":").map(Number);

        let gross = 0;
        for (let i = 0; i < hours; i++) {
          const slot = `${String(sh + i).padStart(2, "0")}:${String(sm || 0).padStart(2, "0")}`;
          gross += calculateTierHourlyRate(
            tiers,
            profile?.membership_tier,
            isPeakTime(currentBooking.booking_date, slot),
            profile?.custom_hourly_rate ?? null,
          );
        }

        const packHours = Number(currentBooking.pack_hours_used) || 0;
        const packDiscount = hours > 0 ? (gross / hours) * Math.min(packHours, hours) : 0;

        // Credit consumed for this booking in the last 10 minutes
        const creditSince = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: creditTx } = await supabaseClient
          .from("deposit_transactions")
          .select("amount, transaction_type, created_at")
          .eq("user_id", user.id)
          .in("transaction_type", ["booking", "booking_partial"])
          .gte("created_at", creditSince);
        const creditUsed = (creditTx ?? []).reduce(
          (sum: number, t: any) => sum + Math.max(0, -Number(t.amount || 0)),
          0,
        );

        const serverAmount = Math.max(
          0,
          Math.round((gross - packDiscount - creditUsed) * 100) / 100,
        );

        if (serverAmount < chargeAmount) {
          logStep("Client amount exceeded server price, clamping", {
            clientAmount: chargeAmount,
            serverAmount,
            gross,
            packDiscount,
            creditUsed,
          });
          chargeAmount = serverAmount;
        } else if (serverAmount > chargeAmount) {
          logStep("Client amount below server price (allowed)", {
            clientAmount: chargeAmount,
            serverAmount,
          });
        }
      } catch (priceErr) {
        logStep("Price verification skipped", { error: String(priceErr) });
      }
    }

    if (chargeAmount <= 0) {
      await supabaseClient
        .from("bookings")
        .update({ status: "confirmed", payment_method: "credit" })
        .eq("id", bookingId);
      return new Response(JSON.stringify({ success: true, amountCharged: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });



    // Check if customer exists in Stripe
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    // If a new payment method was provided (from Stripe Elements), use it
    if (paymentMethodId) {
      logStep("Using provided payment method", { paymentMethodId });
      
      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        logStep("Created new customer", { customerId });
      }

      // Attach the payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      
      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      logStep("Attached and set default payment method");

      // Update any active subscriptions to use this payment method
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });
      
      for (const sub of subscriptions.data) {
        await stripe.subscriptions.update(sub.id, {
          default_payment_method: paymentMethodId,
        });
        logStep("Updated subscription payment method", { subscriptionId: sub.id });
      }

      // Charge using the new payment method
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(chargeAmount * 100),
        currency: "aud",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: description || "Bay booking payment",
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Payment successful with new card", { 
        paymentIntentId: paymentIntent.id, 
        status: paymentIntent.status 
      });

      // Get card details for response
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

      // Update booking with payment info
      await supabaseClient
        .from("bookings")
        .update({
          payment_method: "card",
          stripe_payment_intent_id: paymentIntent.id,
          status: "confirmed",
        })
        .eq("id", bookingId);

      return new Response(JSON.stringify({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        cardBrand: pm.card?.brand,
        cardLast4: pm.card?.last4,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    // No new payment method - check for existing customer/cards
    if (!customerId) {
      // No Stripe customer yet - create one so the card from this checkout
      // gets saved persistently (setup_future_usage requires a real Customer
      // attached to the session, not the guest customer_email mode).
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = newCustomer.id;
      logStep("Created new Stripe customer for first-time checkout", { customerId });

      const origin = req.headers.get("origin") || tenantBookingUrl(tenant, "/");

      // Always use HTTPS URLs - for native apps, the WebView handles the redirect naturally
      const successUrl = `${origin}/booking-success?booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`;

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: "Bay Booking",
                description: description || "Golf simulator bay booking",
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Checkout session created", { sessionId: session.id });
      
      return new Response(JSON.stringify({ 
        requiresCheckout: true, 
        checkoutUrl: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found Stripe customer", { customerId });

    // Check for saved payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      // No saved card - redirect to checkout
      logStep("No saved payment method, creating checkout session");
      
      const origin = req.headers.get("origin") || tenantBookingUrl(tenant, "/");
      
      // Always use HTTPS URLs - for native apps, the WebView handles the redirect naturally
      const successUrl = `${origin}/booking-success?booking_id=${bookingId}&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: "Bay Booking",
                description: description || "Golf simulator bay booking",
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Checkout session created for existing customer", { sessionId: session.id });
      
      return new Response(JSON.stringify({ 
        requiresCheckout: true, 
        checkoutUrl: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Charge the saved card
    const paymentMethod = paymentMethods.data[0];
    logStep("Using saved payment method", { 
      paymentMethodId: paymentMethod.id, 
      brand: paymentMethod.card?.brand,
      last4: paymentMethod.card?.last4 
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(chargeAmount * 100), // Convert to cents
      currency: "aud",
      customer: customerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: description || "Bay booking payment",
      metadata: {
        booking_id: bookingId,
        user_id: user.id,
      },
    });

    logStep("Payment successful", { 
      paymentIntentId: paymentIntent.id, 
      status: paymentIntent.status 
    });

    // Update booking with payment info
    const { error: updateError } = await supabaseClient
      .from("bookings")
      .update({
        payment_method: "card",
        stripe_payment_intent_id: paymentIntent.id,
        status: "confirmed",
      })
      .eq("id", bookingId);

    if (updateError) {
      logStep("Warning: Failed to update booking", { error: updateError.message });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      paymentIntentId: paymentIntent.id,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    logStep("ERROR", { message: error.message, code: error.code, type: error.type });
    
    // Handle Stripe card/payment errors with specific messages
    if (error.type === "StripeCardError" || error.code) {
      // If the card is expired, automatically remove it from the customer's account
      if (error.code === "expired_card" && error.payment_method) {
        try {
          const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
          await stripe.paymentMethods.detach(error.payment_method.id);
          logStep("Expired card automatically removed", { paymentMethodId: error.payment_method.id });
        } catch (detachError) {
          logStep("Failed to detach expired card", { error: String(detachError) });
        }
      }

      // Map common Stripe decline codes to user-friendly messages
      const declineMessages: Record<string, string> = {
        expired_card: "Your card has expired. Please update your payment method.",
        card_declined: "Your card was declined. Please try a different card.",
        insufficient_funds: "Your card has insufficient funds. Please try a different card.",
        incorrect_cvc: "The CVC code is incorrect. Please check and try again.",
        processing_error: "There was an error processing your card. Please try again.",
        incorrect_number: "The card number is incorrect. Please check and try again.",
        authentication_required: "Your card requires authentication. Please try again or use a different card.",
      };
      
      const friendlyMessage = declineMessages[error.code] || 
        error.message || 
        "Your card was declined. Please update your payment method.";
      
      return new Response(JSON.stringify({ 
        error: friendlyMessage,
        code: error.code || "card_error"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
