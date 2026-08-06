import { useState, useEffect, useRef } from "react";
import { usePricing } from "@/hooks/usePricing";
import { addDurationToTime } from "@/lib/pricing-utils";
import { tierBadgeClass } from "@/lib/tier-config";
import { useOperatingHours } from "@/hooks/useOperatingHours";
import { format, addDays, isSameDay } from "date-fns";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
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
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { 
  ChevronLeft, 
  ChevronRight, 
  CalendarIcon, 
  Clock, 
  User, 
  Phone, 
  Mail,
  Users as UsersIcon,
  Percent,
  Pencil,
  X,
  Trash2,
  CircleDollarSign,
  AlertCircle,
  ShoppingCart,
  MessageSquare
} from "lucide-react";
import { AddBookingDialog } from "@/components/admin/AddBookingDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";

interface Bay {
  id: string;
  name: string;
  bay_number: number;
}

interface Booking {
  id: string;
  bay_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  status: string;
  player_count: number;
  total_price: number;
  user_id: string;
  stripe_payment_intent_id?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  profile?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
    membership_tier: string;
    total_bookings?: number;
    referral_source?: string | null;
  };
}

interface BayBlock {
  id: string;
  bay_id: string;
  block_date: string;
  start_time: string;
  end_time: string;
  reason: string | null;
}

// Operating hours: 5am to 11pm in 30-min increments
// Each slot is { hour: number, minute: 0 | 30 }
interface TimeSlot {
  hour: number;
  minute: number;
}

const SLOT_HEIGHT = 32; // pixels per 30-min slot

// Fallback if operating hours haven't loaded yet
const FALLBACK_START_HOUR = 5;
const FALLBACK_END_HOUR = 23;

