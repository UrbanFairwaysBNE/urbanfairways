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
import { calculateExtensionCost, isPeakTime, addDurationToTime } from "@/lib/pricing-utils";
import { TierConfig, TIER_SELECT, normaliseTier, findTier } from "@/lib/tier-config";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";

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



const addHours = (time: string, hours: number) => addDurationToTime(time.slice(0, 5), hours);

export const ExtendDialog = ({ booking, open, onOpenChange, onSuccess }: Props) => {
  const { t } = useTranslation(["booking", "common"]);
  /** "30 min", "1hr", "1.5hr" */
  const durationLabel = (h: number) => (h === 0.5 ? t("booking:duration30min") : t("booking:durationHr", { count: h }));
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pricingConfig, setPricingConfig] = useState<TierConfig[]>([]);
  const [nextBookingStart, setNextBookingStart] = useState<string | null>(null);
  const [closeTime, setCloseTime] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState<number>(1);
  const [packHoursBalance, setPackHoursBalance] = useState(0);
  const [applyPackHours, setApplyPackHours] = useState(true);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedHours(1);
    setApplyPackHours(true);
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

      const [profRes, priceRes, nextRes, hoursRes, packRes] = await Promise.all([
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
        supabase.rpc("pack_hours_balance", { _user_id: user.id }),
      ]);

      setPackHoursBalance(Number(packRes.data) || 0);

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

  // How much time can be added, in 30-minute steps?
  const maxExtendHours = useMemo(() => {
    // No overall duration cap — extensions can push past the 4hr booking max
    let cap = 3;
    const [eh, em] = booking.end_time.split(":").map(Number);
    const endMin = eh * 60 + em;
    // next booking gap
    if (nextBookingStart) {
      const [nh, nm] = nextBookingStart.split(":").map(Number);
      cap = Math.min(cap, Math.floor(((nh * 60 + nm) - endMin) / 30) / 2);
    }
    // close time gap
    if (closeTime) {
      const [ch, cm] = closeTime.split(":").map(Number);
      cap = Math.min(cap, Math.floor(((ch * 60 + cm) - endMin) / 30) / 2);
    }
    return Math.max(0, Math.min(3, cap));
  }, [booking, nextBookingStart, closeTime]);

  const extensionCost = useMemo(() => {
    if (!profile) return 0;
    return calculateExtensionCost(
      profile.membership_tier,
      new Date(booking.booking_date + "T00:00:00"),
      booking.end_time.slice(0, 5),
      selectedHours,
      pricingConfig,
      { segment: profile.custom_segment },
    );
  }, [profile, pricingConfig, booking, selectedHours]);

  // Tiers with flat extension pricing (e.g. Casual) ignore peak/off-peak.
  const hasFlatExtendPricing = useMemo(() => {
    if (!profile || profile.custom_segment === "staff") return false;
    return (
      findTier(pricingConfig, profile.membership_tier)?.extend_60min_price != null
    );
  }, [profile, pricingConfig]);

  const isPeak = useMemo(() => {
    return isPeakTime(
      new Date(booking.booking_date + "T00:00:00"),
      booking.end_time,
    );
  }, [booking]);

  // Keep the selection inside what's actually available (e.g. only 30 min left).
  useEffect(() => {
    if (maxExtendHours > 0 && selectedHours > maxExtendHours) {
      setSelectedHours(maxExtendHours);
    }
  }, [maxExtendHours, selectedHours]);

  const balance = profile?.deposit_balance ?? 0;
  const packHoursAvailable = Math.min(packHoursBalance, selectedHours);
  const packHoursToApply = applyPackHours ? packHoursAvailable : 0;
  const packDiscount =
    selectedHours > 0
      ? Math.round((extensionCost / selectedHours) * packHoursToApply * 100) / 100
      : 0;
  const amountDue = Math.max(0, Math.round((extensionCost - packDiscount) * 100) / 100);
  const fromBalance = Math.min(balance, amountDue);
  const fromCard = Math.max(0, amountDue - fromBalance);

  const handleSubmit = async () => {
    setSubmitting(true);
    const toastId = toast.loading(t("booking:extendingToast"));
    try {
      const { data, error } = await supabase.functions.invoke("extend-booking", {
        body: {
          booking_id: booking.id,
          additional_hours: selectedHours,
          use_pack_hours: packHoursToApply > 0,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.dismiss(toastId);
      const p = data.payment || {};
      let msg = t("booking:extendedBy", { duration: durationLabel(selectedHours) });
      if (p.packHoursUsed) msg += t("booking:prepaidUsedMsg", { count: p.packHoursUsed, unit: t("booking:hourUnit", { count: p.packHoursUsed }) });
      if (p.chargedToCard) msg += t("booking:chargedCardMsg", { amount: p.chargedToCard.toFixed(2) });
      if (p.chargedFromBalance && !p.chargedToCard) msg += t("booking:fromBalanceMsg", { amount: p.chargedFromBalance.toFixed(2) });
      toast.success(msg);
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      toast.dismiss(toastId);
      toast.error(e instanceof Error ? e.message : t("booking:failedToExtend"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("booking:extendSessionTitle")}</DialogTitle>
          <DialogDescription>
            {t("booking:currentlyEndsAt", { bay: booking.bay_number, time: booking.end_time.slice(0, 5) })}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : maxExtendHours === 0 ? (
          <div className="py-6 text-sm text-muted-foreground text-center space-y-2">
            <p className="font-medium text-foreground">{t("booking:noAdditionalTimeTitle")}</p>
            <p>
              {nextBookingStart
                ? t("booking:bayBookedAtNote", { time: nextBookingStart })
                : closeTime
                  ? t("booking:weCloseAtNote", { time: closeTime })
                  : t("booking:atMaxLengthNote")}
            </p>
            <p>{t("booking:bookAnotherBayNote")}</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("booking:addTimeLabel")}
              </p>
              <div className="grid grid-cols-4 gap-2">
                {[0.5, 1, 2, 3].map((h) => (
                  <Button
                    key={h}
                    type="button"
                    variant={selectedHours === h ? "default" : "outline"}
                    disabled={h > maxExtendHours}
                    onClick={() => setSelectedHours(h)}
                    className="h-14 flex-col gap-1 px-1"
                  >
                    <span className="text-sm font-semibold">+{durationLabel(h)}</span>
                    <span className="text-[10px] opacity-80">{t("booking:untilTime", { time: addHours(booking.end_time, h) })}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="bg-muted rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span>
                  {t("booking:additionalDurationLabel", { duration: durationLabel(selectedHours), defaultValue: `Additional ${durationLabel(selectedHours)}` })}
                  {hasFlatExtendPricing ? "" : (isPeak ? t("booking:additionalDurationPeak") : t("booking:additionalDurationOffPeak"))}
                </span>
                <span className="font-semibold">${extensionCost.toFixed(2)}</span>
              </div>
              {packHoursBalance > 0 && extensionCost > 0 && (
                <div className="flex items-start gap-2 pt-1">
                  <Checkbox
                    id="extend-pack-hours"
                    checked={applyPackHours}
                    onCheckedChange={(c) => setApplyPackHours(c === true)}
                  />
                  <Label htmlFor="extend-pack-hours" className="flex-1 cursor-pointer font-normal">
                    <span className="flex justify-between">
                      <span>
                        {t("booking:usePrepaidOf", { used: packHoursAvailable, total: packHoursBalance, unit: t("booking:hourUnit", { count: packHoursBalance }) })}
                      </span>
                      <span className="text-green-600">−${packDiscount.toFixed(2)}</span>
                    </span>
                  </Label>
                </div>
              )}
              {fromBalance > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("booking:fromBalanceLabel")}</span>
                  <span>−${fromBalance.toFixed(2)}</span>
                </div>
              )}
              {fromCard > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{t("booking:chargedToSavedCardLabel")}</span>
                  <span>${fromCard.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("booking:cancel")}
          </Button>
          {maxExtendHours > 0 && (
            <Button onClick={handleSubmit} disabled={submitting || loading}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {t("booking:extendingBtn")}</>
              ) : (
                <><Plus className="h-4 w-4 mr-1" /> {t("booking:confirmExtensionBtn")}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
