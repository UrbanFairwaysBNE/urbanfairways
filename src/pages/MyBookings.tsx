import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Calendar, Clock, MapPin, X, RefreshCw, Plus, GraduationCap } from "lucide-react";
import { format, parseISO, isPast, isToday } from "date-fns";
import { toast } from "sonner";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RescheduleDialog } from "@/components/booking/RescheduleDialog";
import { ExtendDialog } from "@/components/booking/ExtendDialog";
import { AuthForm } from "@/components/auth/AuthForm";

interface Booking {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: number;
  hourly_rate: number;
  status: string;
  bay_id: string;
  bay_name?: string;
  bay_number?: number;
  payment_method?: string;
  stripe_payment_intent_id?: string;
  booking_type?: string | null;
  client_user_id?: string | null;
  user_id?: string;
  /** True when this is a coaching lesson booked FOR the signed-in user by their coach */
  isLessonAsClient?: boolean;
  coach_name?: string;
  /** True when this booking was created by the signed-in coach for a client */
  isCoachBooking?: boolean;
  client_name?: string;
}


const MyBookings = () => {
  const { tenant } = useTenant();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [extendBooking, setExtendBooking] = useState<Booking | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Note: do NOT redirect unauthenticated users away — we need to preserve the
  // URL (including ?extend=<id>) so that after they sign in inline, the extend
  // deep-link effect below can auto-open the ExtendDialog.


  useEffect(() => {
    if (user) {
      fetchBookings();
    } else if (!authLoading) {
      // Not signed in — stop showing the loading spinner so the inline
      // sign-in form (and the extend deep-link) can render.
      setIsLoading(false);
    }
  }, [user, authLoading]);

  // Deep-link: /my-bookings?extend=<booking_id> auto-opens the extend dialog
  useEffect(() => {
    const targetId = searchParams.get("extend");
    if (!targetId || bookings.length === 0) return;
    const target = bookings.find((b) => b.id === targetId);
    if (target && !target.isLessonAsClient) {
      setExtendBooking(target);

      // Clear the param so it doesn't re-trigger on state changes
      const next = new URLSearchParams(searchParams);
      next.delete("extend");
      setSearchParams(next, { replace: true });
    }
  }, [bookings, searchParams, setSearchParams]);

  const fetchBookings = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id,
          user_id,
          booking_date,
          start_time,
          end_time,
          duration_hours,
          total_price,
          hourly_rate,
          status,
          bay_id,
          payment_method,
          stripe_payment_intent_id,
          booking_type,
          client_user_id,
          bays (name, bay_number)
        `)
        // Own bookings, plus coaching lessons a coach booked for this user
        .or(`user_id.eq.${user.id},client_user_id.eq.${user.id}`)
        .order("booking_date", { ascending: true })
        .order("start_time", { ascending: true });

      if (error) throw error;

      const rows = data || [];

      // Look up coach names for any lessons booked for this user
      const coachIds = Array.from(
        new Set(
          rows
            .filter((b: any) => b.client_user_id === user.id && b.user_id !== user.id)
            .map((b: any) => b.user_id as string)
        )
      );
      const coachNames = new Map<string, string>();
      if (coachIds.length > 0) {
        const { data: coaches } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name")
          .in("user_id", coachIds);
        (coaches || []).forEach((c: any) => {
          coachNames.set(
            c.user_id,
            `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Your coach"
          );
        });
      }

      const formattedBookings = rows.map((booking: any) => {
        const isLessonAsClient =
          booking.client_user_id === user.id && booking.user_id !== user.id;
        return {
          ...booking,
          bay_name: booking.bays?.name,
          bay_number: booking.bays?.bay_number,
          payment_method: booking.payment_method,
          stripe_payment_intent_id: booking.stripe_payment_intent_id,
          isLessonAsClient,
          coach_name: isLessonAsClient
            ? coachNames.get(booking.user_id) || "Your coach"
            : undefined,
        };
      });

      setBookings(formattedBookings);
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error("Failed to load bookings");
    } finally {
      setIsLoading(false);
    }
  };


  const handleCancelBooking = async (bookingId: string) => {
    setCancellingId(bookingId);
    
    // Show immediate feedback
    toast.loading("Processing cancellation...", { id: `cancel-${bookingId}` });
    
    try {
      const { data, error } = await supabase.functions.invoke("cancel-booking", {
        body: { booking_id: bookingId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Dismiss loading toast and show success
      toast.dismiss(`cancel-${bookingId}`);
      
      if (data?.refund) {
        if (data.refund.type === "balance") {
          toast.success(`Booking cancelled. $${data.refund.amount.toFixed(2)} refunded to your deposit balance.`);
        } else {
          toast.success("Booking cancelled. Refund is being processed to your card.");
        }
      } else {
        toast.success("Booking cancelled successfully");
      }
      
      fetchBookings();
    } catch (error) {
      console.error("Error cancelling booking:", error);
      toast.dismiss(`cancel-${bookingId}`);
      toast.error(error instanceof Error ? error.message : "Failed to cancel booking");
    } finally {
      setCancellingId(null);
    }
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const isBookingPast = (bookingDate: string, endTime: string) => {
    const date = parseISO(bookingDate);
    if (isPast(date) && !isToday(date)) return true;
    if (isToday(date)) {
      const [hours, minutes] = endTime.split(":");
      const now = new Date();
      const endDateTime = new Date();
      endDateTime.setHours(parseInt(hours), parseInt(minutes), 0);
      return now > endDateTime;
    }
    return false;
  };

  const upcomingBookings = bookings.filter(
    (b) => b.status === "confirmed" && !isBookingPast(b.booking_date, b.end_time)
  );
  const pastBookings = bookings
    .filter((b) => b.status !== "confirmed" || isBookingPast(b.booking_date, b.end_time))
    .sort((a, b) => {
      const aDate = new Date(`${a.booking_date}T${a.start_time}`).getTime();
      const bDate = new Date(`${b.booking_date}T${b.start_time}`).getTime();
      return bDate - aDate; // most recent first
    });

  // Show sign-in form as soon as we know there's no user — don't wait on the
  // bookings fetch (which never runs when signed out). Only show the spinner
  // while auth is still resolving.
  if (!authLoading && !isAuthenticated) {
    const extendId = searchParams.get("extend");
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="text-center space-y-2">
            <h1 className="font-display text-3xl tracking-wide text-primary">
              {extendId ? "SIGN IN TO EXTEND" : "SIGN IN"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {extendId
                ? `Sign in to your ${tenant.venue_name} account to extend your current session.`
                : "Sign in to view your bookings."}
            </p>
          </div>
          <AuthForm />
        </div>
      </div>
    );
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }


  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display text-base sm:text-2xl tracking-wide text-primary-foreground">
            MY BOOKINGS
          </span>
        </div>
        <img 
          src={venueLogo} 
          alt={tenant.venue_name} 
          className="h-7 sm:h-10 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-3xl mx-auto space-y-8">
          {/* Upcoming Bookings */}
          <section>
            <h2 className="font-display text-2xl text-primary mb-4">
              UPCOMING BOOKINGS
            </h2>
            {upcomingBookings.length === 0 ? (
              <div className="bg-card rounded-lg p-6 border border-border text-center">
                <p className="text-muted-foreground">No upcoming bookings</p>
                <Button
                  className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90"
                  onClick={() => navigate("/booking")}
                >
                  Book a Bay
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingBookings.map((booking) => {
                  const bStartMs = Date.parse(`${booking.booking_date}T${booking.start_time}+10:00`);
                  const bEndMs = Date.parse(`${booking.booking_date}T${booking.end_time}+10:00`);
                  const bNow = Date.now();
                  const bIsActive = !Number.isNaN(bStartMs) && !Number.isNaN(bEndMs) && bNow >= bStartMs && bNow < bEndMs;
                  return (
                  <div
                    key={booking.id}
                    className="bg-card rounded-lg p-5 border border-border shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          <MapPin className="h-4 w-4" />
                          Bay {booking.bay_number}
                          {booking.bay_name && ` - ${booking.bay_name}`}
                          {booking.isLessonAsClient && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <GraduationCap className="h-3 w-3" />
                              Lesson
                            </span>
                          )}
                          {bIsActive && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent">
                              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                              Live
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(booking.booking_date), "EEE, MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </div>
                        {booking.isLessonAsClient ? (
                          <div className="text-sm text-muted-foreground">
                            Coaching lesson with{" "}
                            <span className="font-medium text-foreground">{booking.coach_name}</span>
                            {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <span className="font-medium">${booking.total_price.toFixed(2)}</span>
                            <span className="text-muted-foreground">
                              {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}
                      </div>
                      {booking.isLessonAsClient ? (
                        <p className="text-xs text-muted-foreground sm:max-w-[200px] sm:text-right">
                          Your coach manages this booking — contact them to change or cancel it.
                        </p>
                      ) : (() => {

                        // Booking times are stored as Brisbane local (AEST, UTC+10, no DST).
                        const startMs = Date.parse(`${booking.booking_date}T${booking.start_time}+10:00`);
                        const endMs = Date.parse(`${booking.booking_date}T${booking.end_time}+10:00`);
                        const now = Date.now();
                        const minsSinceStart = (now - startMs) / 60000;
                        const minsUntilEnd = (endMs - now) / 60000;
                        const canReschedule = Number.isNaN(startMs) || minsSinceStart <= 10;
                        const canExtend =
                          !Number.isNaN(startMs) && !Number.isNaN(endMs) &&
                          minsSinceStart >= -15 && minsUntilEnd > -1;
                        const isActive = minsSinceStart >= 0 && minsUntilEnd > 0;
                        const canCancel = Number.isNaN(startMs) || minsSinceStart < 0;
                        return (
                        <div className="flex flex-wrap gap-2">
                          {canExtend && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExtendBooking(booking)}
                              className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Extend
                            </Button>
                          )}
                          {canReschedule && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setRescheduleBooking(booking)}
                              className="text-primary border-primary hover:bg-primary hover:text-primary-foreground"
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Reschedule
                            </Button>
                          )}
                          {canCancel && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Cancel
                            </Button>
                          </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel Booking?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to cancel your booking for Bay {booking.bay_number} on{" "}
                              {format(parseISO(booking.booking_date), "MMMM d, yyyy")} at{" "}
                              {formatTime(booking.start_time)}?
                              {booking.payment_method === "stripe" && booking.stripe_payment_intent_id && (
                                <span className="block mt-2 font-medium">
                                  Your payment of ${booking.total_price.toFixed(2)} will be refunded to your card.
                                </span>
                              )}
                              {booking.payment_method === "balance" && (
                                <span className="block mt-2 font-medium">
                                  ${booking.total_price.toFixed(2)} will be refunded to your deposit balance.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleCancelBooking(booking.id)}
                              disabled={cancellingId === booking.id}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {cancellingId === booking.id ? "Processing..." : "Cancel & Refund"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Past Bookings */}
          <section>
            <h2 className="font-display text-2xl text-primary mb-4">
              PAST BOOKINGS
            </h2>
            {pastBookings.length === 0 ? (
              <div className="bg-card rounded-lg p-6 border border-border text-center">
                <p className="text-muted-foreground">No past bookings</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pastBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-card rounded-lg p-5 border border-border shadow-sm opacity-70"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-foreground font-semibold">
                          <MapPin className="h-4 w-4" />
                          Bay {booking.bay_number}
                          {booking.bay_name && ` - ${booking.bay_name}`}
                          {booking.isLessonAsClient && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                              <GraduationCap className="h-3 w-3" />
                              Lesson
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(parseISO(booking.booking_date), "EEE, MMM d, yyyy")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            {formatTime(booking.start_time)} - {formatTime(booking.end_time)}
                          </span>
                        </div>
                        {booking.isLessonAsClient ? (
                          <div className="text-sm text-muted-foreground">
                            Coaching lesson with{" "}
                            <span className="font-medium text-foreground">{booking.coach_name}</span>
                            {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <span className="font-medium">${booking.total_price.toFixed(2)}</span>
                            <span className="text-muted-foreground">
                              {" "}• {booking.duration_hours} hour{booking.duration_hours > 1 ? "s" : ""}
                            </span>
                          </div>
                        )}

                        {booking.status === "cancelled" && (booking as any).cancellation_reason && (
                          <p className="text-xs text-destructive/80 mt-1 italic">
                            {(booking as any).cancellation_reason}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-1 rounded ${
                          booking.status === "cancelled"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {booking.status === "cancelled" ? "Cancelled" : "Completed"}
                      </span>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {tenant.venue_name}. All rights reserved.
        </p>
      </footer>

      {/* Reschedule Dialog */}
      {rescheduleBooking && (
        <RescheduleDialog
          booking={rescheduleBooking}
          open={!!rescheduleBooking}
          onOpenChange={(open) => !open && setRescheduleBooking(null)}
          onSuccess={fetchBookings}
        />
      )}

      {/* Extend Dialog */}
      {extendBooking && (
        <ExtendDialog
          booking={extendBooking}
          open={!!extendBooking}
          onOpenChange={(open) => !open && setExtendBooking(null)}
          onSuccess={fetchBookings}
        />
      )}
    </div>
  );
};

export default MyBookings;