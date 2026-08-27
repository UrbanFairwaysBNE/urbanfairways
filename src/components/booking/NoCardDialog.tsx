import { useState, useEffect, useCallback } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { useTranslation } from "react-i18next";

const CARD_SETUP_PENDING_KEY = "bb:cardSetupPending";

interface NoCardDialogProps {
  open: boolean;
  onClose: () => void;
  onCardAdded?: () => void;
  returnPath?: string;
}

export function NoCardDialog({ open, onClose, onCardAdded, returnPath = "/card-added" }: NoCardDialogProps) {
  const { t } = useTranslation(["booking", "common"]);
  const [isOpeningStripe, setIsOpeningStripe] = useState(false);
  const [isAwaitingReturn, setIsAwaitingReturn] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Check if returning from Stripe setup (web only - native uses browser close event)
  useEffect(() => {
    if (open && !Capacitor.isNativePlatform() && localStorage.getItem(CARD_SETUP_PENDING_KEY) === "1") {
      setIsAwaitingReturn(true);
    }
  }, [open]);

  // Verify if card was added by checking payment methods
  const verifyCardAdded = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke("get-payment-methods");
      if (error) {
        console.error("[NoCardDialog] Error checking payment methods:", error);
        return false;
      }
      const paymentMethods = data?.paymentMethods || [];
      return paymentMethods.length > 0;
    } catch (err) {
      console.error("[NoCardDialog] Error verifying card:", err);
      return false;
    }
  }, []);

  const handleAddCard = async () => {
    setIsOpeningStripe(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-setup", {
        body: {
          returnTo: returnPath,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("No Stripe URL returned");

      localStorage.setItem(CARD_SETUP_PENDING_KEY, "1");

      if (Capacitor.isNativePlatform()) {
        // On native: use Capacitor Browser (in-app browser)
        // This opens Safari View Controller on iOS which stays "in app"
        setIsAwaitingReturn(true);
        setIsOpeningStripe(false);
        
        // Listen for when user closes the browser
        const listener = await Browser.addListener('browserFinished', async () => {
          console.log("[NoCardDialog] Browser closed, verifying card...");
          listener.remove();
          
          setIsVerifying(true);
          
          // Give Stripe webhook a moment to process
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const hasCard = await verifyCardAdded();
          
          setIsVerifying(false);
          localStorage.removeItem(CARD_SETUP_PENDING_KEY);
          
          if (hasCard) {
            toast({
              title: t("booking:cardAddedTitle"),
              description: t("booking:cardAddedDesc"),
            });
            onCardAdded?.();
            onClose();
          } else {
            setIsAwaitingReturn(false);
            toast({
              title: t("booking:cardNotAddedTitle"),
              description: t("booking:cardNotAddedDesc"),
              variant: "destructive",
            });
          }
        });
        
        await Browser.open({ url: data.url });
      } else {
        // On web: open in new tab
        const preOpened = window.open("about:blank", "_blank");
        
        setIsAwaitingReturn(true);
        setIsOpeningStripe(false);

        if (preOpened) {
          preOpened.location.href = data.url;
        } else {
          // Fallback: navigate current view
          window.location.href = data.url;
        }
      }
    } catch (error: any) {
      toast({
        title: t("booking:errorTitle"),
        description: error.message || t("booking:failedStartSetup"),
        variant: "destructive",
      });
      localStorage.removeItem(CARD_SETUP_PENDING_KEY);
      setIsOpeningStripe(false);
      setIsAwaitingReturn(false);
    }
  };

  const handleClose = async (verifyCard: boolean = false) => {
    if (verifyCard && isAwaitingReturn) {
      // User clicked "Done" on web - verify if card was added
      setIsVerifying(true);
      const hasCard = await verifyCardAdded();
      setIsVerifying(false);
      
      if (hasCard) {
        localStorage.removeItem(CARD_SETUP_PENDING_KEY);
        setIsOpeningStripe(false);
        setIsAwaitingReturn(false);
        onCardAdded?.();
        onClose();
        return;
      }
    }
    
    localStorage.removeItem(CARD_SETUP_PENDING_KEY);
    setIsOpeningStripe(false);
    setIsAwaitingReturn(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            {t("booking:addPaymentMethodTitle")}
          </DialogTitle>
          <DialogDescription>
            {isVerifying
              ? t("booking:verifyingPaymentMethod")
              : isAwaitingReturn
              ? Capacitor.isNativePlatform()
                ? t("booking:completeSetupNative")
                : t("booking:completeSetupWeb")
              : t("booking:needCardDesc")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          {isVerifying ? (
            <Button disabled className="w-full sm:w-auto">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t("booking:verifyingBtn")}
            </Button>
          ) : isAwaitingReturn ? (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} className="w-full sm:w-auto">
                {t("booking:cancel")}
              </Button>
              <Button onClick={() => handleClose(true)} className="w-full sm:w-auto">
                {t("booking:doneBtn")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleClose(false)} className="w-full sm:w-auto">
                {t("booking:cancel")}
              </Button>
              <Button 
                onClick={handleAddCard} 
                disabled={isOpeningStripe}
                className="w-full sm:w-auto"
              >
                {isOpeningStripe ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("booking:openingBtn")}
                  </>
                ) : (
                  t("booking:addCardBtn")
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}