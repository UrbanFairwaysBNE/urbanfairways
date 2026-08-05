import { useEffect, useState } from "react";
import { isPeakTime, addDurationToTime } from "@/lib/pricing-utils";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, Wallet, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBooking, PaymentMethod } from "@/hooks/useBooking";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DateTimePicker } from "@/components/booking/DateTimePicker";
import { BayAvailabilityGrid } from "@/components/booking/BayAvailabilityGrid";
import { toast } from "@/hooks/use-toast";
import venueLogo from "@/assets/venue-logo.png";
import { MembershipPaymentIssueDialog } from "@/components/membership/MembershipPaymentIssueDialog";
import { useTenant } from "@/config/tenant";
import { usePricing } from "@/hooks/usePricing";
import { hasSingleBayPeakLimit, isOffPeakOnlyTier } from "@/lib/tier-config";

const PENDING_BOOKING_KEY = "bb:pendingBookingId";

export default function Booking() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { tenant } = useTenant();
  const { pricing, defaultTier, getTierLabel, peakRate: walkInPeakRate } = usePricing();
  const walkInLabel = defaultTier?.display_name || "Walk-in";
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const {
    bays,
    isLoading,
    isLoadingSavedCard,
    userMembershipTier,
    actualMembershipTier,
    isPaymentLimbo,
    depositBalance,
    packHoursBalance,

    savedCard,
    getHourlyRate,
    getRateInfo,
    getBookingTotal,
    isPeakSlot,
    availableDurations,

    checkMultiBayRestriction,
    getHolidaySurchargeForDate,
    fetchBookingsForDate,
    checkBayAvailability,
    createBooking,
    refetchSavedCard,
  } = useBooking();

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTime, setSelectedTime] = useState<string | undefined>();
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [selectedPlayers, setSelectedPlayers] = useState<number>(1);
  const [selectedBayId, setSelectedBayId] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"balance" | "card">("card");
  const [usePartialBalance, setUsePartialBalance] = useState(false);
  const [applyPackHours, setApplyPackHours] = useState(true);

  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [playingComp, setPlayingComp] = useState(false);
  const [showMembershipIssueDialog, setShowMembershipIssueDialog] = useState(false);

  const COMP_NOTE = "[COMP] Wednesday Ambrose";

  const PARTIAL_BALANCE_KEY = "bb:partialBalanceAmount";

  // Show toast if setup was cancelled
  useEffect(() => {
    if (searchParams.get("setup_cancelled") === "true") {
      toast({
        title: "Card setup cancelled",
        description: "You need to add a payment method to make bookings.",
        variant: "destructive",
      });
    }
  }, [searchParams]);

  // Handle cancelled checkout - delete the pending booking and restore partial balance
  useEffect(() => {
    const handleCancelledBooking = async () => {
      const bookingId = searchParams.get("booking_id");
      const wasCancelled = searchParams.get("booking_cancelled") === "true";
      
      if (wasCancelled && bookingId) {
        try {
          // Restore partial balance if it was deducted before checkout redirect
          const storedPartialAmount = localStorage.getItem(PARTIAL_BALANCE_KEY);
          if (storedPartialAmount) {
            const partialAmount = parseFloat(storedPartialAmount);
            if (partialAmount > 0) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
                const { data: profile } = await supabase
                  .from("profiles")
                  .select("deposit_balance")
                  .eq("user_id", user.id)
                  .maybeSingle();
                
                const currentBalance = Number(profile?.deposit_balance) || 0;
                const newBalance = currentBalance + partialAmount;
                
                await supabase
                  .from("profiles")
                  .update({ deposit_balance: newBalance })
                  .eq("user_id", user.id);
                
                await supabase.from("deposit_transactions").insert({
                  user_id: user.id,
                  amount: partialAmount,
                  balance_before: currentBalance,
                  balance_after: newBalance,
                  transaction_type: "booking_refund",
                  description: "Restored credit - booking checkout cancelled",
                  related_booking_id: bookingId,
                });
                
                console.log("[Booking] Restored partial balance:", partialAmount);
              }
            }
            localStorage.removeItem(PARTIAL_BALANCE_KEY);
          }

          // Delete the pending booking that was never paid
          await supabase
            .from("bookings")
            .delete()
            .eq("id", bookingId)
            .eq("status", "pending");
          
          toast({
            title: "Booking cancelled",
            description: "Your booking was not completed. Any credits have been restored.",
            variant: "destructive",
          });
        } catch (error) {
          console.error("Failed to handle cancelled booking:", error);
        }
      }
    };
    
    handleCancelledBooking();
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (selectedDate) {
      fetchBookingsForDate(selectedDate);
      setSelectedBayId(undefined);
    }
  }, [selectedDate, selectedTime, selectedDuration]);

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date);
    setSelectedBayId(undefined);
  };

  const handleTimeChange = (time: string) => {
    setSelectedTime(time);
    setSelectedBayId(undefined);
  };

  const handleDurationChange = (duration: number) => {
    setSelectedDuration(duration);
    setSelectedBayId(undefined);
  };

  const handlePlayersChange = (players: number) => {
    setSelectedPlayers(players);
  };

  // Create a pending booking to lock the slot before redirecting to add card
  const createPendingReservation = async (): Promise<string | null> => {
    if (!selectedDate || !selectedTime || !selectedBayId) return null;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      
      // Fresh DB check for multi-bay peak restriction (prevents race conditions)
      let currentHourlyRate = getHourlyRate(userMembershipTier, selectedDate, selectedTime);
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      
      if (hasSingleBayPeakLimit(pricing, userMembershipTier) && isPeakSlot(selectedDate, selectedTime)) {
        const endTimeCalc = addDurationToTime(selectedTime, selectedDuration);
        
        const { data: existingBookings } = await supabase
          .from("bookings")
          .select("id, bay_id, start_time, end_time")
          .eq("user_id", user.id)
          .eq("booking_date", dateStr)
          .in("status", ["confirmed", "pending"])
          .neq("bay_id", selectedBayId);
        
        const hasOverlap = (existingBookings || []).some(b => {
          const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
          return toMin(selectedTime) < toMin(b.end_time) && toMin(endTimeCalc) > toMin(b.start_time);
        });
        
        if (hasOverlap) {
          console.log("[Booking] Multi-bay peak restriction triggered - charging walk-in rate");
          const holidaySurcharge = getHolidaySurchargeForDate(selectedDate);
          currentHourlyRate = holidaySurcharge > 0
            ? Math.round(walkInPeakRate * (1 + holidaySurcharge / 100) * 100) / 100
            : walkInPeakRate;
        }
      }
      
      const { total: totalPrice } = getBookingTotal(currentHourlyRate, selectedDuration, selectedDate, selectedTime);
      
      const endTime = addDurationToTime(selectedTime, selectedDuration);

      
      const { data: bookingData, error } = await supabase
        .from("bookings")
        .insert({
          user_id: user.id,
          bay_id: selectedBayId,
          booking_date: format(selectedDate, "yyyy-MM-dd"),
          start_time: selectedTime,
          end_time: endTime,
          duration_hours: selectedDuration,
          hourly_rate: currentHourlyRate,
          total_price: totalPrice,
          player_count: selectedPlayers,
          payment_method: "pending",
          status: "pending",
          notes: playingComp ? COMP_NOTE : null,
        })
        .select()
        .single();
      
      if (error) {
        const msg = (error.message || "").toLowerCase();

        // Membership payment failure block (DB trigger)
        if (
          msg.includes("membership payment") ||
          msg.includes("payment didn't go through") ||
          msg.includes("update your card on file before booking")
        ) {
          setShowMembershipIssueDialog(true);
          return null;
        }

        // Slot conflict
        if (msg.includes("no longer available") || msg.includes("overlap")) {
          toast({
            title: "Slot Unavailable",
            description: "This time slot was just booked. Please select a different time or bay.",
            variant: "destructive",
          });
          fetchBookingsForDate(selectedDate);
          return null;
        }

        // Generic fallback - surface the actual error so users aren't left in the dark
        toast({
          title: "Couldn't reserve slot",
          description: error.message || "Please try again or contact us.",
          variant: "destructive",
        });
        throw error;
      }
      
      return bookingData.id;
    } catch (error: any) {
      console.error("Failed to create pending reservation:", error);
      return null;
    }
  };

  const handleConfirmClick = async () => {
    if (!selectedDate || !selectedTime || !selectedBayId) {
      toast({
        title: "Missing selection",
        description: "Please select a date, time, and bay.",
        variant: "destructive",
      });
      return;
    }

    const totalPrice = sessionTotal;

    // Free bookings bypass all payment logic - confirm directly
    if (totalPrice <= 0) {
      handleConfirmBooking("balance"); // Will auto-confirm as "free" in useBooking
      return;
    }

    // Prepaid hours are always spent through createBooking (it handles the wallet,
    // then credit, then card, and rolls everything back if a step fails)
    if (packHoursToApply > 0) {
      if (amountAfterHours <= 0) {
        handleConfirmBooking("balance");
      } else {
        handleConfirmBooking("card", usePartialBalance && depositBalance > 0);
      }
      return;
    }

    // If paying with balance and have enough, skip pending/checkout entirely
    if (selectedPaymentMethod === "balance" && depositBalance >= totalPrice) {
      handleConfirmBookingWithBalance();
      return;
    }

    // If using partial balance with card, use the createBooking flow which handles both
    if (selectedPaymentMethod === "card" && usePartialBalance && depositBalance > 0) {
      handleConfirmBooking("card", true);
      return;
    }


    // ALWAYS create a pending booking first to lock the slot
    setIsSubmitting(true);
    const newPendingBookingId = await createPendingReservation();
    
    if (!newPendingBookingId) {
      setIsSubmitting(false);
      return; // Error already shown in createPendingReservation
    }
    
    setPendingBookingId(newPendingBookingId);
    localStorage.setItem(PENDING_BOOKING_KEY, newPendingBookingId);

    // Proceed to complete booking - if no saved card, charge-booking will 
    // redirect to Stripe Checkout which handles card setup + payment in one flow
    await completePendingBooking(newPendingBookingId);
  };

  // Complete a pending booking after card is added
  const completePendingBooking = async (bookingId: string) => {
    try {
      setIsSubmitting(true);
      
      // First verify the booking still exists and is pending
      const { data: booking, error: fetchError } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", bookingId)
        .eq("status", "pending")
        .single();
      
      if (fetchError || !booking) {
        throw new Error("Booking reservation expired. Please try again.");
      }
      
      // Get bay name for description
      const bay = bays.find(b => b.id === booking.bay_id);
      const bayName = bay?.name || "Bay";
      const bookingDate = new Date(booking.booking_date);
      const description = `${bayName} - ${format(bookingDate, "PPP")} at ${booking.start_time} (${booking.duration_hours}hr)`;
      
      // Charge the booking
      const { data: chargeResult, error: chargeError } = await supabase.functions.invoke("charge-booking", {
        body: {
          bookingId: bookingId,
          amount: booking.total_price,
          description,
        },
      });

      if (chargeError) {
        throw new Error(chargeError.message || "Payment failed");
      }

      if (chargeResult.error) {
        throw new Error(chargeResult.error);
      }

      if (chargeResult.requiresCheckout) {
        // Redirect to Stripe checkout
        window.location.href = chargeResult.checkoutUrl;
        return;
      }
      
      // Payment successful - send notification
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            booking_id: bookingId,
            notification_type: "confirmation",
          },
        });
      } catch (notificationError) {
        console.error("Failed to send booking notification:", notificationError);
      }

      // Check loyalty credit eligibility (fire and forget)
      try {
        await supabase.functions.invoke("check-loyalty-credit", {
          body: { user_id: user.id },
        });
      } catch (loyaltyError) {
        console.error("Loyalty check failed:", loyaltyError);
      }

      toast({
        title: "Booking confirmed!",
        description: `Your bay is booked for ${format(bookingDate, "PPP")} at ${booking.start_time}.`,
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "Unable to complete booking. Please try again.",
        variant: "destructive",
      });
      // Clean up the pending booking
      if (bookingId) {
        await supabase.from("bookings").delete().eq("id", bookingId).eq("status", "pending");
      }
    } finally {
      setIsSubmitting(false);
      localStorage.removeItem(PENDING_BOOKING_KEY);
      setPendingBookingId(null);
    }
  };

  const handleConfirmBooking = async (paymentMethod: PaymentMethod, applyPartialBalance: boolean = false) => {
    if (!selectedDate || !selectedTime || !selectedBayId) return;

    setIsSubmitting(true);
    try {
      const partialAmount = applyPartialBalance ? depositBalance : undefined;
      const result = await createBooking(
        selectedBayId, 
        selectedDate, 
        selectedTime, 
        selectedDuration, 
        selectedPlayers, 
        paymentMethod,
        undefined, // No new payment method ID - we use saved card
        partialAmount,
        playingComp ? COMP_NOTE : undefined
      );
      
      // If charge-booking returned a checkout URL (no saved card), redirect there
      if (result.requiresCheckout && result.checkoutUrl) {
        // Store partial balance amount so we can restore it if checkout is cancelled
        if (partialAmount && partialAmount > 0) {
          localStorage.setItem(PARTIAL_BALANCE_KEY, String(partialAmount));
        }
        localStorage.setItem(PENDING_BOOKING_KEY, result.booking.id);
        window.location.href = result.checkoutUrl;
        return;
      }

      const totalPrice = sessionTotal;
      let message = `Your bay is booked for ${format(selectedDate, "PPP")} at ${selectedTime}.`;
      if (paymentMethod === "balance") {
        message += " Balance deducted.";
      } else if (applyPartialBalance && depositBalance > 0) {
        const cardAmount = totalPrice - depositBalance;
        message += ` $${depositBalance.toFixed(2)} from balance, $${cardAmount.toFixed(2)} charged to card.`;
      } else if (savedCard) {
        message += ` Charged to your ${savedCard.brand} •••• ${savedCard.last4}.`;
      }
      
      toast({
        title: "Booking confirmed!",
        description: message,
      });

      // Check loyalty credit eligibility (fire and forget)
      supabase.functions.invoke("check-loyalty-credit", {
        body: { user_id: user?.id },
      }).catch((e) => console.error("Loyalty check failed:", e));

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "Unable to complete booking. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fast path: Auto-confirm booking with sufficient balance (no pending, no Stripe)
  const handleConfirmBookingWithBalance = async () => {
    if (!selectedDate || !selectedTime || !selectedBayId) return;

    setIsSubmitting(true);
    try {
      const result = await createBooking(
        selectedBayId,
        selectedDate,
        selectedTime,
        selectedDuration,
        selectedPlayers,
        "balance", // Pay entirely with balance
        undefined,
        undefined,
        playingComp ? COMP_NOTE : undefined
      );

      const totalPrice = sessionTotal;
      toast({
        title: "Booking confirmed!",
        description: `Your bay is booked for ${format(selectedDate, "PPP")} at ${selectedTime}. $${totalPrice.toFixed(2)} deducted from your balance.`,
      });

      // Check loyalty credit eligibility (fire and forget)
      supabase.functions.invoke("check-loyalty-credit", {
        body: { user_id: user?.id },
      }).catch((e) => console.error("Loyalty check failed:", e));

      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: "Booking failed",
        description: error.message || "Unable to complete booking. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // Calculate rate with peak/off-peak logic and multi-bay restriction
  const rateInfo = selectedDate && selectedTime 
    ? getRateInfo(selectedDate, selectedTime, selectedDuration, selectedBayId)
    : null;
  
  const hourlyRate = rateInfo?.rate ?? (selectedDate && selectedTime 
    ? getHourlyRate(userMembershipTier, selectedDate, selectedTime)
    : getHourlyRate());

  // Session total: hourly rate × duration, unless a casual special is cheaper
  const sessionTotal = rateInfo?.total ?? hourlyRate * selectedDuration;
  const appliedSpecial = rateInfo?.special ?? null;

  // Prepaid pack hours cover session time at the session's effective hourly rate
  const packHoursAvailable = Math.min(packHoursBalance, selectedDuration);
  const packHoursToApply = applyPackHours ? packHoursAvailable : 0;
  const packDiscount =
    selectedDuration > 0
      ? Math.round(packHoursToApply * (sessionTotal / selectedDuration) * 100) / 100
      : 0;
  const amountAfterHours = Math.max(0, Math.round((sessionTotal - packDiscount) * 100) / 100);

  const canConfirm = selectedDate && selectedTime && selectedBayId;



  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary/80"
              onClick={() => navigate("/dashboard")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-display text-base sm:text-2xl tracking-wide">BOOK A BAY</h1>
          </div>
          <img 
            src={venueLogo} 
            alt={tenant.venue_name} 
            className="h-7 sm:h-10 w-auto"
          />
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Membership payment limbo banner - forces visitor pricing */}
        {isPaymentLimbo && (
          <div className="rounded-lg border border-destructive bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-display text-base text-destructive">
                  Membership payment failed, paying {walkInLabel} rates
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your last {getTierLabel(actualMembershipTier) || "Member"} payment
                  didn't go through. You can still book at the <strong>${walkInPeakRate}/hr {walkInLabel.toLowerCase()} rate</strong>,
                  or retry your membership payment now to get member pricing back.
                </p>
                <Button
                  size="sm"
                  className="mt-3 gradient-orange"
                  onClick={() => setShowMembershipIssueDialog(true)}
                >
                  Retry membership payment
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Membership Badge with Peak/Off-Peak Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary rounded-full">
            <span className="text-sm text-secondary-foreground">
              {getTierLabel(userMembershipTier)}
            </span>
            <span className="text-sm font-semibold text-accent">
              ${hourlyRate}/hr
            </span>
          </div>
          
          {(rateInfo?.isRestricted || rateInfo?.isMultiBayRestricted) && selectedTime && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
              {walkInLabel} Rate Applied
            </Badge>
          )}
        </div>

        {/* Multi-bay restriction warning for single-bay-limited tiers */}
        {rateInfo?.isMultiBayRestricted && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Additional bay booking.</strong> You already have a bay booked at this time. 
              Additional bays during peak hours are charged at {defaultTier?.display_name || "walk-in"} rates (${walkInPeakRate}/hr).
            </div>
          </div>
        )}

        {/* Off-peak-only tier restriction warning */}
        {isOffPeakOnlyTier(pricing, userMembershipTier) && rateInfo?.isRestricted && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Peak time selected.</strong> As a {getTierLabel(userMembershipTier)} member, your member rate applies during off-peak hours only. 
              This booking will be charged at the {defaultTier?.display_name || "walk-in"} peak rate (${walkInPeakRate}/hr).
            </div>
          </div>
        )}

        {/* Public holiday surcharge notice */}
        {rateInfo?.isHoliday && (
          <div className="flex items-start gap-2 p-3 bg-primary/10 border-2 border-primary/30 rounded-lg text-sm text-foreground">
            <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5 text-primary" />
            <div>
              <strong>Public Holiday Surcharge.</strong>{" "}
              {rateInfo.holidayName ? `${rateInfo.holidayName}, ` : ""}
              A {rateInfo.surchargePercent}% surcharge applies to all bookings on this day.
            </div>
          </div>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">When would you like to play?</CardTitle>
          </CardHeader>
          <CardContent>
            <DateTimePicker
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              selectedDuration={selectedDuration}
              durations={availableDurations}

              selectedPlayers={selectedPlayers}
              onDateChange={handleDateChange}
              onTimeChange={handleTimeChange}
              onDurationChange={handleDurationChange}
              onPlayersChange={handlePlayersChange}
              onCompChange={setPlayingComp}
            />
          </CardContent>
        </Card>

        {/* Bay Availability */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Select a Bay</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-accent" />
              </div>
            ) : (
              <BayAvailabilityGrid
                bays={bays}
                selectedTime={selectedTime}
                selectedDuration={selectedDuration}
                selectedBayId={selectedBayId}
                checkAvailability={checkBayAvailability}
                onSelectBay={setSelectedBayId}
                hourlyRate={hourlyRate}
                totalPrice={sessionTotal}
                specialName={appliedSpecial?.name ?? null}
                isPeak={rateInfo?.isPeak}

              />
            )}
          </CardContent>
        </Card>

        {/* Payment Method Selection - Only show if user has balance */}
        {canConfirm && depositBalance > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-xl">Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                const totalPrice = sessionTotal;
                const hasEnoughBalance = depositBalance >= totalPrice;
                const remainingAfterBalance = totalPrice - depositBalance;

                return (
                  <>
                    <div className={`flex items-center justify-between p-3 rounded-lg ${hasEnoughBalance ? 'bg-green-50 border border-green-200' : 'bg-secondary/50'}`}>
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-accent" />
                        <div>
                          <span className="font-medium">Credit Balance</span>
                          {hasEnoughBalance && (
                            <p className="text-sm text-green-700 font-semibold">You can pay with this!</p>
                          )}
                        </div>
                      </div>
                      <span className="font-semibold text-accent">${depositBalance.toFixed(2)}</span>
                    </div>

                    <RadioGroup
                      value={selectedPaymentMethod}
                      onValueChange={(value) => {
                        setSelectedPaymentMethod(value as "balance" | "card");
                        if (value === "balance") {
                          setUsePartialBalance(false);
                        }
                      }}
                      className="space-y-3"
                    >
                    {/* Full balance payment option - only if enough balance */}
                    {hasEnoughBalance && (
                      <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-secondary/30 transition-colors">
                        <RadioGroupItem value="balance" id="balance" />
                        <Label htmlFor="balance" className="flex-1 cursor-pointer">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Wallet className="h-4 w-4 text-muted-foreground" />
                              <span>Pay with Credit Balance</span>
                            </div>
                            <span className="font-medium text-green-600">-${totalPrice.toFixed(2)}</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Remaining balance: ${(depositBalance - totalPrice).toFixed(2)}
                          </p>
                        </Label>
                      </div>
                    )}

                    {/* Card payment option */}
                    <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-secondary/30 transition-colors">
                      <RadioGroupItem value="card" id="card" />
                      <Label htmlFor="card" className="flex-1 cursor-pointer">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-muted-foreground" />
                            <span>
                              {savedCard 
                                ? `Pay with ${savedCard.brand} •••• ${savedCard.last4}` 
                                : "Pay with Card"}
                            </span>
                          </div>
                          <span className="font-medium">${totalPrice.toFixed(2)}</span>
                        </div>
                      </Label>
                    </div>

                    {/* Partial payment option - only if not enough balance but has some */}
                    {!hasEnoughBalance && selectedPaymentMethod === "card" && (
                      <div className="ml-6 p-3 border border-dashed rounded-lg bg-secondary/20">
                        <div className="flex items-start space-x-3">
                          <Checkbox 
                            id="partial" 
                            checked={usePartialBalance}
                            onCheckedChange={(checked) => setUsePartialBalance(checked === true)}
                          />
                          <Label htmlFor="partial" className="cursor-pointer">
                            <div className="font-medium">Apply credit balance to reduce card payment</div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Use ${depositBalance.toFixed(2)} credit, pay ${remainingAfterBalance.toFixed(2)} by card
                            </p>
                          </Label>
                        </div>
                      </div>
                    )}
                    </RadioGroup>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        )}

        {/* Confirm Button */}
        <div className="space-y-2">
          <Button
            className="w-full py-6 text-lg font-display gradient-orange text-accent-foreground"
            disabled={!canConfirm || isSubmitting}
            onClick={handleConfirmClick}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {sessionTotal <= 0 
                  ? "Confirming..." 
                  : selectedPaymentMethod === "balance" 
                    ? "Processing..." 
                    : "Charging Card..."}
              </>
            ) : (
              (() => {
                if (!canConfirm) return "Confirm Booking";
                const totalPrice = sessionTotal;
                // Free bookings get special treatment
                if (totalPrice <= 0) {
                  return "Confirm Free Booking";
                }
                if (selectedPaymentMethod === "balance" && depositBalance >= totalPrice) {
                  return `Confirm Booking - $${totalPrice.toFixed(2)} from Balance`;
                }
                if (usePartialBalance && depositBalance > 0) {
                  const cardAmount = totalPrice - depositBalance;
                  return `Confirm Booking - $${cardAmount.toFixed(2)} Card + $${depositBalance.toFixed(2)} Balance`;
                }
                return `Confirm Booking - $${totalPrice.toFixed(2)}`;
              })()
            )}
          </Button>
          {canConfirm && depositBalance === 0 && sessionTotal > 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {isLoadingSavedCard 
                ? "Checking payment method..."
                : savedCard 
                  ? `Will charge your ${savedCard.brand} card ending in ${savedCard.last4}`
                  : "You'll need to add a payment method"}
            </p>
          )}
        </div>
      </main>

      <MembershipPaymentIssueDialog
        open={showMembershipIssueDialog}
        onOpenChange={setShowMembershipIssueDialog}
        context="to complete this booking"
        onResolved={() => {
          // After successful retry, refresh availability so the user can try again
          if (selectedDate) fetchBookingsForDate(selectedDate);
        }}
      />
    </div>
  );
}
