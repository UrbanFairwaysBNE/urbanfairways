import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarIcon, Plus, UserPlus, Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calculateHourlyRate, isOffPeakTime, getPricingLabel } from "@/lib/pricing-utils";
import { TierConfig, TIER_SELECT, findTier, isDefaultTier, normaliseTier, tierLabel } from "@/lib/tier-config";

interface Bay {
  id: string;
  name: string;
  bay_number: number;
}

interface Profile {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  custom_hourly_rate: number | null;
  custom_segment: string | null;
}

interface AddBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bays: Bay[];
  initialDate?: Date;
  initialTime?: string;
  initialBayId?: string;
  onBookingCreated: () => void;
}

// Operating hours time options
const TIME_OPTIONS: { value: string; label: string }[] = [];
for (let hour = 5; hour < 23; hour++) {
  for (const minute of [0, 30]) {
    if (hour === 22 && minute === 30) continue; // Can't start at 10:30pm
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    const minStr = minute === 0 ? "" : ":30";
    TIME_OPTIONS.push({ value: timeStr, label: `${displayHour}${minStr}${ampm}` });
  }
}

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

export function AddBookingDialog({
  open,
  onOpenChange,
  bays,
  initialDate,
  initialTime,
  initialBayId,
  onBookingCreated,
}: AddBookingDialogProps) {
  const { toast } = useToast();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<"booking" | "block">("booking");
  
  // Form state
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [bookingDate, setBookingDate] = useState<Date | undefined>(initialDate);
  const [startTime, setStartTime] = useState(initialTime || "");
  const [duration, setDuration] = useState("1");
  const [bayId, setBayId] = useState(initialBayId || "");
  const [playerCount, setPlayerCount] = useState("1");
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Block form state
  const [blockReason, setBlockReason] = useState("");
  const [blockCalendarOpen, setBlockCalendarOpen] = useState(false);
  
  // Customer search and list
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  
  // New customer mode
  const [isAddingNewCustomer, setIsAddingNewCustomer] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  // Pricing from database
  const [tierRates, setTierRates] = useState<TierConfig[]>([]);

  // Selected customer details
  const selectedCustomer = customers.find(c => c.user_id === selectedCustomerId);

  // Fetch pricing on mount
  useEffect(() => {
    const fetchPricing = async () => {
      const { data, error } = await supabase
        .from("pricing_config")
        .select(TIER_SELECT)
        .order("display_order");

      if (!error && data) {
        setTierRates((data as Record<string, unknown>[]).map(normaliseTier));
      }
    };
    fetchPricing();
  }, []);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setActiveTab("booking");
      setBookingDate(initialDate || new Date());
      setStartTime(initialTime || "");
      setBayId(initialBayId || "");
      setDuration("1");
      setPlayerCount("1");
      setSelectedCustomerId("");
      setCustomerSearch("");
      setCustomers([]);
      setIsAddingNewCustomer(false);
      setBlockReason("");
      resetNewCustomerForm();
    }
  }, [open, initialDate, initialTime, initialBayId]);

  const resetNewCustomerForm = () => {
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");
  };

  const fetchCustomers = async (search?: string) => {
    // Only fetch if there's a search term of at least 2 characters
    if (!search || search.trim().length < 2) {
      setCustomers([]);
      setIsLoadingCustomers(false);
      return;
    }

    setIsLoadingCustomers(true);

    // Split into tokens so multi-word queries like "Paul Gale" match
    // first name in one column and last name in another.
    const tokens = search.trim().toLowerCase().split(/\s+/).filter(Boolean);

    let query = supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email, phone, membership_tier, custom_hourly_rate, custom_segment");

    // Each token must match somewhere (first_name, last_name, email, or phone)
    for (const token of tokens) {
      const safe = token.replace(/[%,()]/g, "");
      query = query.or(
        `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`
      );
    }

    const { data, error } = await query.order("first_name").limit(50);

    if (!error && data) {
      // Rank: prefer matches where the joined "first last" contains the full query
      const fullQuery = tokens.join(" ");
      const ranked = [...data].sort((a, b) => {
        const aFull = `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase();
        const bFull = `${b.first_name || ""} ${b.last_name || ""}`.toLowerCase();
        const aHit = aFull.includes(fullQuery) ? 0 : 1;
        const bHit = bFull.includes(fullQuery) ? 0 : 1;
        return aHit - bHit;
      });
      setCustomers(ranked.slice(0, 25));
    }

    setIsLoadingCustomers(false);
  };

  const handleCustomerSearch = (value: string) => {
    setCustomerSearch(value);
    if (value.length >= 2) {
      fetchCustomers(value);
    } else {
      setCustomers([]);
    }
  };

  const calculateEndTime = (start: string, hours: number): string => {
    const [hour, min] = start.split(":").map(Number);
    const endHour = hour + hours;
    return `${endHour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
  };

  // Calculate hourly rate considering custom rate, peak/off-peak, and membership tier
  const getCalculatedHourlyRate = (): number => {
    if (!selectedCustomer || !bookingDate || !startTime) return 0;
    
    // Custom rate always takes priority
    if (selectedCustomer.custom_hourly_rate !== null) {
      return Number(selectedCustomer.custom_hourly_rate);
    }
    
    // Use the pricing-utils function for tier-based + peak/off-peak calculation
    return calculateHourlyRate(
      selectedCustomer.membership_tier,
      bookingDate,
      startTime,
      tierRates,
      { segment: selectedCustomer.custom_segment }
    );
  };

  const calculateTotalPrice = (): number => {
    if (!selectedCustomer) return 0;
    const hourlyRate = getCalculatedHourlyRate();
    return hourlyRate * parseInt(duration);
  };

  // Get pricing context info for display
  const getPricingInfo = (): { label: string; isRestricted: boolean } | null => {
    if (!selectedCustomer || !bookingDate || !startTime) return null;
    
    const tierKey = selectedCustomer.membership_tier;
    const config = findTier(tierRates, tierKey);
    const label = tierLabel(tierRates, tierKey) || tierKey;

    // Custom rate - no peak/off-peak applies
    if (selectedCustomer.custom_hourly_rate !== null) {
      return { label: "custom rate", isRestricted: false };
    }

    // Off-peak-only tiers lose their member rate during peak
    if (config?.restricted_to_off_peak) {
      if (!isOffPeakTime(bookingDate, startTime)) {
        return { label: "walk-in rate (outside off-peak hours)", isRestricted: true };
      }
      return { label: `${label} rate`, isRestricted: false };
    }

    // Walk-in tier has peak/off-peak
    if (isDefaultTier(tierRates, tierKey)) {
      return { label: getPricingLabel(bookingDate, startTime), isRestricted: false };
    }

    return { label: `${label} rate`, isRestricted: false };
  };

  const getMembershipColor = (tier: string) => {
    return isDefaultTier(tierRates, tier)
      ? "bg-muted text-muted-foreground"
      : "bg-accent/10 text-accent border-accent/20";
  };

  const createNewCustomer = async () => {
    if (!newFirstName || !newLastName || !newEmail) {
      toast({
        title: "Missing information",
        description: "Please fill in first name, last name, and email.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsCreatingCustomer(true);

    try {
      // Use edge function to create customer (doesn't affect admin's session)
      const { data, error } = await supabase.functions.invoke("create-customer", {
        body: {
          email: newEmail,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone || undefined,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Wait a moment for the profile trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Refresh customer list and select the new customer
      await fetchCustomers();
      setSelectedCustomerId(data.user.id);
      setIsAddingNewCustomer(false);
      resetNewCustomerForm();
      
      toast({
        title: "Customer created",
        description: `${newFirstName} ${newLastName} has been added.`,
        duration: 4000,
      });
    } catch (error: any) {
      toast({
        title: "Error creating customer",
        description: error.message || "Failed to create customer.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsCreatingCustomer(false);
  };

  // Check for overlapping bookings or blocks
  const checkForOverlaps = async (date: string, bay: string, start: string, end: string): Promise<{ hasOverlap: boolean; message: string }> => {
    // Check existing bookings
    const { data: existingBookings, error: bookingError } = await supabase
      .from("bookings")
      .select("id, start_time, end_time")
      .eq("bay_id", bay)
      .eq("booking_date", date)
      .eq("status", "confirmed");

    if (bookingError) {
      console.error("Error checking bookings:", bookingError);
      return { hasOverlap: false, message: "" };
    }

    // Check existing blocks
    const { data: existingBlocks, error: blockError } = await supabase
      .from("bay_blocks")
      .select("id, start_time, end_time")
      .eq("bay_id", bay)
      .eq("block_date", date);

    if (blockError) {
      console.error("Error checking blocks:", blockError);
      return { hasOverlap: false, message: "" };
    }

    // Helper to check if two time ranges overlap
    const timeToMinutes = (time: string) => {
      const [h, m] = time.split(":").map(Number);
      return h * 60 + m;
    };

    const newStart = timeToMinutes(start);
    const newEnd = timeToMinutes(end);

    // Check bookings for overlap
    for (const booking of existingBookings || []) {
      const existingStart = timeToMinutes(booking.start_time);
      const existingEnd = timeToMinutes(booking.end_time);
      
      // Overlap exists if: newStart < existingEnd AND newEnd > existingStart
      if (newStart < existingEnd && newEnd > existingStart) {
        const formatTime = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          const displayHour = h % 12 || 12;
          return `${displayHour}:${m.toString().padStart(2, "0")}${ampm}`;
        };
        return { 
          hasOverlap: true, 
          message: `This time overlaps with an existing booking (${formatTime(booking.start_time)} - ${formatTime(booking.end_time)}).` 
        };
      }
    }

    // Check blocks for overlap
    for (const block of existingBlocks || []) {
      const existingStart = timeToMinutes(block.start_time);
      const existingEnd = timeToMinutes(block.end_time);
      
      if (newStart < existingEnd && newEnd > existingStart) {
        const formatTime = (t: string) => {
          const [h, m] = t.split(":").map(Number);
          const ampm = h >= 12 ? "PM" : "AM";
          const displayHour = h % 12 || 12;
          return `${displayHour}:${m.toString().padStart(2, "0")}${ampm}`;
        };
        return { 
          hasOverlap: true, 
          message: `This time overlaps with a bay block (${formatTime(block.start_time)} - ${formatTime(block.end_time)}).` 
        };
      }
    }

    return { hasOverlap: false, message: "" };
  };

  const createBooking = async () => {
    if (!selectedCustomerId || !bookingDate || !startTime || !bayId) {
      toast({
        title: "Missing information",
        description: "Please select a customer, date, time, and bay.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    const endTime = calculateEndTime(startTime, parseInt(duration));
    const endHour = parseInt(endTime.split(":")[0]);
    
    if (endHour > 23) {
      toast({
        title: "Invalid time",
        description: "Booking cannot extend past 11pm.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSaving(true);

    // Check for overlapping bookings or blocks
    const dateStr = format(bookingDate, "yyyy-MM-dd");
    const { hasOverlap, message } = await checkForOverlaps(dateStr, bayId, startTime, endTime);
    
    if (hasOverlap) {
      toast({
        title: "Time slot not available",
        description: message,
        variant: "destructive",
        duration: 4000,
      });
      setIsSaving(false);
      return;
    }

    try {
      const hourlyRate = getCalculatedHourlyRate();
      const totalPrice = hourlyRate * parseInt(duration);

      const { data: booking, error } = await supabase
        .from("bookings")
        .insert({
          user_id: selectedCustomerId,
          bay_id: bayId,
          booking_date: format(bookingDate, "yyyy-MM-dd"),
          start_time: startTime,
          end_time: endTime,
          duration_hours: parseInt(duration),
          player_count: parseInt(playerCount),
          hourly_rate: hourlyRate,
          total_price: totalPrice,
          status: "confirmed",
          payment_method: "pending", // Unpaid by default for admin-created bookings
        })
        .select()
        .single();

      if (error) throw error;

      // Send booking notification
      try {
        await supabase.functions.invoke("send-booking-notification", {
          body: {
            booking_id: booking.id,
            notification_type: "confirmation",
          },
        });
      } catch (notifyError) {
        console.error("Failed to send notification:", notifyError);
        // Don't fail the booking if notification fails
      }

      toast({
        title: "Booking created",
        description: `Booking created for ${selectedCustomer?.first_name} ${selectedCustomer?.last_name} and notification sent.`,
        duration: 4000,
      });

      onOpenChange(false);
      onBookingCreated();
    } catch (error: any) {
      toast({
        title: "Error creating booking",
        description: error.message || "Failed to create booking.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSaving(false);
  };

  const createBlock = async () => {
    if (!bookingDate || !startTime || !bayId) {
      toast({
        title: "Missing information",
        description: "Please select a date, time, and bay.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    const endTime = calculateEndTime(startTime, parseInt(duration));
    const endHour = parseInt(endTime.split(":")[0]);
    
    if (endHour > 23) {
      toast({
        title: "Invalid time",
        description: "Block cannot extend past 11pm.",
        variant: "destructive",
        duration: 4000,
      });
      return;
    }

    setIsSaving(true);

    // Check for overlapping bookings or blocks
    const dateStr = format(bookingDate, "yyyy-MM-dd");
    const { hasOverlap, message } = await checkForOverlaps(dateStr, bayId, startTime, endTime);
    
    if (hasOverlap) {
      toast({
        title: "Time slot not available",
        description: message,
        variant: "destructive",
        duration: 4000,
      });
      setIsSaving(false);
      return;
    }

    try {
      const { error } = await supabase
        .from("bay_blocks")
        .insert({
          bay_id: bayId,
          block_date: format(bookingDate, "yyyy-MM-dd"),
          start_time: startTime,
          end_time: endTime,
          reason: blockReason || null,
        });

      if (error) throw error;

      toast({
        title: "Bay blocked",
        description: `Bay blocked for ${duration} hour${parseInt(duration) > 1 ? "s" : ""}.`,
        duration: 4000,
      });

      onOpenChange(false);
      onBookingCreated();
    } catch (error: any) {
      toast({
        title: "Error creating block",
        description: error.message || "Failed to block bay.",
        variant: "destructive",
        duration: 4000,
      });
    }

    setIsSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wide">
            Add to Timetable
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "booking" | "block")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="booking" className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Booking
            </TabsTrigger>
            <TabsTrigger value="block" className="flex items-center gap-2">
              <Ban className="h-4 w-4" />
              Block
            </TabsTrigger>
          </TabsList>

          <TabsContent value="booking" className="space-y-4 mt-4">
            {/* Customer Selection */}
            {!isAddingNewCustomer ? (
              <div className="space-y-2">
                <Label>Customer</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Search by name or email..."
                    value={customerSearch}
                    onChange={(e) => handleCustomerSearch(e.target.value)}
                  />
                  
                  {customerSearch.length >= 2 && (
                    <div className="max-h-40 overflow-y-auto border rounded-md">
                      {isLoadingCustomers ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">Searching...</div>
                      ) : customers.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground text-center">No customers found</div>
                      ) : (
                      customers.map((customer) => (
                        <button
                          key={customer.user_id}
                          onClick={() => setSelectedCustomerId(customer.user_id)}
                          className={`w-full p-2 text-left text-sm hover:bg-muted/50 flex items-center justify-between border-b last:border-b-0 ${
                            selectedCustomerId === customer.user_id ? "bg-primary/10" : ""
                          }`}
                        >
                          <div>
                            <span className="font-medium">{customer.first_name} {customer.last_name}</span>
                            <span className="text-muted-foreground ml-2">{customer.email}</span>
                          </div>
                          <Badge className={`text-[10px] ${getMembershipColor(customer.membership_tier)}`}>
                            {tierLabel(tierRates, customer.membership_tier) || customer.membership_tier}
                          </Badge>
                        </button>
                        ))
                      )}
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setIsAddingNewCustomer(true)}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add New Customer
                  </Button>
                </div>

                {selectedCustomer && (
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">
                        {selectedCustomer.first_name} {selectedCustomer.last_name}
                      </span>
                      <Badge className={getMembershipColor(selectedCustomer.membership_tier)}>
                        {tierLabel(tierRates, selectedCustomer.membership_tier) || selectedCustomer.membership_tier} - ${getCalculatedHourlyRate()}/hr
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">New Customer</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsAddingNewCustomer(false);
                      resetNewCustomerForm();
                    }}
                  >
                    Cancel
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">First Name *</Label>
                    <Input
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Last Name *</Label>
                    <Input
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </div>
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Email *</Label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@example.com"
                  />
                </div>
                
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Phone number"
                  />
                </div>
                
                <Button
                  type="button"
                  className="w-full"
                  onClick={createNewCustomer}
                  disabled={isCreatingCustomer}
                >
                  {isCreatingCustomer ? "Creating..." : "Create Customer"}
                </Button>
              </div>
            )}

            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {bookingDate ? format(bookingDate, "EEE, MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookingDate}
                    onSelect={(date) => {
                      setBookingDate(date);
                      setCalendarOpen(false);
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
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
              <Select value={duration} onValueChange={setDuration}>
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
              <Select value={bayId} onValueChange={setBayId}>
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
              <Select value={playerCount} onValueChange={setPlayerCount}>
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

            {/* Price Summary */}
            {selectedCustomer && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="text-muted-foreground">
                      {duration} hour{parseInt(duration) > 1 ? "s" : ""} @ ${getCalculatedHourlyRate()}/hr
                    </span>
                    {getPricingInfo() && (
                      <span className={`text-xs ${getPricingInfo()?.isRestricted ? 'text-orange-500' : 'text-muted-foreground'}`}>
                        ({getPricingInfo()?.label})
                      </span>
                    )}
                  </div>
                  <span className="font-bold text-lg">${calculateTotalPrice()}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Payment will be collected separately
                </p>
              </div>
            )}

            <hr className="border-border" />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary hover:bg-primary/90"
                onClick={createBooking}
                disabled={isSaving || !selectedCustomerId || isAddingNewCustomer}
              >
                <Plus className="h-4 w-4 mr-2" />
                {isSaving ? "Creating..." : "Create Booking"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="block" className="space-y-4 mt-4">
            {/* Date */}
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover open={blockCalendarOpen} onOpenChange={setBlockCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {bookingDate ? format(bookingDate, "EEE, MMM d, yyyy") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={bookingDate}
                    onSelect={(date) => {
                      setBookingDate(date);
                      setBlockCalendarOpen(false);
                    }}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Start Time */}
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Select value={startTime} onValueChange={setStartTime}>
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
              <Select value={duration} onValueChange={setDuration}>
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
              <Select value={bayId} onValueChange={setBayId}>
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

            {/* Reason */}
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder="e.g. Maintenance, Private event, etc."
                rows={2}
              />
            </div>

            <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive">
                This will block the bay and prevent any bookings during this time.
              </p>
            </div>

            <hr className="border-border" />

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-destructive hover:bg-destructive/90"
                onClick={createBlock}
                disabled={isSaving}
              >
                <Ban className="h-4 w-4 mr-2" />
                {isSaving ? "Blocking..." : "Block Bay"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
