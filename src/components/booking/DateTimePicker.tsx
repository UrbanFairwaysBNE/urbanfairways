import { useState, useEffect, useMemo } from "react";
import { useOperatingHours } from "@/hooks/useOperatingHours";
import { format, isToday } from "date-fns";
import { CalendarIcon, Clock, Trophy, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// Weekly comp window is admin-configured in Local Comp settings (Brisbane time).
// Customers selecting a slot in this window are prompted to confirm comp entry.
const COMP_LOCKED_PLAYERS = 2;

interface DateTimePickerProps {
  selectedDate: Date | undefined;
  selectedTime: string | undefined;
  selectedDuration: number;
  /** Session lengths in hours; defaults to 1–4 when not supplied. */
  durations?: number[];

  selectedPlayers: number;
  onDateChange: (date: Date | undefined) => void;
  onTimeChange: (time: string) => void;
  onDurationChange: (duration: number) => void;
  onPlayersChange: (players: number) => void;
  onCompChange?: (playingComp: boolean) => void;
}

const OPENING_HOUR = 5;  // 5am
const CLOSING_HOUR = 23; // 11pm

// Generate time slots from 5am to 11pm in 30-min increments
const generateTimeSlots = () => {
  const slots: string[] = [];
  for (let hour = OPENING_HOUR; hour <= CLOSING_HOUR; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < CLOSING_HOUR) {
      slots.push(`${hour.toString().padStart(2, "0")}:30`);
    }
  }
  return slots;
};

const TIME_SLOTS = generateTimeSlots();
const DURATIONS = [1, 2, 3, 4];
const PLAYERS = [1, 2, 3, 4];

/** "1 hour", "1.5 hours" → "1 hr 30 min" style labels for fractional sessions. */
export const formatDurationLabel = (hours: number): string => {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (m === 0) return `${h} ${h === 1 ? "hour" : "hours"}`;
  if (h === 0) return `${m} minutes`;
  return `${h} hr ${m} min`;
};


// Get the next available time slot (rounded up to nearest 30 min)
const getNextAvailableTimeSlot = (): string => {
  const now = new Date();
  let hour = now.getHours();
  let minute = now.getMinutes();

  // Round up to next 30-min slot
  if (minute > 30) {
    hour += 1;
    minute = 0;
  } else if (minute > 0) {
    minute = 30;
  }

  // If before opening, return opening time
  if (hour < OPENING_HOUR) {
    return `${OPENING_HOUR.toString().padStart(2, "0")}:00`;
  }

  // If past closing, return opening time (for next day logic)
  if (hour >= CLOSING_HOUR) {
    return `${OPENING_HOUR.toString().padStart(2, "0")}:00`;
  }

  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
};

