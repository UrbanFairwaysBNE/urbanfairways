import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CANCEL-BOOKING] Function started");

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    console.log("[CANCEL-BOOKING] User verified:", user.id);

    const { booking_id } = await req.json();
    if (!booking_id) {
      throw new Error("Booking ID is required");
    }

    console.log("[CANCEL-BOOKING] Processing cancellation for booking:", booking_id);

    // Use service role for fetching booking to ensure we get all fields
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Fetch booking details - verify it belongs to this user
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .eq("user_id", user.id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found or access denied: ${bookingError?.message}`);
    }

    if (booking.status === "cancelled") {
      throw new Error("Booking is already cancelled");
    }

    // Block self-serve cancellation once the session has started (Brisbane, UTC+10 no DST)
    const startMs = Date.parse(`${booking.booking_date}T${booking.start_time}+10:00`);
    if (!Number.isNaN(startMs) && Date.now() >= startMs) {
      throw new Error("This booking has already started and can no longer be cancelled. Please contact staff if you need assistance.");
    }

    console.log("[CANCEL-BOOKING] Booking found:", {
      id: booking.id,
      payment_intent: booking.stripe_payment_intent_id,
      payment_method: booking.payment_method,
      total_price: booking.total_price
    });

    let refundResult = null;

    // ── Prepaid hours ──
    // Hours always go straight back to the customer's wallet (new expiry lots handled
    // by restore_pack_hours). The dollar value they covered must not also be refunded.
    const packHoursUsed = Number(booking.pack_hours_used) || 0;
    let packHoursRestored = 0;
    let packValue = 0;

    if (packHoursUsed > 0) {
      const duration = Number(booking.duration_hours) || 0;
      const effectiveRate = duration > 0 ? Number(booking.total_price) / duration : 0;
      packValue = Math.round(packHoursUsed * effectiveRate * 100) / 100;

      const { data: restored, error: restoreError } = await supabaseAdmin.rpc("restore_pack_hours", {
        _user_id: user.id,
        _hours: packHoursUsed,
        _booking_id: booking.id,
        _transaction_type: "refund",
        _description: "Booking cancelled - prepaid hours returned",
      });

      if (restoreError) {
        throw new Error(`Failed to return prepaid hours: ${restoreError.message}`);
      }

      packHoursRestored = Number(restored) || packHoursUsed;
      console.log("[CANCEL-BOOKING] Prepaid hours restored:", packHoursRestored);
    }

    // Dollar amount actually paid with money (credit or card)
    const cashPaid = Math.max(0, Math.round((Number(booking.total_price) - packValue) * 100) / 100);


    // Process Stripe refund if payment intent exists (check for both "stripe" and "card" payment methods)
    if (booking.stripe_payment_intent_id && (booking.payment_method === "stripe" || booking.payment_method === "card")) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      console.log("[CANCEL-BOOKING] Creating Stripe refund for payment intent:", booking.stripe_payment_intent_id);

      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        reason: "requested_by_customer",
      });

      refundResult = {
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
      };

      console.log("[CANCEL-BOOKING] Stripe refund created:", refundResult);
    } else if (booking.payment_method === "balance") {
      // Refund to deposit balance
      console.log("[CANCEL-BOOKING] Refunding to deposit balance:", booking.total_price);
      
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("deposit_balance")
        .eq("user_id", user.id)
        .single();

      if (profileError) {
        throw new Error(`Failed to fetch profile: ${profileError.message}`);
      }

      const newBalance = (profile.deposit_balance || 0) + booking.total_price;
      
      const { error: updateBalanceError } = await supabaseAdmin
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);

      if (updateBalanceError) {
        throw new Error(`Failed to refund to balance: ${updateBalanceError.message}`);
      }

      refundResult = {
        type: "balance",
        amount: booking.total_price,
        new_balance: newBalance,
      };

      console.log("[CANCEL-BOOKING] Balance refund completed:", refundResult);
    } else {
      console.log("[CANCEL-BOOKING] No payment to refund (payment_method:", booking.payment_method, ")");
    }

    // Update booking status to cancelled
    const { error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({ 
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", booking_id);

    if (updateError) {
      throw new Error(`Failed to update booking status: ${updateError.message}`);
    }

    console.log("[CANCEL-BOOKING] Booking status updated to cancelled");

    // Revoke any temporary door code for this booking
    try {
      await supabaseAdmin.functions.invoke("door-code-manager", {
        body: { action: "revoke", booking_id, reason: "booking cancelled" },
      });
    } catch (e) {
      console.error("[CANCEL-BOOKING] Door code revoke failed (non-blocking):", e);
    }



    // Send cancellation notification
    try {
      const notificationResponse = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-notification`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            booking_id: booking_id,
            notification_type: "cancellation",
          }),
        }
      );

      if (!notificationResponse.ok) {
        console.error("[CANCEL-BOOKING] Notification failed:", await notificationResponse.text());
      } else {
        console.log("[CANCEL-BOOKING] Cancellation notification sent");
      }
    } catch (notifError) {
      console.error("[CANCEL-BOOKING] Notification error:", notifError);
      // Don't fail the whole operation if notification fails
    }

    return new Response(
      JSON.stringify({
        success: true,
        booking_id,
        refund: refundResult,
        message: refundResult 
          ? "Booking cancelled and refund processed" 
          : "Booking cancelled successfully",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[CANCEL-BOOKING] Error:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
