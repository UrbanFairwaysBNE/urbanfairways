import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { loadTiers, calculateTierHourlyRate, TierRow } from "../_shared/tiers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TOTAL_HOURS = 4;

function isPeakTime(dateStr: string, startTime: string): boolean {
  const date = new Date(dateStr + "T00:00:00");
  const dayOfWeek = date.getDay();
  const hour = parseInt(startTime.split(":")[0], 10);
  if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) return true;
  return hour >= 16;
}

function calculateHourlyRate(
  tier: string,
  dateStr: string,
  startTime: string,
  tiers: TierRow[],
  customHourlyRate: number | null,
): number {
  return calculateTierHourlyRate(tiers, tier, isPeakTime(dateStr, startTime), customHourlyRate);
}

// Sum the cost of `hours` hourly slots starting at startTime on dateStr,
// so peak/off-peak boundaries are respected across the extension.
function calculateExtensionCost(
  tier: string,
  dateStr: string,
  startTime: string,
  hours: number,
  tiers: TierRow[],
  customHourlyRate: number | null,
): number {
  const [h, m] = startTime.split(":").map(Number);
  let total = 0;
  for (let i = 0; i < hours; i++) {
    const slotHour = h + i;
    const slot = `${slotHour.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
    total += calculateHourlyRate(tier, dateStr, slot, tiers, customHourlyRate);
  }
  return total;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });


  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const booking_id: string = body.booking_id;
    const additional_hours: number = Number(body.additional_hours);

    if (!booking_id || !additional_hours || additional_hours < 1 || additional_hours > 3) {
      throw new Error("Invalid request: additional_hours must be 1, 2 or 3");
    }

    // Fetch booking
    const { data: booking, error: bErr } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();
    if (bErr || !booking) throw new Error("Booking not found");
    if (booking.user_id !== user.id) throw new Error("You can only extend your own bookings");
    if (booking.status !== "confirmed") throw new Error("Only confirmed bookings can be extended");

    // Must be active (started, not yet ended + small buffer)
    const startMs = Date.parse(`${booking.booking_date}T${booking.start_time}+10:00`);
    const endMs = Date.parse(`${booking.booking_date}T${booking.end_time}+10:00`);
    const now = Date.now();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) throw new Error("Invalid booking time");
    if (now < startMs - 15 * 60000) {
      throw new Error("Extend is only available once your session has started");
    }
    if (now > endMs + 10 * 60000) {
      throw new Error("This booking has ended. Please book a new session.");
    }

    // No max-duration cap on extensions — customers can extend beyond the 4hr booking cap
    const currentDuration = Number(booking.duration_hours);
    const newDuration = currentDuration + additional_hours;

    // Compute new end_time
    const [eh, em] = booking.end_time.split(":").map(Number);
    const newEndHour = eh + additional_hours;
    const new_end_time = `${newEndHour.toString().padStart(2, "0")}:${em.toString().padStart(2, "0")}`;

    // Operating hours check
    const dayOfWeek = new Date(booking.booking_date + "T00:00:00").getDay();
    const { data: hoursRow } = await supabaseAdmin
      .from("operating_hours")
      .select("close_time,is_open")
      .eq("day_of_week", dayOfWeek)
      .maybeSingle();
    if (hoursRow && hoursRow.is_open && hoursRow.close_time) {
      const closeStr = String(hoursRow.close_time).slice(0, 5);
      if (new_end_time > closeStr) {
        throw new Error(`Cannot extend past closing time (${closeStr})`);
      }
    }

    // Overlap check on same bay
    const { data: overlaps, error: oErr } = await supabaseAdmin
      .from("bookings")
      .select("id,start_time,end_time")
      .eq("bay_id", booking.bay_id)
      .eq("booking_date", booking.booking_date)
      .in("status", ["confirmed", "pending"])
      .neq("id", booking_id)
      .lt("start_time", new_end_time)
      .gt("end_time", booking.end_time);
    if (oErr) throw new Error("Failed to check availability");
    if (overlaps && overlaps.length > 0) {
      throw new Error("Bay is already booked during the extension window");
    }

    // Bay block check
    const { data: blocks } = await supabaseAdmin
      .from("bay_blocks")
      .select("id")
      .eq("bay_id", booking.bay_id)
      .eq("block_date", booking.booking_date)
      .lt("start_time", new_end_time)
      .gt("end_time", booking.end_time);
    if (blocks && blocks.length > 0) {
      throw new Error("Bay is blocked during the extension window");
    }

    // Fetch profile & pricing
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("membership_tier, custom_hourly_rate, deposit_balance, email")
      .eq("user_id", user.id)
      .single();
    if (pErr || !profile) throw new Error("Could not fetch profile");

    const tiers = await loadTiers(supabaseAdmin);

    const extensionCost = calculateExtensionCost(
      profile.membership_tier,
      booking.booking_date,
      booking.end_time, // extension begins where booking currently ends
      additional_hours,
      tiers,
      profile.custom_hourly_rate,
    );

    const currentBalance = parseFloat(String(profile.deposit_balance || 0)) || 0;
    let paymentResult: any = { success: true };
    let balanceUsed = 0;
    let cardCharged = 0;

    if (extensionCost > 0) {
      if (currentBalance >= extensionCost) {
        balanceUsed = extensionCost;
        await supabaseAdmin
          .from("profiles")
          .update({ deposit_balance: currentBalance - extensionCost })
          .eq("user_id", user.id);
        paymentResult = { method: "balance", chargedFromBalance: balanceUsed };
      } else if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
        const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
        if (customers.data.length === 0) throw new Error("No payment method on file. Please add a card in My Account.");
        const customerId = customers.data[0].id;
        const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card" });
        if (pms.data.length === 0) throw new Error("No saved card found. Please add a card in My Account.");

        if (currentBalance > 0) {
          balanceUsed = currentBalance;
          await supabaseAdmin
            .from("profiles")
            .update({ deposit_balance: 0 })
            .eq("user_id", user.id);
        }
        cardCharged = extensionCost - balanceUsed;
        await stripe.paymentIntents.create({
          amount: Math.round(cardCharged * 100),
          currency: "aud",
          customer: customerId,
          payment_method: pms.data[0].id,
          off_session: true,
          confirm: true,
          description: `Extend booking ${booking_id} by ${additional_hours}hr`,
          metadata: { booking_id, user_id: user.id, type: "extend_booking" },
        });
        paymentResult = {
          method: balanceUsed > 0 ? "partial" : "card",
          chargedToCard: cardCharged,
          chargedFromBalance: balanceUsed,
        };
      } else {
        throw new Error("Payment required but processing unavailable.");
      }
    }

    // Update booking
    const newTotal = Number(booking.total_price) + extensionCost;
    const blendedHourlyRate = newTotal / newDuration;
    const { data: updated, error: uErr } = await supabaseAdmin
      .from("bookings")
      .update({
        end_time: new_end_time,
        duration_hours: newDuration,
        total_price: newTotal,
        hourly_rate: blendedHourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .select()
      .single();
    if (uErr) {
      console.error("[EXTEND] Update error:", uErr);
      throw new Error("Failed to extend booking");
    }

    // Log deposit transaction if balance was used
    if (balanceUsed > 0) {
      try {
        await supabaseAdmin.from("deposit_transactions").insert({
          user_id: user.id,
          amount: -balanceUsed,
          balance_before: currentBalance,
          balance_after: currentBalance - balanceUsed,
          transaction_type: "booking_payment",
          description: `Extend booking by ${additional_hours}hr`,
        });
      } catch (e) {
        console.error("[EXTEND] Transaction log failed (non-blocking):", e);
      }
    }

    // Extend the temporary door code window to cover the new end time
    try {
      await supabaseAdmin.functions.invoke("door-code-manager", {
        body: { action: "refresh", booking_id },
      });
    } catch (e) {
      console.error("[EXTEND] Door code refresh failed (non-blocking):", e);
    }



    return new Response(
      JSON.stringify({
        success: true,
        booking: updated,
        extensionCost,
        newTotal,
        payment: paymentResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[EXTEND] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
