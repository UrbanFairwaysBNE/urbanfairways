import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Clock, Plus } from "lucide-react";
import { calculateHourlyRate, isPeakTime } from "@/lib/pricing-utils";
import { TierConfig, TIER_SELECT, normaliseTier } from "@/lib/tier-config";

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
}

interface Profile {
  membership_tier: string;
  custom_hourly_rate: number | null;
  deposit_balance: number;
  custom_segment: string | null;
}

interface Props {
  booking: Booking;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}



const addHours = (time: string, hours: number) => {
  const [h, m] = time.split(":").map(Number);
  const nh = h + hours;
  return `${nh.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
};

export const ExtendDialog = ({ booking, open, onOpenChange, onSuccess }: Props) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pricingConfig, setPricingConfig] = useState<TierConfig[]>([]);
  const [nextBookingStart, setNextBookingStart] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedHours(1);
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

      const [profRes, priceRes, nextRes, hoursRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("membership_tier, custom_hourly_rate, deposit_balance, custom_segment")
          .eq("user_id", user.id)
          .single(),
        supabase.from("pricing_config").select(TIER_SELECT).order("display_order"),
        supabase
          .from("bookings")
          .select("start_time")
          .eq("bay_id", booking.bay_id)
          .eq("booking_date", booking.booking_date)
          .in("status", ["confirmed", "pending"])
          .neq("id", booking.id)
          .gte("start_time", booking.end_time)
          .order("start_time", { ascending: true })
          .limit(1),
        supabase
          .from("operating_hours")
          .select("close_time,is_open")
          .eq("day_of_week", new Date(booking.booking_date + "T00:00:00").getDay())
          .maybeSingle(),
      ]);

      if (profRes.data) setProfile(profRes.data as Profile);
      if (priceRes.data) {
        setPricingConfig((priceRes.data as Record<string, unknown>[]).map(normaliseTier));
      }
      setNextBookingStart(nextRes.data?.[0]?.start_time?.slice(0, 5) ?? null);
      setCloseTime(
        hoursRes.data?.is_open && hoursRes.data?.close_time
          ? String(hoursRes.data.close_time).slice(0, 5)
          : null,
        );
      } catch (e) {
        console.error("ExtendDialog load failed", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, booking.id, booking.bay_id, booking.booking_date, booking.end_time]);

  // How many whole hours can be added?
  const maxExtendHours = useMemo(() => {
    // No overall duration cap — extensions can push past the 4hr booking max
    let cap = 3;
    // next booking gap
    if (nextBookingStart) {
      const [eh, em] = booking.end_time.split(":").map(Number);
      const [nh, nm] = nextBookingStart.split(":").map(Number);
      const gap = (nh * 60 + nm) - (eh * 60 + em);
      cap = Math.min(cap, Math.floor(gap / 60));
    }
    // close time gap
    if (closeTime) {
      const [eh, em] = booking.end_time.split(":").map(Number);
      const [ch, cm] = closeTime.split(":").map(Number);
      const gap = (ch * 60 + cm) - (eh * 60 + em);
      cap = Math.min(cap, Math.floor(gap / 60));
    }
    return Math.max(0, Math.min(3, cap));
  }, [booking, nextBookingStart, closeTime]);

  const extensionCost = useMemo(() => {
    if (!profile) return 0;
    let total = 0;
    const [h, m] = booking.end_time.split(":").map(Number);
    for (let i = 0; i < selectedHours; i++) {
      const slot = `${(h + i).toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      const rate = calculateHourlyRate(
        profile.membership_tier,
        new Date(booking.booking_date + "T00:00:00"),
        slot,
        pricingConfig,
        { segment: profile.custom_segment },
      );
      total += rate;
    }
    return total;
  }, [profile, pricingConfig, booking, selectedHours]);

  const isPeak = useMemo(() => {
    return isPeakTime(
      new Date(booking.booking_date + "T00:00:00"),
      booking.end_time,
    );
  }, [booking]);

  const balance = profile?.deposit_balance ?? 0;
  const fromBalance = Math.min(balance, extensionCost);
  const fromCard = Math.max(0, extensionCost - fromBalance);

  const handleSubmit = async () => {
    setSubmitting(true);
    const t = toast.loading("Extending your booking...");
    try {
      const { data, error } = await supabase.functions.invoke("extend-booking", {
        body: { booking_id: booking.id, additional_hours: selectedHours },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.dismiss(t);
      const p = data.payment || {};
      let msg = `Extended by ${selectedHours}hr!`;
      if (p.chargedToCard) msg += ` $${p.chargedToCard.toFixed(2)} charged to card.`;
      if (p.chargedFromBalance && !p.chargedToCard) msg += ` $${p.chargedFromBalance.toFixed(2)} from balance.`;
      toast.success(msg);
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.dismiss(t);
      toast.error(e instanceof Error ? e.message : "Failed to extend");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Extend Your Session</DialogTitle>
          <DialogDescription>
            Bay {booking.bay_number} · currently ends at {booking.end_time.slice(0, 5)}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : maxExtendHours === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center space-y-2">
            <p className="font-medium text-foreground">No additional time available</p>
            <p>
              {nextBookingStart
                ? `The bay is booked at ${nextBookingStart}.`
                : closeTime
                  ? `We close at ${closeTime}.`
                  : "This booking is already at the maximum length."}
            </p>
            <p>You can book another bay from the home screen.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Add time
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={selectedHours === h ? "default" : "outline"}
                    disabled={h > maxExtendHours}
                    onClick={() => setSelectedHours(h)}
                    className="h-14 flex-col gap-1"
                  >
                    <span className="text-base font-semibold">+{h}hr</span>
                    <span className="text-xs opacity-80">until {addHours(booking.end_time, h).slice(0, 5)}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>Additional {selectedHours}hr ({isPeak ? "peak" : "off-peak"})</span>
                <span className="font-semibold">${extensionCost.toFixed(2)}</span>
              </div>
              {fromBalance > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>From balance</span>
                  <span>−${fromBalance.toFixed(2)}</span>
                </div>
              )}
              {fromCard > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Charged to saved card</span>
                  <span>${fromCard.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          {maxExtendHours > 0 && (
            <Button onClick={handleSubmit} disabled={submitting || loading}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Extending...</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> Confirm Extension</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
