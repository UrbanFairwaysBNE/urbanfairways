import { useState, useEffect } from "react";
import { format, addDays, isToday, isBefore, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarIcon, Clock, MapPin, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { calculateHourlyRate, isPeakTime, getPricingLabel } from "@/lib/pricing-utils";
import { TierConfig, TIER_SELECT, findTier, isDefaultTier, normaliseTier } from "@/lib/tier-config";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: number;
  hourly_rate: number;
  bay_id: string;
  bay_number?: number;
  bay_name?: string;
}

interface Bay {
  id: string;
  name: string;
  bay_number: number;
}

interface UserProfile {
  membership_tier: string;
  custom_hourly_rate: number | null;
  deposit_balance: number;
  custom_segment: string | null;
}

interface RescheduleDialogProps {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const OPENING_HOUR = 8;
const CLOSING_HOUR = 22;

// Generate time slots from opening to closing
const generateTimeSlots = (): string[] => {
  const slots: string[] = [];
  for (let hour = OPENING_HOUR; hour < CLOSING_HOUR; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    slots.push(`${hour.toString().padStart(2, "0")}:30`);
  }
  return slots;
};

const ALL_TIME_SLOTS = generateTimeSlots();

export const RescheduleDialog = ({
  booking,
  open,
  onOpenChange,
  onSuccess,
}: RescheduleDialogProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [selectedBayId, setSelectedBayId] = useState<string>("");
  const [bays, setBays] = useState<Bay[]>([]);
  const [existingBookings, setExistingBookings] = useState<any[]>([]);
  const [bayBlocks, setBayBlocks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [pricingConfig, setPricingConfig] = useState<TierConfig[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedDate(undefined);
      setSelectedTime("");
      setSelectedBayId("");
      fetchBays();
      fetchUserProfile();
      fetchPricing();
    }
  }, [open]);

