import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { loadTiers, calculateTierHourlyRate, TierRow } from "../_shared/tiers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Determines if a given date and time is during peak hours.
 * Off-peak: Mon-Fri 5:30am-4:00pm, Sat-Sun 5:30am-10:00am; everything else peak.
 */
function isPeakTime(dateStr: string, startTime: string): boolean {
  // Off-peak: Mon-Fri 5:30am-4:00pm, Sat-Sun 5:30am-10:00am. Everything else is peak.
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const [h, m] = startTime.split(":").map(Number);
  const minutes = h * 60 + (m || 0);
  const weekend = dayOfWeek === 0 || dayOfWeek === 6;
  const start = 5 * 60 + 30;
  const end = weekend ? 10 * 60 : 16 * 60;
  return !(minutes >= start && minutes < end);
}

/**
 * Data-driven hourly rate: every tier's metadata comes from `pricing_config`.
 */
function calculateHourlyRate(
  tier: string,
  dateStr: string,
  startTime: string,
  tiers: TierRow[],
  customHourlyRate: number | null
): number {
  return calculateTierHourlyRate(tiers, tier, isPeakTime(dateStr, startTime), customHourlyRate);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create client with user's token for auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Create admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { booking_id, new_date, new_start_time, new_bay_id } = await req.json();

    if (!booking_id || !new_date || !new_start_time || !new_bay_id) {
      throw new Error("Missing required fields: booking_id, new_date, new_start_time, new_bay_id");
    }

    console.log("[RESCHEDULE] Request:", { booking_id, new_date, new_start_time, new_bay_id });

    // Fetch the current booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // Verify user owns this booking
    if (booking.user_id !== user.id) {
      throw new Error("You can only reschedule your own bookings");
    }

    // Verify booking is confirmed (not cancelled or pending)
    if (booking.status !== "confirmed") {
      throw new Error("Only confirmed bookings can be rescheduled");
    }

    // Block reschedule once the booking is more than 10 minutes past its start
    // Booking date/time is stored as local Brisbane time (AEST, UTC+10, no DST)
    const bookingStartUtcMs = Date.parse(
      `${booking.booking_date}T${booking.start_time}+10:00`
    );
    if (!Number.isNaN(bookingStartUtcMs)) {
      const minutesSinceStart = (Date.now() - bookingStartUtcMs) / 60000;
      if (minutesSinceStart > 10) {
        throw new Error(
          "This booking has already started. Rescheduling is no longer available — please contact us if you need help."
        );
      }
    }

    // Fetch user's profile for membership tier and balance
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("membership_tier, custom_hourly_rate, custom_hourly_rate_peak, deposit_balance")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      throw new Error("Could not fetch user profile");
    }

    console.log("[RESCHEDULE] User profile:", { 
      tier: profile.membership_tier, 
      customRate: profile.custom_hourly_rate,
      balance: profile.deposit_balance 
    });

    // Tier metadata is fully data-driven
    const tiers = await loadTiers(supabaseAdmin);
    console.log("[RESCHEDULE] Tiers configured:", tiers.length);

    // Calculate new end time based on duration
    const [startHours, startMinutes] = new_start_time.split(":").map(Number);
    const endHours = startHours + booking.duration_hours;
    const new_end_time = `${endHours.toString().padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}`;

    // Calculate new hourly rate
    const newHourlyRate = calculateHourlyRate(
      profile.membership_tier,
      new_date,
      new_start_time,
      tiers,
      resolveCustomRate(
        profile.custom_hourly_rate,
        (profile as any).custom_hourly_rate_peak ?? null,
        isPeakTime(new_date, new_start_time),
      )
    );

    const newTotalPrice = newHourlyRate * booking.duration_hours;
    const oldTotalPrice = parseFloat(booking.total_price) || 0;
    const priceDifference = newTotalPrice - oldTotalPrice;

    console.log("[RESCHEDULE] Price calculation:", {
      oldRate: booking.hourly_rate,
      newRate: newHourlyRate,
      duration: booking.duration_hours,
      oldTotal: oldTotalPrice,
      newTotal: newTotalPrice,
      difference: priceDifference,
    });

    // Check for overlapping bookings (excluding current booking)
    const { data: overlappingBookings, error: overlapError } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("bay_id", new_bay_id)
      .eq("booking_date", new_date)
      .in("status", ["confirmed", "pending"])
      .neq("id", booking_id)
      .lt("start_time", new_end_time)
      .gt("end_time", new_start_time);

    if (overlapError) {
      console.error("[RESCHEDULE] Overlap check error:", overlapError);
      throw new Error("Failed to check availability");
    }

    if (overlappingBookings && overlappingBookings.length > 0) {
      throw new Error("This time slot is no longer available. Please choose a different time or bay.");
    }

    // Check for bay blocks
    const { data: blocks, error: blockError } = await supabaseAdmin
      .from("bay_blocks")
      .select("id")
      .eq("bay_id", new_bay_id)
      .eq("block_date", new_date)
      .lt("start_time", new_end_time)
      .gt("end_time", new_start_time);

    if (blockError) {
      console.error("[RESCHEDULE] Block check error:", blockError);
      throw new Error("Failed to check availability");
    }

    if (blocks && blocks.length > 0) {
      throw new Error("This time slot is blocked by the facility. Please choose a different time.");
    }

    // Handle price difference
    let paymentResult: { success: boolean; method?: string; refundedToBalance?: number; chargedToCard?: number; chargedFromBalance?: number } = { success: true };
    
    if (priceDifference > 0) {
      // Price increased - need to charge extra
      console.log("[RESCHEDULE] Price increased, need to charge:", priceDifference);
      
      const currentBalance = parseFloat(profile.deposit_balance) || 0;
      
      if (currentBalance >= priceDifference) {
        // Deduct from balance
        const newBalance = currentBalance - priceDifference;
        const { error: balanceError } = await supabaseAdmin
          .from("profiles")
          .update({ deposit_balance: newBalance })
          .eq("user_id", user.id);
        
        if (balanceError) {
          throw new Error("Failed to deduct from balance");
        }
        
        paymentResult = { success: true, method: "balance", chargedFromBalance: priceDifference };
        console.log("[RESCHEDULE] Charged from balance:", priceDifference);
      } else if (stripeKey) {
        // Need to charge card for the difference
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        
        // Find customer's payment method
        const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
        if (customers.data.length === 0) {
          throw new Error("No payment method on file. Please cancel and rebook to pay the additional amount.");
        }
        
        const customerId = customers.data[0].id;
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customerId,
          type: "card",
        });
        
        if (paymentMethods.data.length === 0) {
          throw new Error("No saved card found. Please cancel and rebook to pay the additional amount.");
        }
        
        // Use balance first, then card for remainder
        let chargeAmount = priceDifference;
        let balanceUsed = 0;
        
        if (currentBalance > 0) {
          balanceUsed = currentBalance;
          chargeAmount = priceDifference - currentBalance;
          
          const { error: balanceError } = await supabaseAdmin
            .from("profiles")
            .update({ deposit_balance: 0 })
            .eq("user_id", user.id);
          
          if (balanceError) {
            throw new Error("Failed to deduct from balance");
          }
        }
        
        // Charge remaining to card
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(chargeAmount * 100),
          currency: "aud",
          customer: customerId,
          payment_method: paymentMethods.data[0].id,
          off_session: true,
          confirm: true,
          description: `Reschedule price difference for booking ${booking_id}`,
          metadata: {
            booking_id: booking_id,
            user_id: user.id,
            type: "reschedule_adjustment",
          },
        });
        
        console.log("[RESCHEDULE] Charged card:", chargeAmount, "Payment intent:", paymentIntent.id);
        paymentResult = { 
          success: true, 
          method: balanceUsed > 0 ? "partial" : "card",
          chargedToCard: chargeAmount,
          chargedFromBalance: balanceUsed,
        };
      } else {
        throw new Error("Additional payment required but payment processing unavailable. Please cancel and rebook.");
      }
    } else if (priceDifference < 0) {
      // Price decreased - refund to balance
      const refundAmount = Math.abs(priceDifference);
      const currentBalance = parseFloat(profile.deposit_balance) || 0;
      const newBalance = currentBalance + refundAmount;
      
      const { error: balanceError } = await supabaseAdmin
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);
      
      if (balanceError) {
        console.error("[RESCHEDULE] Failed to refund to balance:", balanceError);
        // Don't fail the reschedule, just log it
      } else {
        paymentResult = { success: true, method: "refund", refundedToBalance: refundAmount };
        console.log("[RESCHEDULE] Refunded to balance:", refundAmount);
      }
    }

    // Update the booking atomically
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        booking_date: new_date,
        start_time: new_start_time,
        end_time: new_end_time,
        bay_id: new_bay_id,
        hourly_rate: newHourlyRate,
        total_price: newTotalPrice,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .select()
      .single();

    if (updateError) {
      console.error("[RESCHEDULE] Update error:", updateError);
      // If update fails and we charged, we should ideally refund... but that's complex
      // For now, just throw and manual intervention may be needed
      if (updateError.message?.includes("overlap") || updateError.message?.includes("blocked")) {
        throw new Error("This time slot was just taken. Please try a different time.");
      }
      throw new Error("Failed to reschedule booking");
    }

    console.log("[RESCHEDULE] Success:", updatedBooking);

    // Re-window the temporary door code for the new time
    try {
      await supabaseAdmin.functions.invoke("door-code-manager", {
        body: { action: "refresh", booking_id },
      });
    } catch (e) {
      console.error("[RESCHEDULE] Door code refresh failed (non-blocking):", e);
    }

    // Optionally send notification

    try {
      await supabaseAdmin.functions.invoke("send-booking-notification", {
        body: {
          booking_id: booking_id,
          notification_type: "reschedule",
        },
      });
    } catch (notifyError) {
      console.error("[RESCHEDULE] Notification failed (non-blocking):", notifyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        booking: updatedBooking,
        priceChanged: priceDifference !== 0,
        priceDifference,
        oldPrice: oldTotalPrice,
        newPrice: newTotalPrice,
        payment: paymentResult,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[RESCHEDULE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
