import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import {
  calculateHourlyRate,
  isPeakTime,
  isOffPeakTime,
  defaultPeakRate,
  formatLocalDateKey,
  calculateBookingTotal,
  addDurationToTime,
  durationOptions,
  type PricingSpecial,
} from "@/lib/pricing-utils";

import { TierConfig, TIER_SELECT, findTier, normaliseTier, hasSingleBayPeakLimit, isOffPeakOnlyTier } from "@/lib/tier-config";
import { Capacitor } from "@capacitor/core";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/query-keys";
export interface Bay {
  id: string;
  bay_number: number;
  name: string;
  is_active: boolean;
}

export interface Booking {
  id: string;
  bay_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
}

export interface BayBlock {
  id: string;
  bay_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
}

export interface MembershipPricing {
  tier: string;
  hourlyRate: number;
}

export interface SavedCard {
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
}

export type PaymentMethod = "card" | "balance";

// Fetch functions extracted for React Query
const fetchBays = async (): Promise<Bay[]> => {
  const { data, error } = await supabase
    .from("bays")
    .select("*")
    .eq("is_active", true)
    .order("bay_number");

  if (error) throw error;
  return data || [];
};

const fetchPricing = async (): Promise<TierConfig[]> => {
  const { data, error } = await supabase
    .from("pricing_config")
    .select(TIER_SELECT)
    .order("display_order");

  if (error) throw error;

  return ((data || []) as Record<string, unknown>[]).map(normaliseTier);
};

export interface PublicHoliday {
  id: string;
  holiday_date: string; // YYYY-MM-DD
  name: string;
  surcharge_percent: number;
}

const fetchPublicHolidays = async (): Promise<PublicHoliday[]> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatLocalDateKey(today);
  const { data, error } = await supabase
    .from("public_holidays")
    .select("id, holiday_date, name, surcharge_percent")
    .gte("holiday_date", todayStr);
  if (error) throw error;
  return (data || []).map((h: any) => ({
    ...h,
    surcharge_percent: Number(h.surcharge_percent),
  }));
};

const fetchPricingSpecials = async (): Promise<PricingSpecial[]> => {
  const { data, error } = await supabase
    .from("pricing_specials")
    .select("id, name, duration_minutes, price, applies_peak, applies_off_peak, is_active, display_order")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;
  return (data || []).map((s: any) => ({ ...s, price: Number(s.price) }));
};


const fetchUserProfile = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("membership_tier, custom_hourly_rate, deposit_balance, custom_segment, payment_failed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const actualTier = data?.membership_tier || "casual";
  const paymentFailedAt = data?.payment_failed_at ?? null;
  // Strict rule: while in membership payment limbo, member loses member pricing
  // and is treated as a visitor everywhere until they retry payment successfully.
  const effectiveTier = paymentFailedAt ? "casual" : actualTier;

  // Prepaid hours wallet — separate to the dollar credit balance
  const { data: packHours } = await supabase.rpc("pack_hours_balance", { _user_id: user.id });

  return {
    userId: user.id,
    membershipTier: effectiveTier,
    actualMembershipTier: actualTier,
    paymentFailedAt,
    isPaymentLimbo: !!paymentFailedAt,
    customHourlyRate: data?.custom_hourly_rate ?? null,
    depositBalance: Number(data?.deposit_balance) || 0,
    packHoursBalance: Number(packHours) || 0,
    customSegment: data?.custom_segment ?? null,
  };

};

const fetchSavedCard = async (): Promise<SavedCard | null> => {
  const { data, error } = await supabase.functions.invoke("get-payment-methods");
  if (error || !data?.paymentMethods?.length) return null;
  
  const card = data.paymentMethods.find((pm: any) => pm.type === "card");
  if (!card) return null;
  
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.expMonth,
    expYear: card.expYear,
  };
};