  // Fetch bookings and blocks when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchAvailability(selectedDate);
    }
  }, [selectedDate]);

  const fetchBays = async () => {
    const { data, error } = await supabase
      .from("bays")
      .select("id, name, bay_number")
      .eq("is_active", true)
      .order("bay_number");

    if (!error && data) {
      setBays(data);
    }
  };

  const fetchUserProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("membership_tier, custom_hourly_rate, deposit_balance, custom_segment")
      .eq("user_id", user.id)
      .single();

    if (!error && data) {
      setUserProfile(data);
    }
  };

  const fetchPricing = async () => {
    const { data, error } = await supabase
      .from("pricing_config")
      .select(TIER_SELECT)
      .order("display_order");

    if (!error && data) {
      setPricingConfig((data as Record<string, unknown>[]).map(normaliseTier));
    }
  };

  const fetchAvailability = async (date: Date) => {
    setIsLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");

    const [bookingsResult, blocksResult] = await Promise.all([
      supabase
        .from("booking_availability")
        .select("bay_id, start_time, end_time")
        .eq("booking_date", dateStr),
      supabase
        .from("bay_blocks")
        .select("bay_id, start_time, end_time")
        .eq("block_date", dateStr),
    ]);

    // Filter out the current booking from existing bookings
    const filteredBookings = (bookingsResult.data || []).filter(
      (b) => !(b.bay_id === booking.bay_id && 
               b.start_time === booking.start_time && 
               format(new Date(booking.booking_date), "yyyy-MM-dd") === dateStr)
    );

    setExistingBookings(filteredBookings);
    setBayBlocks(blocksResult.data || []);
    setIsLoading(false);
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const calculateEndTime = (startTime: string, durationHours: number): string => {
    const [hours, minutes] = startTime.split(":").map(Number);
    const endHours = hours + durationHours;
    return `${endHours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const isSlotAvailable = (bayId: string, startTime: string): boolean => {
    const endTime = calculateEndTime(startTime, booking.duration_hours);
    const endHour = parseInt(endTime.split(":")[0]);

    // Check if booking would end after closing
    if (endHour > CLOSING_HOUR) return false;

    // Check if slot is in the past for today
    if (selectedDate && isToday(selectedDate)) {
      const now = new Date();
      const [slotHour, slotMin] = startTime.split(":").map(Number);
      const slotTime = new Date();
      slotTime.setHours(slotHour, slotMin, 0);
      if (slotTime <= now) return false;
    }

    // Check for overlapping bookings
    const hasBookingConflict = existingBookings.some((b) => {
      if (b.bay_id !== bayId) return false;
      const bStart = b.start_time;
      const bEnd = b.end_time;
      return startTime < bEnd && endTime > bStart;
    });

    if (hasBookingConflict) return false;

    // Check for bay blocks
    const hasBlockConflict = bayBlocks.some((block) => {
      if (block.bay_id !== bayId) return false;
      const bStart = block.start_time;
      const bEnd = block.end_time;
      return startTime < bEnd && endTime > bStart;
    });

    return !hasBlockConflict;
  };

  const getAvailableTimeSlots = (): string[] => {
    if (!selectedDate) return [];

    // Filter slots that would fit within operating hours
    return ALL_TIME_SLOTS.filter((time) => {
      const endTime = calculateEndTime(time, booking.duration_hours);
      const endHour = parseInt(endTime.split(":")[0]);
      
      // Must end by closing time
      if (endHour > CLOSING_HOUR) return false;

      // For today, filter out past times
      if (isToday(selectedDate)) {
        const now = new Date();
        const [slotHour, slotMin] = time.split(":").map(Number);
        const slotTime = new Date();
        slotTime.setHours(slotHour, slotMin, 0);
        if (slotTime <= now) return false;
      }

      return true;
    });
  };

  const getAvailableBays = (): Bay[] => {
    if (!selectedTime) return [];
    return bays.filter((bay) => isSlotAvailable(bay.id, selectedTime));
  };

  // Calculate new price based on selected date/time
  const calculateNewPrice = (): { hourlyRate: number; totalPrice: number; isPeak: boolean } | null => {
    if (!selectedDate || !selectedTime || !userProfile) return null;

    const newHourlyRate = calculateHourlyRate(
      userProfile.membership_tier,
      selectedDate,
      selectedTime,
      pricingConfig,
      { segment: userProfile.custom_segment }
    );

    return {
      hourlyRate: newHourlyRate,
      totalPrice: newHourlyRate * booking.duration_hours,
      isPeak: isPeakTime(selectedDate, selectedTime),
    };
  };

  const newPriceInfo = calculateNewPrice();
  const priceDifference = newPriceInfo ? newPriceInfo.totalPrice - booking.total_price : 0;
  const hasCustomRate = userProfile?.custom_hourly_rate != null && userProfile.custom_hourly_rate > 0;

  const handleSubmit = async () => {
    if (!selectedDate || !selectedTime || !selectedBayId) {
      toast.error("Please select a date, time, and bay");
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading("Rescheduling your booking...");

    try {
      const { data, error } = await supabase.functions.invoke("reschedule-booking", {
        body: {
          booking_id: booking.id,
          new_date: format(selectedDate, "yyyy-MM-dd"),
          new_start_time: selectedTime,
          new_bay_id: selectedBayId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.dismiss(toastId);

      // Show detailed success message
      let successMessage = "Booking rescheduled successfully!";
      if (data?.priceChanged) {
        if (data.priceDifference > 0) {
          if (data.payment?.chargedToCard) {
            successMessage = `Rescheduled! $${data.payment.chargedToCard.toFixed(2)} charged to your card.`;
          } else if (data.payment?.chargedFromBalance) {
            successMessage = `Rescheduled! $${data.payment.chargedFromBalance.toFixed(2)} deducted from your balance.`;
          }
        } else if (data.priceDifference < 0) {
          successMessage = `Rescheduled! $${data.payment?.refundedToBalance?.toFixed(2)} added to your balance.`;
        }
      }

      toast.success(successMessage);
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Reschedule error:", error);
      toast.dismiss(toastId);
      toast.error(error instanceof Error ? error.message : "Failed to reschedule booking");
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableTimeSlots = getAvailableTimeSlots();
  const availableBays = getAvailableBays();

  // Price changes only apply to tiers whose rate varies with peak/off-peak
  const showPriceChanges = userProfile &&
    (isDefaultTier(pricingConfig, userProfile.membership_tier) ||
      !!findTier(pricingConfig, userProfile.membership_tier)?.restricted_to_off_peak ||
      findTier(pricingConfig, userProfile.membership_tier)?.off_peak_hourly_rate != null) &&
    !hasCustomRate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule Booking</DialogTitle>
          <DialogDescription>
            Choose a new date, time, and bay for your {booking.duration_hours} hour
            {booking.duration_hours > 1 ? "s" : ""} session.
            {showPriceChanges && (
              <span className="text-xs block mt-1 text-muted-foreground">
                Note: Price may vary based on peak/off-peak times.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current booking info */}
          <div className="bg-muted rounded-lg p-3 text-sm">
            <p className="font-medium mb-1">Current booking:</p>
            <p className="text-muted-foreground">
              {format(new Date(booking.booking_date), "EEE, MMM d")} at{" "}
              {formatTime(booking.start_time)} - Bay {booking.bay_number}
            </p>
            <p className="text-muted-foreground">
              ${booking.total_price.toFixed(2)} ({booking.duration_hours}hr × ${booking.hourly_rate}/hr)
            </p>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              New Date
            </label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  {selectedDate ? format(selectedDate, "EEE, MMM d, yyyy") : "Select a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSelectedTime("");
                    setSelectedBayId("");
                    setCalendarOpen(false);
                  }}
                  disabled={(date) =>
                    isBefore(startOfDay(date), startOfDay(new Date())) ||
                    date > addDays(new Date(), 30)
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              New Time
            </label>
            <Select
              value={selectedTime}
              onValueChange={(value) => {
                setSelectedTime(value);
                setSelectedBayId("");
              }}
              disabled={!selectedDate || isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading..." : "Select a time"} />
              </SelectTrigger>
              <SelectContent>
                {availableTimeSlots.map((time) => (
                  <SelectItem key={time} value={time}>
                    {formatTime(time)} - {formatTime(calculateEndTime(time, booking.duration_hours))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bay selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Bay
            </label>
            <Select
              value={selectedBayId}
              onValueChange={setSelectedBayId}
              disabled={!selectedTime || isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a bay" />
              </SelectTrigger>
              <SelectContent>
                {availableBays.length === 0 && selectedTime ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No bays available at this time
                  </div>
                ) : (
                  availableBays.map((bay) => (
                    <SelectItem key={bay.id} value={bay.id}>
                      Bay {bay.bay_number} - {bay.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Summary with price change */}
          {selectedDate && selectedTime && selectedBayId && newPriceInfo && (
            <div className={cn(
              "rounded-lg p-3 text-sm",
              priceDifference > 0 ? "bg-amber-500/10 border border-amber-500/20" :
              priceDifference < 0 ? "bg-green-500/10 border border-green-500/20" :
              "bg-primary/10"
            )}>
              <p className="font-medium mb-1">New booking:</p>
              <p>
                {format(selectedDate, "EEE, MMM d")} at {formatTime(selectedTime)} -{" "}
                {formatTime(calculateEndTime(selectedTime, booking.duration_hours))}
              </p>
              <p>Bay {bays.find((b) => b.id === selectedBayId)?.bay_number}</p>
              
              {/* Price info */}
              <div className="mt-2 pt-2 border-t border-current/10">
                <p className="font-medium">
                  ${newPriceInfo.totalPrice.toFixed(2)}
                  <span className="font-normal text-muted-foreground ml-1">
                    ({booking.duration_hours}hr × ${newPriceInfo.hourlyRate}/hr
                    {showPriceChanges && ` • ${newPriceInfo.isPeak ? "peak" : "off-peak"}`})
                  </span>
                </p>
                
                {priceDifference !== 0 && (
                  <p className={cn(
                    "flex items-center gap-1 mt-1",
                    priceDifference > 0 ? "text-amber-600" : "text-green-600"
                  )}>
                    {priceDifference > 0 ? (
                      <>
                        <ArrowUp className="h-3 w-3" />
                        ${priceDifference.toFixed(2)} extra will be charged
                      </>
                    ) : (
                      <>
                        <ArrowDown className="h-3 w-3" />
                        ${Math.abs(priceDifference).toFixed(2)} will be refunded to your balance
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedDate || !selectedTime || !selectedBayId || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rescheduling...
              </>
            ) : priceDifference > 0 ? (
              `Confirm (+$${priceDifference.toFixed(2)})`
            ) : priceDifference < 0 ? (
              `Confirm (-$${Math.abs(priceDifference).toFixed(2)})`
            ) : (
              "Confirm Reschedule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
