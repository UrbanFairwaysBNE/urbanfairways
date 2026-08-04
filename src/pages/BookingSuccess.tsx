import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { CheckCircle, Calendar, Clock, MapPin, CreditCard, Loader2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import venueLogo from "@/assets/venue-logo-mark.png";
import { useTenant } from "@/config/tenant";

interface BookingDetails {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_price: number;
  status: string;
  bay: {
    name: string;
    bay_number: number;
  };
}

type PaymentStatus = "loading" | "confirmed" | "failed" | "pending" | "error";

const BookingSuccess = () => {
  const { tenant } = useTenant();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("loading");
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookingId = searchParams.get("booking_id");
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    const verifyAndFetchBooking = async () => {
      if (!bookingId) {
        setError("No booking ID provided");
        setPaymentStatus("error");
        return;
      }

      try {
        const { data: verifyResult, error: verifyError } = await supabase.functions.invoke(
          "verify-booking-payment",
          { body: { bookingId, sessionId } }
        );

        if (verifyError) {
          console.error("Verification error:", verifyError);
          setError("Unable to verify booking");
          setPaymentStatus("error");
          return;
        }

        console.log("Verification result:", verifyResult);

        // Handle different payment statuses
        if (verifyResult?.status === "failed") {
          setPaymentStatus("failed");
          setFailureMessage(verifyResult.message || "Payment was not completed");
          if (verifyResult.booking) {
            setBooking(verifyResult.booking as BookingDetails);
          }
          return;
        }

        if (verifyResult?.status === "pending") {
          setPaymentStatus("pending");
          if (verifyResult.booking) {
            setBooking(verifyResult.booking as BookingDetails);
          }
          return;
        }

        if (verifyResult?.status === "confirmed" && verifyResult?.booking) {
          setBooking(verifyResult.booking as BookingDetails);
          setPaymentStatus("confirmed");

          // Check loyalty credit eligibility (fire and forget)
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            supabase.functions.invoke("check-loyalty-credit", {
              body: { user_id: user.id },
            }).catch((e) => console.error("Loyalty check failed:", e));
          }

          return;
        }

        setError("Unable to load booking details");
        setPaymentStatus("error");
      } catch (err) {
        console.error("Error:", err);
        setError("An error occurred while loading your booking");
        setPaymentStatus("error");
      }
    };

    verifyAndFetchBooking();
  }, [bookingId, sessionId]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Loading state
  if (paymentStatus === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Processing your booking...</p>
        </div>
      </div>
    );
  }

  // Payment Failed state
  if (paymentStatus === "failed") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
          <div className="container mx-auto flex items-center justify-center">
            <img src={venueLogo} alt={`${tenant.venue_name} Logo`} className="h-10 w-auto" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-8 pb-6">
              <div className="flex justify-center mb-6">
                <div className="bg-destructive/10 rounded-full p-4">
                  <XCircle className="h-16 w-16 text-destructive" />
                </div>
              </div>

              <h1 className="text-2xl font-bold text-center text-foreground mb-2">
                Payment Failed
              </h1>
              <p className="text-center text-muted-foreground mb-6">
                {failureMessage || "Your payment could not be processed. No booking has been made."}
              </p>

              <div className="bg-muted/50 rounded-lg p-4 mb-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground mb-1">What to do next:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Check your card details are correct</li>
                      <li>Ensure you have sufficient funds</li>
                      <li>Try a different payment method</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button 
                  className="w-full" 
                  onClick={() => navigate("/booking")}
                >
                  Try Again
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate("/dashboard")}
                >
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Pending state (payment still processing)
  if (paymentStatus === "pending") {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
          <div className="container mx-auto flex items-center justify-center">
            <img src={venueLogo} alt={`${tenant.venue_name} Logo`} className="h-10 w-auto" />
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-8 pb-6 text-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Processing Payment
              </h1>
              <p className="text-muted-foreground mb-6">
                Your payment is still being processed. This may take a moment.
              </p>
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
              >
                Check Status
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Error state
  if (paymentStatus === "error" || !booking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-destructive mb-4">{error || "Booking not found"}</p>
            <Button onClick={() => navigate("/dashboard")}>Go to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const bookingDate = new Date(booking.booking_date + "T00:00:00");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="container mx-auto flex items-center justify-center">
          <img src={venueLogo} alt={`${tenant.venue_name} Logo`} className="h-10 w-auto" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-8 pb-6">
            {/* Success Icon */}
            <div className="flex justify-center mb-6">
              <div className="bg-green-100 rounded-full p-4">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            </div>

            {/* Success Message */}
            <h1 className="text-2xl font-bold text-center text-foreground mb-2">
              Booking Confirmed!
            </h1>
            <p className="text-center text-muted-foreground mb-6">
              Your payment was successful and your bay is reserved. Your card has been saved for future bookings.
            </p>

            {/* Booking Details */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-4">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Bay</p>
                  <p className="font-semibold text-foreground">{booking.bay?.name || "Bay"}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-semibold text-foreground">
                    {format(bookingDate, "EEEE, MMMM d, yyyy")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Time</p>
                  <p className="font-semibold text-foreground">
                    {formatTime(booking.start_time)} - {formatTime(booking.end_time)} ({booking.duration_hours}hr)
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Amount Paid</p>
                  <p className="font-semibold text-foreground">${booking.total_price.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex justify-center mt-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                booking.status === "confirmed" 
                  ? "bg-green-100 text-green-800" 
                  : "bg-yellow-100 text-yellow-800"
              }`}>
                {booking.status === "confirmed" ? "Confirmed" : "Processing"}
              </span>
            </div>

            {/* How to Use Guide */}
            <div className="mt-6 p-4 bg-muted/50 rounded-lg border text-center">
              <p className="font-display text-lg text-foreground mb-2">First Time at {tenant.venue_name}?</p>
              <p className="text-sm text-muted-foreground mb-3">
                Check out our guide for everything you need to know about accessing the facility and using the simulators.
              </p>
              <a 
                href="/quick-start-guide" 
                className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                View the Guide
              </a>
            </div>

            {/* Action Buttons */}
            <div className="mt-6 space-y-3">
              <Button 
                className="w-full" 
                onClick={() => navigate("/my-bookings")}
              >
                View My Bookings
              </Button>
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => navigate("/dashboard")}
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center text-sm text-muted-foreground">
        <p>A confirmation email has been sent to your registered email address.</p>
      </footer>
    </div>
  );
};

export default BookingSuccess;