export function useBooking() {
  const queryClient = useQueryClient();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bayBlocks, setBayBlocks] = useState<BayBlock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentDateStr, setCurrentDateStr] = useState<string | null>(null);
  const [userBookingsForDate, setUserBookingsForDate] = useState<Booking[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Static data - cached for 30 minutes (bays rarely change)
  const { data: bays = [] } = useQuery({
    queryKey: QUERY_KEYS.BAYS,
    queryFn: fetchBays,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  // Static data - cached for 30 minutes (pricing rarely changes)
  const { data: tierPricing = [] } = useQuery({
    queryKey: QUERY_KEYS.PRICING,
    queryFn: fetchPricing,
    staleTime: STALE_TIMES.STATIC,
  });

  // Casual specials (e.g. 90 minutes for $60) - cached like pricing
  const { data: pricingSpecials = [] } = useQuery({
    queryKey: QUERY_KEYS.PRICING_SPECIALS,
    queryFn: fetchPricingSpecials,
    staleTime: STALE_TIMES.STATIC,
  });

  // Public holidays - cached for 30 minutes
  const { data: publicHolidays = [] } = useQuery({
    queryKey: QUERY_KEYS.PUBLIC_HOLIDAYS,
    queryFn: fetchPublicHolidays,
    staleTime: STALE_TIMES.STATIC,
  });


  // User data - cached for 5 minutes
  const { data: userProfile } = useQuery({
    queryKey: QUERY_KEYS.USER_PROFILE(),
    queryFn: fetchUserProfile,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  // Saved card - cached for 5 minutes
  const { data: savedCard, isLoading: isLoadingSavedCard, refetch: refetchSavedCard } = useQuery({
    queryKey: QUERY_KEYS.SAVED_CARD,
    queryFn: fetchSavedCard,
    staleTime: STALE_TIMES.SEMI_STATIC,
  });

  // Derived values from user profile
  const userMembershipTier = userProfile?.membershipTier || "casual";
  const actualMembershipTier = userProfile?.actualMembershipTier || userMembershipTier;
  const isPaymentLimbo = !!userProfile?.isPaymentLimbo;
  const customHourlyRate = userProfile?.customHourlyRate ?? null;
  const depositBalance = userProfile?.depositBalance || 0;
  const packHoursBalance = userProfile?.packHoursBalance || 0;

  const customSegment = userProfile?.customSegment ?? null;

  /**
   * Get the public holiday surcharge percentage for a given date (0 if none).
   */
  const getHolidaySurchargeForDate = useCallback((date: Date | string): number => {
    const key = typeof date === "string" ? date : formatLocalDateKey(date);
    const holiday = publicHolidays.find(h => h.holiday_date === key);
    return holiday ? Number(holiday.surcharge_percent) : 0;
  }, [publicHolidays]);

  /**
   * Get the public holiday object for a given date (null if none).
   */
  const getHolidayForDate = useCallback((date: Date | string): PublicHoliday | null => {
    const key = typeof date === "string" ? date : formatLocalDateKey(date);
    return publicHolidays.find(h => h.holiday_date === key) ?? null;
  }, [publicHolidays]);

  /** True when the date is a public holiday (charged at the peak rate all day). */
  const isPublicHolidayDate = useCallback((date: Date | string): boolean => {
    const key = typeof date === "string" ? date : formatLocalDateKey(date);
    return publicHolidays.some(h => h.holiday_date === key);
  }, [publicHolidays]);

  /** True when a date/time is peak, taking public holidays into account. */
  const isPeakSlot = useCallback((date: Date, startTime: string): boolean => {
    return isPeakTime(date, startTime, isPublicHolidayDate(date));
  }, [isPublicHolidayDate]);

  /** Session lengths offered, including any special durations (e.g. 1.5h). */
  const availableDurations = useMemo(
    () => durationOptions(pricingSpecials),
    [pricingSpecials]
  );


  // Memoized fetch function to avoid recreating on every render
  const fetchBookingsForDateInternal = useCallback(async (dateStr: string) => {
    setIsLoading(true);

    // Fetch bookings, bay blocks, and user's own bookings in parallel
    const { data: { user } } = await supabase.auth.getUser();
    
    const [bookingsResult, blocksResult, userBookingsResult] = await Promise.all([
      supabase
        .from("booking_availability")
        .select("bay_id, booking_date, start_time, end_time")
        .eq("booking_date", dateStr),
      supabase
        .from("bay_blocks")
        .select("id, bay_id, block_date, start_time, end_time")
        .eq("block_date", dateStr),
      // Fetch user's own bookings for multi-bay restriction check
      user ? supabase
        .from("bookings")
        .select("id, bay_id, booking_date, start_time, end_time, duration_hours, status")
        .eq("user_id", user.id)
        .eq("booking_date", dateStr)
        .in("status", ["confirmed", "pending"]) : Promise.resolve({ data: [], error: null })
    ]);

    if (!bookingsResult.error && bookingsResult.data) {
      setBookings(bookingsResult.data.map(b => ({
        id: '',
        bay_id: b.bay_id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        duration_hours: 0,
        status: 'confirmed'
      })));
    }

    if (!blocksResult.error && blocksResult.data) {
      setBayBlocks(blocksResult.data.map(b => ({
        id: b.id,
        bay_id: b.bay_id,
        block_date: b.block_date,
        start_time: b.start_time,
        end_time: b.end_time,
      })));
    }

    if (!userBookingsResult.error && userBookingsResult.data) {
      setUserBookingsForDate(userBookingsResult.data.map(b => ({
        id: b.id,
        bay_id: b.bay_id,
        booking_date: b.booking_date,
        start_time: b.start_time,
        end_time: b.end_time,
        duration_hours: b.duration_hours,
        status: b.status
      })));
    }

    setIsLoading(false);
  }, []);

  const fetchBookingsForDate = useCallback(async (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    setCurrentDateStr(dateStr);
    await fetchBookingsForDateInternal(dateStr);
  }, [fetchBookingsForDateInternal]);

  // Real-time subscription to booking changes for consistency across all users
  useEffect(() => {
    if (!currentDateStr) return;

    // Clean up previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Subscribe to real-time booking changes
    const channel = supabase
      .channel(`customer-booking-availability-${currentDateStr}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        (payload) => {
          // Only refetch if the change affects the current date
          const newRecord = payload.new as { booking_date?: string } | null;
          const oldRecord = payload.old as { booking_date?: string } | null;
          
          if (
            newRecord?.booking_date === currentDateStr ||
            oldRecord?.booking_date === currentDateStr
          ) {
            console.log('[useBooking] Real-time booking update, refreshing availability');
            fetchBookingsForDateInternal(currentDateStr);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bay_blocks',
        },
        (payload) => {
          const newRecord = payload.new as { block_date?: string } | null;
          const oldRecord = payload.old as { block_date?: string } | null;
          
          if (
            newRecord?.block_date === currentDateStr ||
            oldRecord?.block_date === currentDateStr
          ) {
            console.log('[useBooking] Real-time bay block update, refreshing availability');
            fetchBookingsForDateInternal(currentDateStr);
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[useBooking] Subscribed to real-time booking availability');
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [currentDateStr, fetchBookingsForDateInternal]);

  /**
   * Get hourly rate based on membership tier, date, and time.
   * Uses peak/off-peak pricing plus any tier restrictions from pricing_config.
   */
  const getHourlyRate = (
    tier: string = userMembershipTier,
    date?: Date,
    startTime?: string
  ): number => {
    // Custom hourly rate overrides everything
    if (customHourlyRate !== null) {
      return customHourlyRate;
    }
    
    // If no date/time provided, return the base tier rate
    if (!date || !startTime) {
      return Number(findTier(tierPricing, tier)?.hourly_rate ?? defaultPeakRate(tierPricing));
    }
    
    const holidaySurchargePercent = getHolidaySurchargeForDate(date);

    // Calculate rate based on tier, date, and time
    return calculateHourlyRate(tier, date, startTime, tierPricing, { 
      segment: customSegment, 
      holidaySurchargePercent,
      isPublicHoliday: isPublicHolidayDate(date),
    });
  };

  /**
   * Total price for a session, applying any casual special (e.g. 90min for $60)
   * when it beats the standard hourly rate for that exact session length.
   */
  const getBookingTotal = useCallback((
    hourlyRateForSlot: number,
    durationHours: number,
    date?: Date,
    startTime?: string
  ): { total: number; special: PricingSpecial | null } => {
    const peak = date && startTime ? isPeakTime(date, startTime, isPublicHolidayDate(date)) : false;
    return calculateBookingTotal(hourlyRateForSlot, durationHours, pricingSpecials, peak);
  }, [pricingSpecials, isPublicHolidayDate]);


  /**
   * Check if an off-peak-only tier can book at member rate for a given time
   */
  const canWeekdayMemberBook = (date: Date, startTime: string): boolean => {
    if (!isOffPeakOnlyTier(tierPricing, userMembershipTier)) return true;
    return isOffPeakTime(date, startTime);
  };

  /**
   * Helper function to check if two time ranges overlap
   */
  const timesOverlap = (
    start1: string,
    end1: string,
    start2: string,
    end2: string
  ): boolean => {
    const toMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };
    const s1 = toMinutes(start1);
    const e1 = toMinutes(end1);
    const s2 = toMinutes(start2);
    const e2 = toMinutes(end2);
    return s1 < e2 && e1 > s2;
  };

  /**
   * Check if member is restricted from using member rate due to existing peak booking.
   * Returns true if Birdie/Eagle member already has another booking that overlaps this time slot during peak hours.
   */
  const checkMultiBayRestriction = useCallback((
    date: Date,
    startTime: string,
    durationHours: number,
    bayId: string
  ): boolean => {
    // Only applies to tiers flagged single_bay_at_peak, during peak hours
    if (!hasSingleBayPeakLimit(tierPricing, userMembershipTier)) return false;
    if (!isPeakSlot(date, startTime)) return false;

    // Calculate end time
    const endTime = addDurationToTime(startTime, durationHours);

    
    // Check for existing overlapping bookings by this user on a different bay
    const hasOverlap = userBookingsForDate.some(booking => 
      booking.bay_id !== bayId && 
      timesOverlap(startTime, endTime, booking.start_time, booking.end_time)
    );
    
    return hasOverlap;
  }, [userMembershipTier, userBookingsForDate, tierPricing]);

  /**
   * Get the display rate info for the booking UI
   */
  const getRateInfo = (
    date: Date, 
    startTime: string, 
    durationHours: number = 1, 
    bayId?: string
  ): { rate: number; total: number; special: PricingSpecial | null; isPeak: boolean; isRestricted: boolean; isMultiBayRestricted: boolean; isHoliday: boolean; holidayName: string | null; surchargePercent: number } => {
    const isPeak = isPeakSlot(date, startTime);
    const isWeekdayRestricted = isOffPeakOnlyTier(tierPricing, userMembershipTier) && isPeak;
    const holiday = getHolidayForDate(date);
    const surchargePercent = holiday ? Number(holiday.surcharge_percent) : 0;
    
    // Check multi-bay restriction for Birdie/Eagle members
    const isMultiBayRestricted = bayId 
      ? checkMultiBayRestriction(date, startTime, durationHours, bayId)
      : false;
    
    // If multi-bay restricted, rate becomes visitor peak rate (then surcharge applied on top)
    let rate: number;
    if (isMultiBayRestricted) {
      const baseRate = defaultPeakRate(tierPricing); // walk-in peak rate
      rate = surchargePercent > 0 
        ? Math.round(baseRate * (1 + surchargePercent / 100) * 100) / 100
        : baseRate;
    } else {
      rate = getHourlyRate(userMembershipTier, date, startTime);
    }

    const { total, special } = getBookingTotal(rate, durationHours, date, startTime);

    return { 
      rate, 
      total,
      special,
      isPeak, 
      isRestricted: isWeekdayRestricted, 
      isMultiBayRestricted,
      isHoliday: !!holiday,
      holidayName: holiday?.name ?? null,
      surchargePercent,
    };
  };


  /**
   * Get user's pending booking IDs for a given bay/time slot (for "see through" logic)
   */
  const getUserPendingBookingForSlot = (
    bayId: string,
    startTime: string,
    durationHours: number
  ): Booking | undefined => {
    const endTime = addDurationToTime(startTime, durationHours);

    
    return userBookingsForDate.find(booking => 
      booking.bay_id === bayId && 
      booking.status === "pending" &&
      timesOverlap(startTime, endTime, booking.start_time, booking.end_time)
    );
  };

  const checkBayAvailability = (
    bayId: string,
    startTime: string,
    durationHours: number
  ): boolean => {
    const startHour = parseInt(startTime.split(":")[0]);
    const startMinute = parseInt(startTime.split(":")[1]);
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = startMinutes + durationHours * 60;

    // Get user's own pending booking for this slot (if any) - they can "see through" it
    const userPendingBooking = getUserPendingBookingForSlot(bayId, startTime, durationHours);

    // Check existing bookings (excluding user's own pending booking for this slot)
    const bayBookings = bookings.filter((b) => b.bay_id === bayId);
    for (const booking of bayBookings) {
      // Skip user's own pending booking - they can replace it
      if (userPendingBooking && 
          booking.bay_id === userPendingBooking.bay_id &&
          booking.start_time === userPendingBooking.start_time &&
          booking.end_time === userPendingBooking.end_time) {
        continue;
      }
      
      const bookingStartHour = parseInt(booking.start_time.split(":")[0]);
      const bookingStartMin = parseInt(booking.start_time.split(":")[1]);
      const bookingEndHour = parseInt(booking.end_time.split(":")[0]);
      const bookingEndMin = parseInt(booking.end_time.split(":")[1]);

      const bookingStartMinutes = bookingStartHour * 60 + bookingStartMin;
      const bookingEndMinutes = bookingEndHour * 60 + bookingEndMin;

      if (startMinutes < bookingEndMinutes && endMinutes > bookingStartMinutes) {
        return false;
      }
    }

    // Check bay blocks - blocked bays cannot be booked
    const bayBlocksForBay = bayBlocks.filter((b) => b.bay_id === bayId);
    for (const block of bayBlocksForBay) {
      const blockStartHour = parseInt(block.start_time.split(":")[0]);
      const blockStartMin = parseInt(block.start_time.split(":")[1]);
      const blockEndHour = parseInt(block.end_time.split(":")[0]);
      const blockEndMin = parseInt(block.end_time.split(":")[1]);

      const blockStartMinutes = blockStartHour * 60 + blockStartMin;
      const blockEndMinutes = blockEndHour * 60 + blockEndMin;

      if (startMinutes < blockEndMinutes && endMinutes > blockStartMinutes) {
        return false;
      }
    }

    return true;
  };

  const createBooking = async (
    bayId: string,
    date: Date,
    startTime: string,
    durationHours: number,
    playerCount: number = 1,
    paymentMethod: PaymentMethod = "card",
    newPaymentMethodId?: string,
    partialBalanceAmount?: number,
    notes?: string,
    /** Prepaid pack hours to spend on this session (capped at balance and duration) */
    packHoursToUse?: number

  ): Promise<{ booking: any; requiresCheckout?: boolean; checkoutUrl?: string }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const dateStr = format(date, "yyyy-MM-dd");
    const endTime = addDurationToTime(startTime, durationHours);


    // Delete any existing PENDING bookings by this user that overlap with this slot
    // This allows users to "replace" their failed pending bookings seamlessly
    const { data: existingPendingBookings } = await supabase
      .from("bookings")
      .select("id, start_time, end_time")
      .eq("user_id", user.id)
      .eq("bay_id", bayId)
      .eq("booking_date", dateStr)
      .eq("status", "pending");
    
    if (existingPendingBookings && existingPendingBookings.length > 0) {
      const overlappingPending = existingPendingBookings.filter(booking =>
        timesOverlap(startTime, endTime, booking.start_time, booking.end_time)
      );
      
      if (overlappingPending.length > 0) {
        console.log("[useBooking] Deleting user's stale pending bookings:", overlappingPending.map(b => b.id));
        await supabase
          .from("bookings")
          .delete()
          .in("id", overlappingPending.map(b => b.id));
      }
    }

    // CRITICAL: Fresh database check for multi-bay restriction
    // This prevents race conditions when users book multiple bays quickly
    let actualHourlyRate: number;
    
    if (customHourlyRate !== null) {
      // Custom rate always takes priority
      actualHourlyRate = customHourlyRate;
    } else if (hasSingleBayPeakLimit(tierPricing, userMembershipTier) && isPeakSlot(date, startTime)) {
      // For single-bay-limited tiers during peak: check for overlapping bookings in DB (not cached state)
      const { data: existingBookings } = await supabase
        .from("bookings")
        .select("id, bay_id, start_time, end_time")
        .eq("user_id", user.id)
        .eq("booking_date", dateStr)
        .in("status", ["confirmed", "pending"])
        .neq("bay_id", bayId); // Different bay
      
      // Check if any existing booking overlaps with this time slot
      const hasOverlappingBooking = (existingBookings || []).some(booking => 
        timesOverlap(startTime, endTime, booking.start_time, booking.end_time)
      );
      
      const holidaySurchargePercent = getHolidaySurchargeForDate(date);
      const holidayFlag = isPublicHolidayDate(date);
      if (hasOverlappingBooking) {
        // Multi-bay during peak: charge visitor rate instead of member rate (+ holiday surcharge if any)
        console.log("[useBooking] Multi-bay peak restriction triggered - charging walk-in rate");
        const baseRate = defaultPeakRate(tierPricing); // walk-in peak rate
        actualHourlyRate = holidaySurchargePercent > 0
          ? Math.round(baseRate * (1 + holidaySurchargePercent / 100) * 100) / 100
          : baseRate;
      } else {
        // No conflict: use member rate (with holiday surcharge if applicable)
        actualHourlyRate = calculateHourlyRate(userMembershipTier, date, startTime, tierPricing, { segment: customSegment, holidaySurchargePercent, isPublicHoliday: holidayFlag });
      }
    } else {
      // All other cases: use standard rate calculation (with holiday surcharge if applicable)
      const holidaySurchargePercent = getHolidaySurchargeForDate(date);
      actualHourlyRate = calculateHourlyRate(userMembershipTier, date, startTime, tierPricing, { segment: customSegment, holidaySurchargePercent, isPublicHoliday: isPublicHolidayDate(date) });
    }

    // Apply any casual special (e.g. 90 minutes for $60) when it beats the hourly rate
    const { total: totalPrice } = getBookingTotal(actualHourlyRate, durationHours, date, startTime);

    // ── Prepaid pack hours ──
    // Hours buy simulator time, so they are worth the session's effective hourly rate.
    // They are always applied first, then dollar credit, then card.
    const effectiveRate = durationHours > 0 ? totalPrice / durationHours : 0;
    const hoursRequested = Math.max(0, Math.min(packHoursToUse ?? 0, durationHours, packHoursBalance));
    let packHoursUsed = 0;
    let packDiscount = 0;

    if (hoursRequested > 0) {
      const { data: consumed, error: packError } = await supabase.rpc("consume_pack_hours", {
        _user_id: user.id,
        _hours: hoursRequested,
        _transaction_type: "booking",
        _description: `Booking - ${format(date, "PPP")} at ${startTime}`,
      });
      if (packError) throw new Error(packError.message || "Failed to apply prepaid hours");
      packHoursUsed = Number(consumed) || 0;
      packDiscount = Math.round(packHoursUsed * effectiveRate * 100) / 100;
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    }

    /** Restores prepaid hours if a later step of this booking fails. */
    const rollbackPackHours = async () => {
      if (packHoursUsed <= 0) return;
      await supabase.rpc("restore_pack_hours", {
        _user_id: user.id,
        _hours: packHoursUsed,
        _transaction_type: "reversal",
        _description: "Booking failed - prepaid hours returned",
      });
      packHoursUsed = 0;
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    };

    // Amount still owed after prepaid hours
    const payableTotal = Math.max(0, Math.round((totalPrice - packDiscount) * 100) / 100);

    // Track how much to deduct from balance and charge to card
    let balanceDeduction = 0;
    let cardAmount = payableTotal;
    let currentDepositBalance = depositBalance;

    // If using balance, check if sufficient funds
    if (paymentMethod === "balance" && payableTotal > 0) {
      if (currentDepositBalance < payableTotal) {
        await rollbackPackHours();
        throw new Error("Insufficient balance");
      }
      balanceDeduction = payableTotal;
      cardAmount = 0;

      const newBalance = currentDepositBalance - payableTotal;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);

      if (balanceError) {
        await rollbackPackHours();
        throw new Error("Failed to deduct balance");
      }

      // Log the transaction
      await supabase.from("deposit_transactions").insert({
        user_id: user.id,
        amount: -payableTotal,
        balance_before: currentDepositBalance,
        balance_after: newBalance,
        transaction_type: "booking",
        description: `Booking payment - ${format(date, "PPP")} at ${startTime}`,
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    } else if (partialBalanceAmount && partialBalanceAmount > 0 && payableTotal > 0) {
      // Partial balance usage with card payment
      balanceDeduction = Math.min(partialBalanceAmount, payableTotal);
      cardAmount = Math.round((payableTotal - balanceDeduction) * 100) / 100;

      const newBalance = currentDepositBalance - balanceDeduction;
      const { error: balanceError } = await supabase
        .from("profiles")
        .update({ deposit_balance: newBalance })
        .eq("user_id", user.id);

      if (balanceError) {
        await rollbackPackHours();
        throw new Error("Failed to deduct balance");
      }

      // Log the transaction
      await supabase.from("deposit_transactions").insert({
        user_id: user.id,
        amount: -balanceDeduction,
        balance_before: currentDepositBalance,
        balance_after: newBalance,
        transaction_type: "booking_partial",
        description: `Partial balance for booking - ${format(date, "PPP")} at ${startTime}`,
      });

      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
    }

    // Auto-confirm when nothing is left to charge (free, fully prepaid, or paid by credit)
    const isFreeBooking = totalPrice <= 0;
    const nothingLeftToPay = payableTotal <= 0;
    const shouldAutoConfirm = isFreeBooking || nothingLeftToPay || paymentMethod === "balance";

    const settledPaymentMethod = isFreeBooking
      ? "free"
      : nothingLeftToPay && packHoursUsed > 0
        ? "prepaid_hours"
        : paymentMethod === "balance"
          ? "balance"
          : balanceDeduction > 0 || packHoursUsed > 0
            ? "partial"
            : "pending";

    const { data: bookingData, error } = await supabase
      .from("bookings")
      .insert({
        user_id: user.id,
        bay_id: bayId,
        booking_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        duration_hours: durationHours,
        hourly_rate: actualHourlyRate,
        total_price: totalPrice,
        pack_hours_used: packHoursUsed,
        player_count: playerCount,
        payment_method: settledPaymentMethod,
        status: shouldAutoConfirm ? "confirmed" : "pending",
        notes: notes ?? null,
      })
      .select()
      .single();

    if (error) {
      // CRITICAL: Restore balance and prepaid hours if they were already spent
      if (balanceDeduction > 0) {
        console.log("[useBooking] Booking insert failed, restoring balance deduction of", balanceDeduction);
        await supabase
          .from("profiles")
          .update({ deposit_balance: currentDepositBalance })
          .eq("user_id", user.id);
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
      }
      await rollbackPackHours();
      throw error;
    }

    // Link the hour spend to the booking now that it exists
    if (packHoursUsed > 0) {
      await supabase
        .from("pack_transactions")
        .update({ related_booking_id: bookingData.id })
        .eq("user_id", user.id)
        .is("related_booking_id", null)
        .eq("transaction_type", "booking");
    }


    // Only charge card if there's an amount to charge
    if (paymentMethod === "card" && cardAmount > 0) {
      const bayName = bays.find(b => b.id === bayId)?.name || "Bay";
      const description = `${bayName} - ${format(date, "PPP")} at ${startTime} (${durationHours}hr)`;
      
      const { data: chargeResult, error: chargeError } = await supabase.functions.invoke("charge-booking", {
        body: {
          bookingId: bookingData.id,
          amount: cardAmount,
          description,
          paymentMethodId: newPaymentMethodId,
          isNativeApp: Capacitor.isNativePlatform(),
        },
      });

      if (chargeError) {
        // Restore balance and prepaid hours if card payment fails
        if (balanceDeduction > 0) {
          await supabase
            .from("profiles")
            .update({ deposit_balance: currentDepositBalance })
            .eq("user_id", user.id);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
        }
        await rollbackPackHours();
        await supabase.from("bookings").delete().eq("id", bookingData.id);
        throw new Error(chargeError.message || "Payment failed");
      }

      if (chargeResult.error) {
        // Restore balance and prepaid hours if card payment fails
        if (balanceDeduction > 0) {
          await supabase
            .from("profiles")
            .update({ deposit_balance: currentDepositBalance })
            .eq("user_id", user.id);
          queryClient.invalidateQueries({ queryKey: QUERY_KEYS.USER_PROFILE() });
        }
        await rollbackPackHours();
        await supabase.from("bookings").delete().eq("id", bookingData.id);
        throw new Error(chargeResult.error);

      }

      if (chargeResult.requiresCheckout) {
        return { 
          booking: bookingData, 
          requiresCheckout: true, 
          checkoutUrl: chargeResult.checkoutUrl 
        };
      }
    }

    try {
      await supabase.functions.invoke("send-booking-notification", {
        body: {
          booking_id: bookingData.id,
          notification_type: "confirmation",
        },
      });
    } catch (notificationError) {
      console.error("Failed to send booking notification:", notificationError);
    }

    return { booking: bookingData };
  };

  return {
    bays,
    bookings,
    isLoading,
    userMembershipTier,
    actualMembershipTier,
    isPaymentLimbo,
    depositBalance,
    packHoursBalance,

    savedCard: savedCard ?? null,
    isLoadingSavedCard,
    tierPricing,
    pricingSpecials,
    availableDurations,
    getBookingTotal,
    isPeakSlot,
    getHourlyRate,
    getRateInfo,

    canWeekdayMemberBook,
    checkMultiBayRestriction,
    publicHolidays,
    getHolidaySurchargeForDate,
    getHolidayForDate,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
    refetchSavedCard,
  };
}
