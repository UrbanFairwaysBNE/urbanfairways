import { useEffect, useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import birdiesLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export default function CardAdded() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [isSyncing, setIsSyncing] = useState(true);
  const [syncResult, setSyncResult] = useState<{ 
    updatedSubscriptions?: number;
    invoiceRetry?: { attempted: boolean; paid: boolean; error: string | null } | null;
  } | null>(null);

  useEffect(() => {
    const syncPaymentMethod = async () => {
      try {
        // Sync the new card to any active subscriptions
        const { data, error } = await supabase.functions.invoke("sync-subscription-payment-method");
        
        if (error) {
          console.error("Error syncing payment method:", error);
        } else if (data) {
          setSyncResult(data);
          console.log("Payment method synced:", data);
        }
      } catch (err) {
        console.error("Failed to sync payment method:", err);
      } finally {
        setIsSyncing(false);
      }
    };

    syncPaymentMethod();
  }, []);

  const handleContinue = () => {
    // Clear any setup flags
    localStorage.removeItem("stripe_setup_return");
    localStorage.removeItem("stripe_setup_return_path");
    // Navigate to booking page
    navigate("/booking");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground py-4 px-4 safe-area-top">
        <div className="max-w-4xl mx-auto flex items-center justify-center">
          <img src={birdiesLogo} alt={tenant.venue_name} className="h-10 w-auto" />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-green-600" />
            </div>
          </div>
          
          <div className="space-y-4">
            <h1 className="font-display text-3xl tracking-wide">Card Added</h1>
            <p className="text-muted-foreground text-lg">
              Your payment method has been saved successfully.
            </p>
            {isSyncing && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Updating your account...</span>
              </div>
            )}
            {!isSyncing && syncResult?.updatedSubscriptions && syncResult.updatedSubscriptions > 0 && (
              <p className="text-sm text-green-600">
                Your membership payment method has been updated.
              </p>
            )}
            {!isSyncing && syncResult?.invoiceRetry?.attempted && (
              syncResult.invoiceRetry.paid ? (
                <p className="text-sm text-green-600">
                  ✅ Outstanding payment has been processed successfully!
                </p>
              ) : (
                <p className="text-sm text-amber-600">
                  ⚠️ We couldn't process your outstanding payment with this card. Please try a different card.
                </p>
              )
            )}
          </div>

          <Button 
            onClick={handleContinue}
            size="lg"
            className="w-full text-lg py-6"
            disabled={isSyncing}
          >
            {isSyncing ? "Please wait..." : "Continue Booking"}
          </Button>
        </div>
      </main>
    </div>
  );
}