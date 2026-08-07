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

/**
 * Prepaid hour packs. Hours are a separate wallet to the dollar credit balance —
 * they buy simulator time only, work any day/time, and expire per pack.
 */
export function PrepaidPacksCard() {
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
      toast.error(e instanceof Error ? e.message : "Could not start checkout");
      setIsPurchasing(false);
    }
  };

  const handleRedeem = async () => {
    setIsRedeeming(true);
    try {
      const hours = await redeemCode(code);
      toast.success(`${formatHours(hours)} hours added to your account`);
      setCode("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not redeem that code");
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
                    {corporate ? `${corporate.companyName} Hours` : "Prepaid Hours"}
                  </CardTitle>
                  <CardDescription>
                    {balance > 0
                      ? `${formatHours(balance)} hours available`
                      : corporate
                        ? corporate.isOwner
                          ? "Buy a corporate pack and share the hours with your staff."
                          : "Your company has no hours left — ask your manager to top up."
                        : "Buy simulator time up front and use it any day, any time."}
                  </CardDescription>
                </div>
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
              <p className="text-sm text-muted-foreground">Your prepaid balance</p>
              <p className="text-3xl font-bold text-primary">
                {formatHours(balance)} <span className="text-lg font-medium">hours</span>
              </p>
              <div className="mt-3 space-y-1">
                {activeLots.map((lot) => (
                  <p key={lot.id} className="text-xs text-muted-foreground">
                    {formatHours(Number(lot.hours_remaining))}h from {lot.product_name}
                    {lot.expires_at && ` — expires ${formatBrisbaneDate(new Date(lot.expires_at))}`}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Gift codes waiting to be passed on */}
          {giftLots.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Gift codes you've bought</p>
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
                      toast.success("Code copied");
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
              <p className="text-sm font-medium">Available packs</p>
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
                      ${(Number(p.price) / Number(p.hours)).toFixed(2)}/hr · valid{" "}
                      {Math.round(p.validity_days / 30)} months
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
                      Buy pack
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redeem a pack code — retail only, corporate packs aren't giftable */}
          {!corporate && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Redeem a pack code</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="UF-XXXXXX"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase"
                  disabled={isRedeeming}
                />
                <Button onClick={handleRedeem} disabled={isRedeeming || !code.trim()}>
                  {isRedeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
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
                  {formatHours(Number(selected.hours))} hours of simulator time for $
                  {Number(selected.price).toFixed(0)}. Valid {selected.validity_days} days
                  {isGift ? " from the day it's redeemed" : " from purchase"}. Usable any day, any
                  time, and can be combined with card or account credit.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {corporate ? (
            <p className="text-sm text-muted-foreground">
              These hours go into your company wallet and can be used by any staff member you've
              given access to.
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
                    <Gift className="h-4 w-4" /> Buying this as a gift
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    We'll email you a redemption code to pass on. The hours land in their account
                    when they redeem it.
                  </p>
                </div>
              </div>

              {isGift && (
                <div className="space-y-2">
                  <Label htmlFor="pack-recipient">Recipient name (optional)</Label>
                  <Input
                    id="pack-recipient"
                    value={recipientName}
                    maxLength={80}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Who's it for?"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={isPurchasing}>
              Cancel
            </Button>
            <Button onClick={handlePurchase} disabled={isPurchasing}>
              {isPurchasing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Clock className="h-4 w-4 mr-2" /> Pay ${Number(selected?.price ?? 0).toFixed(0)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