export function DateTimePicker({
  selectedDate,
  selectedTime,
  selectedDuration,
  durations = DURATIONS,

  selectedPlayers,
  onDateChange,
  onTimeChange,
  onDurationChange,
  onPlayersChange,
  onCompChange,
}: DateTimePickerProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [compPromptOpen, setCompPromptOpen] = useState(false);
  const [compLocked, setCompLocked] = useState(false);
  const [pendingCompTime, setPendingCompTime] = useState<string | null>(null);
  const { getForDate } = useOperatingHours();

  // Per-date operating window
  const dayHours = useMemo(
    () => (selectedDate ? getForDate(selectedDate) : null),
    [selectedDate, getForDate]
  );

  // Set default time when date changes
  useEffect(() => {
    if (selectedDate) {
      if (isToday(selectedDate)) {
        const nextSlot = getNextAvailableTimeSlot();
        onTimeChange(nextSlot);
      } else {
        // Future date - default to opening time
        onTimeChange(`${OPENING_HOUR.toString().padStart(2, "0")}:00`);
      }
    }
    // Reset comp lock when date changes
    setCompLocked(false);
    onCompChange?.(false);
  }, [selectedDate]);

  const handleDateSelect = (date: Date | undefined) => {
    onDateChange(date);
    setCalendarOpen(false);
  };

  // Intercept time changes to prompt for Wednesday comp night
  const handleTimeSelect = (time: string) => {
    if (!compLocked && isInCompWindow(selectedDate, time)) {
      setPendingCompTime(time);
      setCompPromptOpen(true);
      return;
    }
    onTimeChange(time);
  };

  const handleCompYes = () => {
    setCompLocked(true);
    onCompChange?.(true);
    setCompPromptOpen(false);
    // Keep the user's chosen 5,7pm tee-off time, lock duration + players
    if (pendingCompTime) onTimeChange(pendingCompTime);
    setPendingCompTime(null);
    onDurationChange(COMP_LOCKED_DURATION);
    onPlayersChange(COMP_LOCKED_PLAYERS);
  };

  const handleCompNo = () => {
    setCompPromptOpen(false);
    onCompChange?.(false);
    if (pendingCompTime) onTimeChange(pendingCompTime);
    setPendingCompTime(null);
  };

  // Filter out time slots that would extend past closing or are in the past for today
  const getAvailableTimeSlots = () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // Use per-day operating hours if available, else fall back to global range
    const dayOpenMin = dayHours && dayHours.is_open
      ? parseInt(dayHours.open_time.split(":")[0], 10) * 60 +
        parseInt(dayHours.open_time.split(":")[1], 10)
      : OPENING_HOUR * 60;
    const dayCloseMin = dayHours && dayHours.is_open
      ? parseInt(dayHours.close_time.split(":")[0], 10) * 60 +
        parseInt(dayHours.close_time.split(":")[1], 10)
      : CLOSING_HOUR * 60;

    // Closed day → no slots
    if (dayHours && !dayHours.is_open) return [];

    return TIME_SLOTS.filter((time) => {
      const hour = parseInt(time.split(":")[0]);
      const minute = parseInt(time.split(":")[1]);
      const startMinutes = hour * 60 + minute;
      const endMinutes = startMinutes + (selectedDuration * 60);

      // Must be within operating hours
      if (startMinutes < dayOpenMin) return false;
      if (endMinutes > dayCloseMin) return false;

      // When comp-locked, only show 5:00,7:00pm tee-off slots
      if (compLocked) {
        if (startMinutes < COMP_START_MIN || startMinutes > COMP_END_MIN) return false;
      }

      // If today, filter out past times
      if (selectedDate && isToday(selectedDate)) {
        const nowMinutes = currentHour * 60 + currentMinute;
        if (startMinutes <= nowMinutes) return false;
      }

      return true;
    });
  };

  const formatTimeDisplay = (time: string) => {
    const hour = parseInt(time.split(":")[0]);
    const minute = time.split(":")[1];
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minute} ${ampm}`;
  };

  return (
    <div className="space-y-4">
      {/* Date Picker */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Select Date</label>
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-popover" align="start">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* Comp lock badge */}
      {compLocked && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
            <Trophy className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <p className="font-medium text-foreground">Wednesday Ambrose Comp</p>
              <p className="text-xs text-muted-foreground">Tee off 5pm, 8pm • 2 hours • 2 players</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setCompLocked(false); onCompChange?.(false); }}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
          <Link
            to="/comp"
            className="flex items-center justify-between gap-2 rounded-md border border-accent/40 bg-accent/10 p-3 text-sm transition-colors hover:bg-accent/20"
          >
            <div className="flex-1">
              <p className="font-medium text-foreground">Don't forget to register your team</p>
              <p className="text-xs text-muted-foreground">Only register once, your team carries over to every week's comp</p>
            </div>
            <ArrowRight className="h-4 w-4 text-accent-foreground shrink-0" />
          </Link>
        </div>
      )}

      {/* Time Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Start Time</label>
        <Select value={selectedTime} onValueChange={handleTimeSelect}>
          <SelectTrigger className="w-full">
            <Clock className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Select time" />
          </SelectTrigger>
          <SelectContent className="bg-popover max-h-60">
            {getAvailableTimeSlots().map((time) => (
              <SelectItem key={time} value={time}>
                {formatTimeDisplay(time)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Duration Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Duration</label>
        <Select
          value={selectedDuration.toString()}
          onValueChange={(value) => onDurationChange(parseFloat(value))}
          disabled={compLocked}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select duration" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {durations.map((duration) => (
              <SelectItem key={duration} value={duration.toString()}>
                {formatDurationLabel(duration)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {/* Players Selector */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Number of Players</label>
        <Select
          value={selectedPlayers.toString()}
          onValueChange={(value) => onPlayersChange(parseInt(value))}
          disabled={compLocked}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select players" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {PLAYERS.map((count) => (
              <SelectItem key={count} value={count.toString()}>
                {count} {count === 1 ? "player" : "players"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Wednesday Ambrose Comp prompt */}
      <AlertDialog open={compPromptOpen} onOpenChange={setCompPromptOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Playing in the Wednesday Ambrose Comp?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Our weekly 2-Man Ambrose comp tees off Wednesdays from 5pm, 8pm.
              You can tee off at your chosen time, we'll lock your booking to
              a 2-hour session for 2 players.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCompNo}>No, just a session</AlertDialogCancel>
            <AlertDialogAction onClick={handleCompYes}>Yes, I'm in the comp</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
