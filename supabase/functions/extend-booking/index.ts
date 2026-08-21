import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { loadTiers, calculateTierHourlyRate, resolveCustomRate, findTier, TierRow } from "../_shared/tiers.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_TOTAL_HOURS = 4;

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

function calculateHourlyRate(
  tier: string,
  dateStr: string,
  startTime: string,
  tiers: TierRow[],
  customHourlyRate: number | null,
  customHourlyRatePeak: number | null = null,
): number {
  const peak = isPeakTime(dateStr, startTime);
  return calculateTierHourlyRate(
    tiers,
    tier,
    peak,
    resolveCustomRate(customHourlyRate, customHourlyRatePeak, peak),
  );
}

// Cost of extending a session, in 30-minute increments.
// A tier may define flat extension pricing (`extend_60min_price`, optionally
// `extend_30min_price`) in `pricing_config` — when set it applies regardless of
// peak/off-peak. Otherwise we sum the standard rate for each half-hour slot so
// peak boundaries are respected across the extension.
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + (m || 0) + minutes;
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
}

function calculateExtensionCost(
  tier: string,
  dateStr: string,
  startTime: string,
  hours: number,
  tiers: TierRow[],
  customHourlyRate: number | null,
  customHourlyRatePeak: number | null = null,
): number {
  const halves = Math.round(hours * 2);
  const config = findTier(tiers, tier);
  const flatHour = config?.extend_60min_price ?? null;
  const hasCustomRate =
    resolveCustomRate(customHourlyRate, customHourlyRatePeak, true) !== null ||
    resolveCustomRate(customHourlyRate, customHourlyRatePeak, false) !== null;

  if (flatHour !== null && !hasCustomRate) {
    const flatHalf = config?.extend_30min_price ?? flatHour / 2;
    return Math.round((Math.floor(halves / 2) * flatHour + (halves % 2) * flatHalf) * 100) / 100;
  }

  let total = 0;
  for (let i = 0; i < halves; i++) {
    const slot = addMinutes(startTime, i * 30);
    total += calculateHourlyRate(tier, dateStr, slot, tiers, customHourlyRate, customHourlyRatePeak) / 2;
  }
  return Math.round(total * 100) / 100;
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
    const use_pack_hours: boolean = body.use_pack_hours === true;


    if (
      !booking_id ||
      !additional_hours ||
      ![0.5, 1, 1.5, 2, 2.5, 3].includes(additional_hours)
    ) {
      throw new Error("Invalid request: additional_hours must be between 0.5 and 3, in 30-minute steps");
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

    // Compute new end_time (30-minute precision)
    const new_end_time = addMinutes(String(booking.end_time).slice(0, 5), Math.round(additional_hours * 60));

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
      .select("membership_tier, custom_hourly_rate, custom_hourly_rate_peak, deposit_balance, email")
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
      (profile as any).custom_hourly_rate_peak ?? null,
    );

    const currentBalance = parseFloat(String(profile.deposit_balance || 0)) || 0;
    let paymentResult: any = { success: true };
    let balanceUsed = 0;
    let cardCharged = 0;

    // ── Prepaid pack hours ──
    // Applied first, at the extension's effective hourly rate, then credit, then card.
    let packHoursUsed = 0;
    let packDiscount = 0;
    if (use_pack_hours && extensionCost > 0) {
      const { data: packBalance } = await supabaseAdmin.rpc("pack_hours_balance", {
        _user_id: user.id,
      });
      const available = Math.min(Number(packBalance) || 0, additional_hours);
      if (available > 0) {
        const { error: consumeErr } = await supabaseAdmin.rpc("consume_pack_hours", {
          _user_id: user.id,
          _hours: available,
          _booking_id: booking_id,
          _description: `Extend booking by ${additional_hours * 60} min`,
        });
        if (consumeErr) throw new Error(`Could not use prepaid hours: ${consumeErr.message}`);
        packHoursUsed = available;
        packDiscount =
          Math.round((extensionCost / additional_hours) * packHoursUsed * 100) / 100;
      }
    }

    const amountDue = Math.max(0, Math.round((extensionCost - packDiscount) * 100) / 100);

    if (amountDue > 0) {
      if (currentBalance >= amountDue) {
        balanceUsed = amountDue;
        await supabaseAdmin
          .from("profiles")
          .update({ deposit_balance: currentBalance - amountDue })
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
        cardCharged = amountDue - balanceUsed;
        await stripe.paymentIntents.create({
          amount: Math.round(cardCharged * 100),
          currency: "aud",
          customer: customerId,
          payment_method: pms.data[0].id,
          off_session: true,
          confirm: true,
          description: `Extend booking ${booking_id} by ${additional_hours * 60} min`,
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
        pack_hours_used: (Number(booking.pack_hours_used) || 0) + packHoursUsed,
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
          description: `Extend booking by ${additional_hours * 60} min`,
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
        packHoursUsed,
        payment: { ...paymentResult, packHoursUsed },
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
