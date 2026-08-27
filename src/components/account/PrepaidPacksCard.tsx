import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Clock, Loader2, Timer, Copy, Gift, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatBrisbaneDate } from "@/lib/brisbane-time";
import { usePackHours, formatHours, type PackProduct } from "@/hooks/usePackHours";
import { useTranslation } from "react-i18next";

/**
 * Prepaid hour packs. Hours are a separate wallet to the dollar credit balance —
 * they buy simulator time only, work any day/time, and expire per pack.
 */
export function PrepaidPacksCard() {
  const { t } = useTranslation(["account", "common"]);
  const { balance, lots, products, corporate, isLoading, refresh, purchase, redeemCode } =
    usePackHours();
  const [selected, setSelected] = useState<PackProduct | null>(null);
  const [isGift, setIsGift] = useState(false);
  const [recipientName, setRecipientName] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [code, setCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const activeLots = lots.filter((l) => l.status === "active" && Number(l.hours_remaining) > 0);
  const giftLots = lots.filter((l) => l.status === "unredeemed" && l.redemption_code);

  const handlePurchase = async () => {
    if (!selected) return;
    setIsPurchasing(true);
    try {
      const url = await purchase(selected.id, { isGift, recipientName: recipientName.trim() });
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("account:couldNotStartCheckout"));
      setIsPurchasing(false);
    }
  };

  const handleRedeem = async () => {
    setIsRedeeming(true);
    try {
      const hours = await redeemCode(code);
      toast.success(t("account:hoursAddedToast", { hours: formatHours(hours) }));
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("account:redeemFailedGeneric"));
    } finally {
      setIsRedeeming(false);
    }
  };

  if (isLoading && products.length === 0) return null;

  return (
    <>
      <Card>
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer select-none">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Timer className="h-5 w-5 text-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <CardTitle>
                    {corporate ? t("account:corporateHoursTitle", { company: corporate.companyName }) : t("account:prepaidHoursTitle")}
                  </CardTitle>
                  <CardDescription>
                    {balance > 0
                      ? t("account:hoursAvailable", { hours: formatHours(balance) })
                      : corporate
                        ? corporate.isOwner
                          ? t("account:buyCorporatePackDesc")
                          : t("account:companyNoHoursDesc")
                        : t("account:buyHoursDesc")}
                  </CardDescription>
                </div>
                {balance > 0 && (
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {t("account:hrsBadge", { hours: formatHours(balance) })}
                  </Badge>
                )}
                <ChevronDown
                  className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                />

              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
        <CardContent className="space-y-6">

          {/* Balance */}
          {balance > 0 && (
            <div className="rounded-lg border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">{t("account:yourPrepaidBalance")}</p>
              <p className="text-3xl font-bold text-primary">
                {formatHours(balance)} <span className="text-lg font-medium">{t("account:hoursUnit")}</span>
              </p>
              <div className="mt-3 space-y-1">
                {activeLots.map((lot) => (
                  <p key={lot.id} className="text-xs text-muted-foreground">
                    {formatHours(Number(lot.hours_remaining))}h from {lot.product_name}
                    {lot.expires_at && t("account:expiresOn", { date: formatBrisbaneDate(new Date(lot.expires_at)) })}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Gift codes waiting to be passed on */}
          {giftLots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("account:giftCodesBought")}</p>
              {giftLots.map((lot) => (
                <div
                  key={lot.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tracking-wider truncate">
                      {lot.redemption_code}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lot.product_name} · {formatHours(Number(lot.hours_total))}h
                      {lot.recipient_name && ` · for ${lot.recipient_name}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(lot.redemption_code!);
                      toast.success(t("account:codeCopied"));
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Packs for sale */}
          {products.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{t("account:availablePacks")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {products.map((p) => (
                  <div key={p.id} className="rounded-lg border p-4 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{p.name}</p>
                      <Badge variant="secondary">{formatHours(Number(p.hours))} hrs</Badge>
                    </div>
                    <p className="mt-2 text-2xl font-bold text-primary">
                      ${Number(p.price).toFixed(0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${(Number(p.price) / Number(p.hours)).toFixed(2)}/hr ·{" "}
                      {t("account:validForMonths", { months: Math.round(p.validity_days / 30) })}
                    </p>
                    {p.description && (
                      <p className="mt-2 text-xs text-muted-foreground">{p.description}</p>
                    )}
                    <Button
                      className="mt-4 w-full"
                      onClick={() => {
                        setSelected(p);
                        setIsGift(false);
                        setRecipientName("");
                      }}
                    >
                      {t("account:buyPack")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redeem a pack code — retail only, corporate packs aren't giftable */}
          {!corporate && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("account:redeemPackCode")}</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder={t("account:redeemPlaceholder")}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase"
                  disabled={isRedeeming}
                />
                <Button onClick={handleRedeem} disabled={isRedeeming || !code.trim()}>
                  {isRedeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : t("account:redeem")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>
              {selected && (
                <>
                  {t("account:hoursSimulatorTimeFor", { hours: formatHours(Number(selected.hours)), price: Number(selected.price).toFixed(0) })}{" "}
                  {isGift
                    ? t("account:validForDaysGift", { days: selected.validity_days })
                    : t("account:validForDaysPurchase", { days: selected.validity_days })}{" "}
                  {t("account:usableAnyTimeDesc")}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {corporate ? (
            <p className="text-sm text-muted-foreground">
              {t("account:corporateWalletDesc")}
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Checkbox
                  id="pack-gift"
                  checked={isGift}
                  onCheckedChange={(v) => setIsGift(Boolean(v))}
                />
                <div className="space-y-1">
                  <Label htmlFor="pack-gift" className="flex items-center gap-2 cursor-pointer">
                    <Gift className="h-4 w-4" /> {t("account:buyingAsGift")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("account:giftEmailDesc")}
                  </p>
                </div>
              </div>

              {isGift && (
                <div className="space-y-2">
                  <Label htmlFor="pack-recipient">{t("account:recipientNameLabel")}</Label>
                  <Input
                    id="pack-recipient"
                    value={recipientName}
                    maxLength={80}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder={t("account:recipientNamePlaceholder")}
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={isPurchasing}>
              {t("common:cancel")}
            </Button>
            <Button onClick={handlePurchase} disabled={isPurchasing}>
              {isPurchasing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Clock className="h-4 w-4 mr-2" /> {t("account:payAmount", { amount: Number(selected?.price ?? 0).toFixed(0) })}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