export default function AdminTimetable() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const { pricing } = usePricing();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { globalWindow, getForDate } = useOperatingHours();

  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Slots follow the operating hours of the selected day (minute-accurate,
  // so a 5:30am open starts the grid at 5:30, not 5:00).
  const dayHours = getForDate(selectedDate);
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + (m || 0);
  };
  const dayStartMinutes = dayHours.is_open
    ? toMin(dayHours.open_time)
    : globalWindow.startMinutes ?? FALLBACK_START_HOUR * 60;
  const dayEndMinutes = dayHours.is_open
    ? toMin(dayHours.close_time)
    : globalWindow.endMinutes ?? FALLBACK_END_HOUR * 60;

  const OPERATING_START_HOUR = Math.floor(dayStartMinutes / 60);
  const OPERATING_END_HOUR = Math.ceil(dayEndMinutes / 60);

  const OPERATING_SLOTS: TimeSlot[] = [];
  for (let m = dayStartMinutes; m < dayEndMinutes; m += 30) {
    OPERATING_SLOTS.push({ hour: Math.floor(m / 60), minute: m % 60 });
  }

  
  const [bays, setBays] = useState<Bay[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [blocks, setBlocks] = useState<BayBlock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<BayBlock | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editStartTime, setEditStartTime] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editBayId, setEditBayId] = useState("");
  const [editPlayerCount, setEditPlayerCount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [editCalendarOpen, setEditCalendarOpen] = useState(false);

  // Cancel booking state
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [sendCancellationNotification, setSendCancellationNotification] = useState(true);
  const [refundCustomer, setRefundCustomer] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Add booking state
  const [showAddBookingDialog, setShowAddBookingDialog] = useState(false);
  const [addBookingInitialTime, setAddBookingInitialTime] = useState<string>("");
  const [addBookingInitialBayId, setAddBookingInitialBayId] = useState<string>("");

  // Current time indicator
  const [currentTime, setCurrentTime] = useState(new Date());
  const timetableRef = useRef<HTMLDivElement>(null);
  const currentTimeIndicatorRef = useRef<HTMLDivElement>(null);

  // Wednesday Ambrose comp eligibility (4-8pm Wed Brisbane) — matches customer prompt logic
  const [togglingComp, setTogglingComp] = useState(false);

  const isCompEligible = (() => {
    if (!selectedBooking) return false;
    // booking_date is YYYY-MM-DD Brisbane local
    const [y, m, d] = selectedBooking.booking_date.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 3 = Wed
    if (dow !== 3) return false;
    const [sh, sm] = selectedBooking.start_time.split(":").map(Number);
    const startMin = sh * 60 + sm;
    // Any booking that starts between 4pm-8pm
    return startMin >= 16 * 60 && startMin < 20 * 60;
  })();

  const toggleCompTag = async () => {
    if (!selectedBooking) return;
    setTogglingComp(true);
    const tag = `[COMP] Wednesday Ambrose`;
    const current = selectedBooking.notes ?? "";
    const hasTag = current.includes("[COMP]");
    let next: string | null;
    if (hasTag) {
      next = current.replace(/\[COMP\][^\n]*/g, "").replace(/\n{2,}/g, "\n").trim();
      if (!next) next = null;
    } else {
      next = current ? `${tag}\n${current}` : tag;
    }
    const { error } = await supabase
      .from("bookings")
      .update({ notes: next })
      .eq("id", selectedBooking.id);
    setTogglingComp(false);
    if (error) {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedBooking({ ...selectedBooking, notes: next });
    setBookings(prev => prev.map(b => b.id === selectedBooking.id ? { ...b, notes: next } : b));
    toast({
      title: hasTag ? "Removed from Comp" : "Added to Comp",
      description: hasTag ? "Booking will no longer be recorded." : "Session will auto-record if Hub Highlights is on.",
    });
  };



  useEffect(() => {
    if (isAdmin) {
      // Fetch bays and initial bookings in parallel
      Promise.all([fetchBays(), fetchBookings()]);
    }
  }, [isAdmin]);

  // Update current time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to current time on load (only for today)
  useEffect(() => {
    if (!isLoading && isSameDay(selectedDate, new Date()) && currentTimeIndicatorRef.current) {
      setTimeout(() => {
        currentTimeIndicatorRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 100);
    }
  }, [isLoading, selectedDate]);

  // Refetch bookings when date changes (but not on initial load)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isAdmin) {
      fetchBookings();
    }
  }, [selectedDate]);

  // Realtime subscription to auto-refresh when bookings change.
  // Debounced + filtered to current date so bursts don't blank the table,
  // and silent (no loading flag) so the UI never flashes empty mid-refresh.
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchBookingsRef = useRef<(silent?: boolean) => Promise<void>>();
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel('timetable-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
        },
        (payload: any) => {
          // Only react if the change concerns the date currently displayed
          const dateStr = format(selectedDateRef.current, "yyyy-MM-dd");
          const newDate = (payload?.new as any)?.booking_date;
          const oldDate = (payload?.old as any)?.booking_date;
          if (newDate && newDate !== dateStr && (!oldDate || oldDate !== dateStr)) {
            return;
          }

          // Debounce bursts (insert -> confirm update -> stale cleanup)
          if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = setTimeout(() => {
            fetchBookingsRef.current?.(true); // silent refresh
          }, 300);
        }
      )
      .subscribe();

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAdmin]); // Only recreate subscription when admin status changes

  const fetchBays = async () => {
    const { data, error } = await supabase
      .from("bays")
      .select("*")
      .eq("is_active", true)
      .order("bay_number");

    if (!error && data) {
      setBays(data);
    }
  };

  const fetchInFlightRef = useRef(0);
  const fetchBookings = async (silent: boolean = false) => {
    if (!silent) setIsLoading(true);
    const requestId = ++fetchInFlightRef.current;
    
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    // Fetch bookings (both confirmed AND pending) and blocks in parallel
    const [bookingsResult, blocksResult] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("booking_date", dateStr)
        .in("status", ["confirmed", "pending"])
        .order("start_time"),
      supabase
        .from("bay_blocks")
        .select("*")
        .eq("block_date", dateStr)
    ]);

    // Guard: if a newer fetch started after this one, drop these results
    if (requestId !== fetchInFlightRef.current) return;

    if (!blocksResult.error && blocksResult.data) {
      setBlocks(blocksResult.data);
    }

    if (!bookingsResult.error && bookingsResult.data) {
      const data = bookingsResult.data;
      
      // Fetch profiles if there are bookings
      if (data.length > 0) {
        const userIds = [...new Set(data.map(b => b.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, phone, membership_tier, total_bookings, referral_source")
          .in("user_id", userIds);

        if (requestId !== fetchInFlightRef.current) return;

        const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));
        
        const transformedData = data.map((booking: any) => ({
          ...booking,
          profile: profileMap.get(booking.user_id)
        }));
        setBookings(transformedData);
      } else {
        setBookings([]);
      }
    }
    // On error: keep prior bookings instead of blanking the UI
    
    if (!silent) setIsLoading(false);
  };

  // Keep a ref to the latest fetchBookings so the realtime effect can call it
  // without re-subscribing on every render.
  useEffect(() => {
    fetchBookingsRef.current = fetchBookings;
  });

  const navigateDate = (direction: "prev" | "next") => {
    setSelectedDate(prev => direction === "next" ? addDays(prev, 1) : addDays(prev, -1));
  };

  const getBookingsForSlot = (bayId: string, slot: TimeSlot, date: Date = selectedDate) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const slotMinutes = slot.hour * 60 + slot.minute;
    
    return bookings.filter(b => {
      if (b.bay_id !== bayId || b.booking_date !== dateStr || b.status === "cancelled") return false;
      
      const [startHour, startMin] = b.start_time.split(":").map(Number);
      const [endHour, endMin] = b.end_time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  const getBlocksForSlot = (bayId: string, slot: TimeSlot) => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const slotMinutes = slot.hour * 60 + slot.minute;
    
    return blocks.filter(b => {
      if (b.bay_id !== bayId || b.block_date !== dateStr) return false;
      
      const [startHour, startMin] = b.start_time.split(":").map(Number);
      const [endHour, endMin] = b.end_time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = endHour * 60 + endMin;
      
      return slotMinutes >= startMinutes && slotMinutes < endMinutes;
    });
  };

  const isBlockStart = (block: BayBlock, slot: TimeSlot) => {
    const [startHour, startMin] = block.start_time.split(":").map(Number);
    return startHour === slot.hour && startMin === slot.minute;
  };

  const getBlockSlotSpan = (block: BayBlock) => {
    const [startHour, startMin] = block.start_time.split(":").map(Number);
    const [endHour, endMin] = block.end_time.split(":").map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return (endMinutes - startMinutes) / 30;
  };

  const isSlotStart = (booking: Booking, slot: TimeSlot) => {
    const [startHour, startMin] = booking.start_time.split(":").map(Number);
    return startHour === slot.hour && startMin === slot.minute;
  };

  const getBookingSlotSpan = (booking: Booking) => {
    // duration_hours * 2 gives us the number of 30-min slots
    return booking.duration_hours * 2;
  };

  const isBookingPaid = (booking: Booking) => {
    // A booking is paid if:
    // 1. It has a stripe_payment_intent_id (paid via Stripe), OR
    // 2. payment_method is 'card', 'balance', or 'cash'
    // Unpaid bookings have payment_method as 'pending' (phone bookings)
    return booking.stripe_payment_intent_id 
      || booking.payment_method === 'card'
      || booking.payment_method === 'balance'
      || booking.payment_method === 'cash';
  };

  const openAddBookingDialog = (slot: TimeSlot, bayId: string) => {
    const timeStr = `${slot.hour.toString().padStart(2, "0")}:${slot.minute.toString().padStart(2, "0")}`;
    setAddBookingInitialTime(timeStr);
    setAddBookingInitialBayId(bayId);
    setShowAddBookingDialog(true);
  };

  // Calculate position of current time indicator
  const getCurrentTimePosition = () => {
    // Use currentTime state to ensure component re-renders when time updates
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

    // Only show during the day's operating hours
    if (nowMinutes < dayStartMinutes || nowMinutes >= dayEndMinutes) return null;

    // Calculate position: each 30-min slot is SLOT_HEIGHT pixels
    const minutesSinceStart = nowMinutes - dayStartMinutes;
    const position = (minutesSinceStart / 30) * SLOT_HEIGHT;

    
    return position;
  };

  const calculateOccupancy = () => {
    const totalSlots = bays.length * OPERATING_SLOTS.length;
    let bookedSlots = 0;

    bays.forEach(bay => {
      OPERATING_SLOTS.forEach(slot => {
        const slotBookings = getBookingsForSlot(bay.id, slot);
        if (slotBookings.length > 0) bookedSlots++;
      });
    });

    return totalSlots > 0 ? Math.round((bookedSlots / totalSlots) * 100) : 0;
  };

  const getTodayBookingsCount = () => {
    const dateStr = format(selectedDate, "yyyy-MM-dd");
    const uniqueBookings = new Set(
      bookings
        .filter(b => b.booking_date === dateStr && b.status !== "cancelled")
        .map(b => b.id)
    );
    return uniqueBookings.size;
  };

  const formatSlotTime = (slot: TimeSlot) => {
    const hour = slot.hour;
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = slot.minute === 0 ? "" : ":30";
    return `${displayHour}${minStr}${ampm}`;
  };

  const formatTime = (time: string) => {
    const [hour, min] = time.split(":").map(Number);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = min === 0 ? "" : `:${min.toString().padStart(2, "0")}`;
    return `${displayHour}${minStr}${ampm}`;
  };

  const getMembershipColor = (tier: string) => tierBadgeClass(pricing, tier);

  // Generate time slots for the dropdown (5am to 10:30pm in 30-min increments)
  const TIME_OPTIONS = OPERATING_SLOTS.filter(slot => {
    // Allow start times up to 10:30pm (leaving room for at least 30min booking)
    return slot.hour < 22 || (slot.hour === 22 && slot.minute === 0);
  }).map(slot => {
    const timeStr = `${slot.hour.toString().padStart(2, "0")}:${slot.minute.toString().padStart(2, "0")}`;
    return { value: timeStr, label: formatSlotTime(slot) };
  });

  const DURATION_OPTIONS = [
    { value: "1", label: "1 hour" },
    { value: "2", label: "2 hours" },
    { value: "3", label: "3 hours" },
    { value: "4", label: "4 hours" },
  ];

  const PLAYER_OPTIONS = [
    { value: "1", label: "1 player" },
    { value: "2", label: "2 players" },
    { value: "3", label: "3 players" },
    { value: "4", label: "4 players" },
  ];

  const startEditing = () => {
    if (!selectedBooking) return;
    setEditDate(new Date(selectedBooking.booking_date));
    setEditStartTime(selectedBooking.start_time.slice(0, 5)); // "HH:MM"
    setEditDuration(selectedBooking.duration_hours.toString());
    setEditBayId(selectedBooking.bay_id);
    setEditPlayerCount(selectedBooking.player_count.toString());
    setEditNotes(selectedBooking.notes || "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditCalendarOpen(false);
  };

  const calculateEndTime = (startTime: string, durationHours: number): string =>
    addDurationToTime(startTime, durationHours);

  const saveBookingChanges = async () => {
    if (!selectedBooking || !editDate) return;

    setIsSaving(true);

    const newDuration = parseInt(editDuration);
    const newEndTime = calculateEndTime(editStartTime, newDuration);
    const endHour = parseInt(newEndTime.split(":")[0]);
    
    // Validate end time doesn't exceed operating hours (11pm)
    if (endHour > 23) {
      toast({
        title: "Invalid time",
        description: "Booking cannot extend past 11pm.",
        variant: "destructive",
        duration: 4000,
      });
      setIsSaving(false);
      return;
    }

    // Recalculate total price using existing hourly rate and new duration
    const hourlyRate = selectedBooking.total_price / selectedBooking.duration_hours;
    const newTotalPrice = hourlyRate * newDuration;

    const { error } = await supabase
      .from("bookings")
      .update({
        booking_date: format(editDate, "yyyy-MM-dd"),
        start_time: editStartTime,
        end_time: newEndTime,
        duration_hours: newDuration,
        bay_id: editBayId,
        player_count: parseInt(editPlayerCount),
        total_price: newTotalPrice,
        hourly_rate: hourlyRate,
        notes: editNotes || null,
      })
      .eq("id", selectedBooking.id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update booking.",
        variant: "destructive",
        duration: 4000,
      });
    } else {
      toast({
        title: "Booking updated",
        description: "The booking has been updated successfully.",
        duration: 4000,
      });
      setIsEditing(false);
      setSelectedBooking(null);
      fetchBookings();
    }

    setIsSaving(false);
  };

  const openCancelDialog = () => {
    setSendCancellationNotification(true);
    setRefundCustomer(false);
    setShowCancelDialog(true);
  };

  const cancelBooking = async () => {
    if (!selectedBooking) return;
    
    setIsCancelling(true);

    try {
      if (refundCustomer && selectedBooking.stripe_payment_intent_id) {
        // Call refund edge function
        const { data, error } = await supabase.functions.invoke("refund-booking", {
          body: {
            booking_id: selectedBooking.id,
            send_notification: sendCancellationNotification,
          },
        });

        if (error) throw error;

        toast({
          title: "Booking cancelled",
          description: data.refund 
            ? `Booking cancelled and $${(data.refund.amount / 100).toFixed(2)} refunded.`
            : "Booking cancelled successfully.",
          duration: 4000,
        });
      } else {
        // Just cancel without refund
        const { error: updateError } = await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", selectedBooking.id);

        if (updateError) throw updateError;

        // Send notification if requested
        if (sendCancellationNotification) {
          await supabase.functions.invoke("send-booking-notification", {
            body: {
              booking_id: selectedBooking.id,
              notification_type: "cancellation",
            },
          });
        }

        toast({
          title: "Booking cancelled",
          description: sendCancellationNotification 
            ? "Booking cancelled and customer notified."
            : "Booking cancelled successfully.",
          duration: 4000,
        });
      }

      setShowCancelDialog(false);
      setSelectedBooking(null);
      fetchBookings();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel booking.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsCancelling(false);
  };

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-[600px]" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const weekDays = [selectedDate];

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-4">
        {/* Header */}
        <div className="flex flex-col-reverse lg:flex-row lg:items-center lg:justify-between gap-4">
          {/* Controls - Left side */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Stats */}
            <div className="flex items-center gap-4 mr-4">
              <div className="flex items-center gap-1.5 text-sm">
                <Percent className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{calculateOccupancy()}%</span>
                <span className="text-muted-foreground">occupancy</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{getTodayBookingsCount()}</span>
                <span className="text-muted-foreground">bookings</span>
              </div>
            </div>


            {/* Date Navigation */}
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => navigateDate("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="min-w-[140px]">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(selectedDate, "EEE, MMM d")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                        setCalendarOpen(false);
                      }
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Button variant="outline" size="icon" onClick={() => navigateDate("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="outline" size="sm" onClick={() => setSelectedDate(new Date())}>
              Today
            </Button>
          </div>

          {/* Title - Right side */}
          <div className="text-right">
            <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
              Timetable
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Bay bookings and schedule
            </p>
          </div>
        </div>

        {/* Timetable Grid */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="p-6">
                <Skeleton className="h-[500px]" />
              </div>
            ) : (
              <div className="min-w-[800px]" ref={timetableRef}>
                {/* Header Row */}
                <div className="grid border-b border-border" style={{ 
                  gridTemplateColumns: `80px repeat(${bays.length}, 1fr)` 
                }}>
                  <div className="p-3 bg-muted/50 font-medium text-sm text-muted-foreground border-r border-border">
                    Time
                  </div>
                  {bays.map((bay) => (
                    <div key={bay.id} className="p-3 bg-muted/50 font-medium text-sm text-center border-r border-border last:border-r-0">
                      {bay.name}
                    </div>
                  ))}
                </div>

                {/* Time Rows Container with Current Time Indicator */}
                <div className="relative">
                  {/* Current Time Indicator Line */}
                  {isSameDay(selectedDate, new Date()) && getCurrentTimePosition() !== null && (
                    <div 
                      ref={currentTimeIndicatorRef}
                      className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                      style={{ top: getCurrentTimePosition()! }}
                    >
                      <div className="w-2 h-2 rounded-full bg-accent -ml-1" />
                      <div className="flex-1 h-0.5 bg-accent" />
                    </div>
                  )}

                  {/* Time Rows - 30 min increments */}
                  {OPERATING_SLOTS.map((slot, slotIndex) => (
                    <div 
                      key={`${slot.hour}-${slot.minute}`} 
                      className={`grid ${slot.minute === 0 ? 'border-t border-border' : 'border-t border-border/30'}`}
                      style={{ 
                        gridTemplateColumns: `80px repeat(${bays.length}, 1fr)`,
                        height: SLOT_HEIGHT,
                      }}
                    >
                      <div className={`h-full text-[10px] text-muted-foreground border-r border-border flex items-center justify-center ${slot.minute === 0 ? "font-medium" : "text-muted-foreground/60"}`}>
                        {formatSlotTime(slot)}
                      </div>
                      {bays.map((bay) => {
                        const slotBookings = getBookingsForSlot(bay.id, slot);
                        const slotBlocks = getBlocksForSlot(bay.id, slot);
                        const booking = slotBookings[0];
                        const block = slotBlocks[0];
                        const showBooking = booking && isSlotStart(booking, slot);
                        const showBlock = block && isBlockStart(block, slot);
                        const isSlotEmpty = slotBookings.length === 0 && slotBlocks.length === 0;
                        
                        return (
                          <div 
                            key={bay.id} 
                            className={`h-full border-r border-border last:border-r-0 relative ${isSlotEmpty ? "hover:bg-muted/50 cursor-pointer" : ""}`}
                            onClick={() => {
                              if (isSlotEmpty) {
                                openAddBookingDialog(slot, bay.id);
                              }
                            }}
                          >
                            {showBlock && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedBlock(block);
                                }}
                                className="absolute inset-x-0.5 top-0.5 rounded-sm bg-destructive/80 border border-destructive px-1.5 py-0.5 text-left z-10 overflow-hidden hover:bg-destructive/90 cursor-pointer transition-colors"
                                style={{
                                  height: `calc(${getBlockSlotSpan(block) * SLOT_HEIGHT}px - 4px)`,
                                }}
                              >
                                <p className="text-[10px] font-medium text-destructive-foreground truncate leading-tight">
                                  BLOCKED
                                </p>
                                {block.reason && (
                                  <p className="text-[9px] text-destructive-foreground/70 truncate leading-tight">
                                    {block.reason}
                                  </p>
                                )}
                              </button>
                            )}
                            {showBooking && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Allow clicking on both confirmed and pending bookings
                                  setSelectedBooking(booking);
                                }}
                                className={`absolute inset-x-0.5 top-0.5 rounded-sm border px-1.5 py-0.5 text-left transition-colors z-10 overflow-hidden ${
                                  booking.status === 'pending'
                                    ? "bg-amber-500/80 border-amber-600/50 hover:bg-amber-500/90 cursor-pointer"
                                    : "bg-primary border-primary/40 hover:bg-primary/90"
                                }`}
                                style={{
                                  height: `calc(${getBookingSlotSpan(booking) * SLOT_HEIGHT}px - 4px)`,
                                }}
                              >
                                {/* Payment/Status Indicator */}
                                <div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white/30 ${
                                  booking.status === 'pending'
                                    ? "bg-amber-400 animate-pulse"
                                    : isBookingPaid(booking) 
                                      ? "bg-green-400" 
                                      : "bg-red-400"
                                }`} title={booking.status === 'pending' ? "Processing Payment" : isBookingPaid(booking) ? "Paid" : "Unpaid"} />
                                
                                <p className={`text-[10px] font-medium truncate leading-tight pr-4 flex items-center gap-1 ${
                                  booking.status === 'pending' ? "text-white" : "text-primary-foreground"
                                }`}>
                                  {(booking.profile?.total_bookings ?? 0) <= 1 && (
                                    <span
                                      title="First ever booking"
                                      className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold leading-none"
                                    >
                                      1
                                    </span>
                                  )}
                                  {booking.notes?.includes("[COMP]") && (
                                    <span
                                      title="Playing in Wednesday Ambrose Comp"
                                      className="inline-flex shrink-0 items-center justify-center w-3.5 h-3.5 rounded-full bg-accent text-accent-foreground text-[8px] font-bold leading-none ring-1 ring-accent-foreground/30"
                                    >
                                      C
                                    </span>
                                  )}
                                  <span className="truncate">
                                    {booking.status === 'pending' 
                                      ? `${booking.profile?.first_name || 'Processing'} ${booking.profile?.last_name || '...'}` 
                                      : `${booking.profile?.first_name} ${booking.profile?.last_name}`}
                                  </span>
                                </p>
                                <p className={`text-[9px] truncate leading-tight ${
                                  booking.status === 'pending' ? "text-white/70" : "text-primary-foreground/70"
                                }`}>
                                  {booking.status === 'pending' ? 'Payment pending...' : `${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}`}
                                </p>
                                {booking.notes && (
                                  <div className={`absolute bottom-1 right-1 ${booking.status === 'pending' ? "text-white/60" : "text-primary-foreground/60"}`}>
                                    <MessageSquare className="h-2.5 w-2.5" />
                                  </div>
                                )}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Booking Details Dialog */}
        <Dialog open={!!selectedBooking} onOpenChange={(open) => {
          if (!open) {
            setSelectedBooking(null);
            setIsEditing(false);
          }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide flex items-center justify-between">
                {isEditing ? "Edit Booking" : "Booking Details"}
                {isEditing && (
                  <Button variant="ghost" size="icon" onClick={cancelEditing} className="h-8 w-8">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </DialogTitle>
            </DialogHeader>
            
            {selectedBooking && !isEditing && (
              <div className="space-y-4">
                {/* Pending Status Banner */}
                {selectedBooking.status === 'pending' && (
                  <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                    <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                    <div>
                      <p className="text-sm font-medium text-amber-600">Payment Processing</p>
                      <p className="text-xs text-amber-600/70">
                        Customer is completing checkout. This booking will auto-expire in 5 minutes if not completed.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Customer Info */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {selectedBooking.profile?.first_name} {selectedBooking.profile?.last_name}
                      </span>
                    </div>
                    <Badge className={getMembershipColor(selectedBooking.profile?.membership_tier || "")}>
                      {selectedBooking.profile?.membership_tier || "Casual"}
                    </Badge>
                  </div>
                  
                  {selectedBooking.profile?.email && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <a href={`mailto:${selectedBooking.profile.email}`} className="hover:text-primary">
                        {selectedBooking.profile.email}
                      </a>
                    </div>
                  )}
                  
                  {selectedBooking.profile?.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <a href={`tel:${selectedBooking.profile.phone}`} className="hover:text-primary">
                        {selectedBooking.profile.phone}
                      </a>
                    </div>
                  )}
                </div>

                <hr className="border-border" />

                {/* Booking Info */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p className="font-medium">{format(new Date(selectedBooking.booking_date), "EEE, MMM d, yyyy")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Time</p>
                    <p className="font-medium">
                      {formatTime(selectedBooking.start_time)} - {formatTime(selectedBooking.end_time)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Duration</p>
                    <p className="font-medium">{selectedBooking.duration_hours} hour{selectedBooking.duration_hours > 1 ? "s" : ""}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Players</p>
                    <p className="font-medium">{selectedBooking.player_count}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Bay</p>
                    <p className="font-medium">
                      {bays.find(b => b.id === selectedBooking.bay_id)?.name}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-medium">${selectedBooking.total_price}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment</p>
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        isBookingPaid(selectedBooking) ? "bg-green-500" : "bg-red-500"
                      }`} />
                      <p className="font-medium">
                        {isBookingPaid(selectedBooking) ? "Paid" : "Unpaid"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Method</p>
                    <p className="font-medium capitalize">
                      {selectedBooking.payment_method === "card"
                        ? "Card"
                        : selectedBooking.payment_method === "balance"
                        ? "Deposit Balance"
                        : selectedBooking.payment_method === "cash"
                        ? "Cash"
                        : selectedBooking.payment_method === "pending"
                        ? "Pending"
                        : selectedBooking.payment_method || ","}
                    </p>
                  </div>
                </div>

                {/* Notes */}
                {selectedBooking.notes && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-1.5 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Staff Notes</p>
                    </div>
                    <p className="text-sm">{selectedBooking.notes}</p>
                  </div>
                )}

                {/* Referral source (first booking only) */}
                {(selectedBooking.profile?.total_bookings ?? 0) <= 1 && (
                  <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      How did they hear about us?
                    </Label>
                    <Select
                      value={selectedBooking.profile?.referral_source || ""}
                      onValueChange={async (value) => {
                        const { error } = await supabase
                          .from("profiles")
                          .update({ referral_source: value })
                          .eq("user_id", selectedBooking.user_id);
                        if (error) {
                          toast({ title: "Failed to save", description: error.message, variant: "destructive" });
                          return;
                        }
                        setSelectedBooking({
                          ...selectedBooking,
                          profile: { ...selectedBooking.profile!, referral_source: value },
                        });
                        setBookings(prev => prev.map(b => b.user_id === selectedBooking.user_id && b.profile
                          ? { ...b, profile: { ...b.profile, referral_source: value } }
                          : b));
                        toast({ title: "Saved", description: "Referral source recorded." });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="word_of_mouth">Word of mouth</SelectItem>
                        <SelectItem value="social_media">Social media</SelectItem>
                        <SelectItem value="google_search">Google search</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <hr className="border-border" />

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => {
                        setSelectedBooking(null);
                        navigate(`/admin/customers?user=${selectedBooking.user_id}`);
                      }}
                    >
                      View Customer
                    </Button>
                    <Button 
                      className="flex-1 bg-primary hover:bg-primary/90"
                      onClick={startEditing}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Edit Booking
                    </Button>
                  </div>
                  {/* Send to POS button for unpaid bookings */}
                  {!isBookingPaid(selectedBooking) && (
                    <Button 
                      variant="outline" 
                      className="w-full"
                      onClick={() => {
                        // Navigate to POS with booking data
                        const duration = selectedBooking.duration_hours;
                        const bookingData = {
                          bookingId: selectedBooking.id,
                          customerId: selectedBooking.user_id,
                          duration: duration,
                          customerName: `${selectedBooking.profile?.first_name || ''} ${selectedBooking.profile?.last_name || ''}`.trim(),
                          totalPrice: selectedBooking.total_price,
                          bayName: bays.find(b => b.id === selectedBooking.bay_id)?.name || '',
                          bookingDate: selectedBooking.booking_date,
                          startTime: selectedBooking.start_time,
                        };
                        setSelectedBooking(null);
                        navigate('/admin/pos', { state: { bookingData } });
                      }}
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Send to POS
                    </Button>
                  )}
                  {isCompEligible && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={toggleCompTag}
                      disabled={togglingComp}
                    >
                      <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-accent text-accent-foreground text-[9px] font-bold mr-2">
                        C
                      </span>
                      {selectedBooking.notes?.includes("[COMP]")
                        ? `Remove from Wednesday Ambrose`
                        : `Add to Wednesday Ambrose`}

                    </Button>
                  )}
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={openCancelDialog}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Cancel Booking
                  </Button>
                </div>
              </div>
            )}

            {/* Edit Form */}
            {selectedBooking && isEditing && (
              <div className="space-y-4">
                {/* Customer Info (read-only) */}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">
                      {selectedBooking.profile?.first_name} {selectedBooking.profile?.last_name}
                    </span>
                  </div>
                  <Badge className={getMembershipColor(selectedBooking.profile?.membership_tier || "")}>
                    {selectedBooking.profile?.membership_tier || "Casual"}
                  </Badge>
                </div>

                {/* Edit Fields */}
                <div className="space-y-4">
                  {/* Date */}
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Popover open={editCalendarOpen} onOpenChange={setEditCalendarOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left">
                          <CalendarIcon className="h-4 w-4 mr-2" />
                          {editDate ? format(editDate, "EEE, MMM d, yyyy") : "Select date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={editDate}
                          onSelect={(date) => {
                            setEditDate(date);
                            setEditCalendarOpen(false);
                          }}
                          className="pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Start Time */}
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <Select value={editStartTime} onValueChange={setEditStartTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select time" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Duration */}
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select value={editDuration} onValueChange={setEditDuration}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select duration" />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Bay */}
                  <div className="space-y-2">
                    <Label>Bay</Label>
                    <Select value={editBayId} onValueChange={setEditBayId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bay" />
                      </SelectTrigger>
                      <SelectContent>
                        {bays.map((bay) => (
                          <SelectItem key={bay.id} value={bay.id}>
                            {bay.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Player Count */}
                  <div className="space-y-2">
                    <Label>Players</Label>
                    <Select value={editPlayerCount} onValueChange={setEditPlayerCount}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select players" />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAYER_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label>Staff Notes</Label>
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Add notes for staff (e.g. birthday party, lesson, etc.)"
                      className="min-h-[60px] text-sm"
                    />
                  </div>
                </div>

                {/* Save/Cancel Actions */}
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    className="flex-1"
                    onClick={cancelEditing}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button 
                    className="flex-1 bg-primary hover:bg-primary/90"
                    onClick={saveBookingChanges}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Cancel Booking Confirmation Dialog */}
        <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to cancel this booking for{" "}
                <span className="font-medium">
                  {selectedBooking?.profile?.first_name} {selectedBooking?.profile?.last_name}
                </span>
                ? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="send-notification" 
                  checked={sendCancellationNotification}
                  onCheckedChange={(checked) => setSendCancellationNotification(checked === true)}
                />
                <label 
                  htmlFor="send-notification" 
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Send customer cancellation notification
                </label>
              </div>
              
              <div className="flex items-center space-x-3">
                <Checkbox 
                  id="refund-customer" 
                  checked={refundCustomer}
                  onCheckedChange={(checked) => setRefundCustomer(checked === true)}
                  disabled={!selectedBooking?.stripe_payment_intent_id}
                />
                <label 
                  htmlFor="refund-customer" 
                  className={`text-sm font-medium leading-none cursor-pointer ${
                    !selectedBooking?.stripe_payment_intent_id ? "text-muted-foreground" : ""
                  }`}
                >
                  Refund customer
                  {!selectedBooking?.stripe_payment_intent_id && (
                    <span className="text-xs text-muted-foreground ml-2">(No payment on file)</span>
                  )}
                </label>
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel disabled={isCancelling}>
                Keep Booking
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={cancelBooking}
                disabled={isCancelling}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {isCancelling ? "Cancelling..." : "Cancel Booking"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Block Details Dialog */}
        <Dialog open={!!selectedBlock} onOpenChange={(open) => {
          if (!open) setSelectedBlock(null);
        }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display text-xl uppercase tracking-wide">
                Bay Block
              </DialogTitle>
            </DialogHeader>
            {selectedBlock && (
              <div className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatTime(selectedBlock.start_time)}, {formatTime(selectedBlock.end_time)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{format(new Date(selectedBlock.block_date), "EEE, MMM d yyyy")}</span>
                  </div>
                  {selectedBlock.reason && (
                    <div className="flex items-start gap-2 text-sm">
                      <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <span>{selectedBlock.reason}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Bay:</span>
                    <span>{bays.find(b => b.id === selectedBlock.bay_id)?.name || 'Unknown'}</span>
                  </div>
                </div>

                <hr className="border-border" />

                <Button
                  variant="destructive"
                  className="w-full"
                  onClick={async () => {
                    const { error } = await supabase
                      .from("bay_blocks")
                      .delete()
                      .eq("id", selectedBlock.id);

                    if (error) {
                      toast({
                        title: "Error",
                        description: "Failed to remove block.",
                        variant: "destructive",
                        duration: 4000,
                      });
                    } else {
                      toast({
                        title: "Block removed",
                        description: "The bay block has been removed.",
                        duration: 4000,
                      });
                      setSelectedBlock(null);
                      fetchBookings();
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove Block
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Booking Dialog */}
        <AddBookingDialog
          open={showAddBookingDialog}
          onOpenChange={setShowAddBookingDialog}
          bays={bays}
          initialDate={selectedDate}
          initialTime={addBookingInitialTime}
          initialBayId={addBookingInitialBayId}
          onBookingCreated={fetchBookings}
        />
      </div>
    </AdminLayout>
  );
}
