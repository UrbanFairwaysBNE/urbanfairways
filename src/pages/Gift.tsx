import Seo from "@/components/Seo";
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { CalendarIcon, Check, Gift as GiftIcon, Loader2, Printer, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { isHubHost } from "@/lib/hub-host";

const PRESET_AMOUNTS = [35, 70, 105, 175, 350];
type DeliveryMethod = "email_recipient" | "print_to_sender" | "both";


function GiftContent() {
  const [params] = useSearchParams();
  const success = params.get("success") === "1";
  const cancelled = params.get("cancelled") === "1";

  const [amount, setAmount] = useState<number>(70);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [message, setMessage] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("email_recipient");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill if logged in
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email && !senderEmail) {
        setSenderEmail(data.user.email);
        supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", data.user.id)
          .maybeSingle()
          .then(({ data: p }) => {
            if (p && !senderName) {
              setSenderName(`${p.first_name || ""} ${p.last_name || ""}`.trim());
            }
          });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cancelled) toast.error("Payment cancelled. No charge was made.");
  }, [cancelled]);

  const finalAmount = customAmount ? Number(customAmount) : amount;

  const handleSubmit = async () => {
    if (!finalAmount || finalAmount < 10 || finalAmount > 1000) {
      toast.error("Amount must be between $10 and $1000");
      return;
    }
    if (!recipientName.trim()) return toast.error("Recipient name required");
    if (!recipientEmail.trim() && deliveryMethod !== "print_to_sender") {
      return toast.error("Recipient email required");
    }
    if (!senderName.trim()) return toast.error("Your name required");
    if (!senderEmail.trim()) return toast.error("Your email required");

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-gift-checkout", {
        body: {
          amount: finalAmount,
          recipient_name: recipientName.trim(),
          recipient_email: (recipientEmail || senderEmail).trim().toLowerCase(),
          sender_name: senderName.trim(),
          sender_email: senderEmail.trim().toLowerCase(),
          personal_message: message.trim() || undefined,
          scheduled_for: date ? format(date, "yyyy-MM-dd") : undefined,
          delivery_method: deliveryMethod,
        },
      });

      // Extract the real error message from the edge function response body.
      // supabase.functions.invoke() only surfaces a generic "non-2xx" message,
      // so we parse error.context (the underlying Response) to get specifics.
      if (error) {
        let detailedMessage = "";
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            detailedMessage = body?.error || body?.message || "";
          } else if (ctx && typeof ctx.text === "function") {
            detailedMessage = await ctx.text();
          }
        } catch {
          /* ignore parse failure */
        }
        throw new Error(detailedMessage || error.message || "Failed to start checkout");
      }

      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        toast.success("Redirecting to secure checkout…");
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned. Please try again.");
      }
    } catch (err: any) {
      console.error("[gift checkout]", err);
      toast.error(err.message || "Failed to start checkout", {
        description: "If this keeps happening, please contact us at sales@baysidegolf.com.au.",
        duration: 8000,
      });
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="p-8 text-center max-w-md bg-white border-[#1F4C25]/15">
          <div className="h-16 w-16 bg-[#1F4C25] rounded-full flex items-center justify-center mx-auto mb-5">
            <Check className="h-9 w-9 text-[#EC622D]" />
          </div>
          <h1 className="font-display text-3xl text-[#1F4C25] mb-2 tracking-wide" style={{ fontFamily: "Anton, sans-serif" }}>
            GIFT ON ITS WAY!
          </h1>
          <p className="text-[#1F4C25]/80 mb-6">
            Thank you, your payment is confirmed. We'll email the gift card per your delivery choice.
          </p>
          <Button asChild className="bg-[#EC622D] hover:bg-[#EC622D]/90 text-white">
            <Link to="/gift">Send Another</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-[#FFF5E4]">
      <main className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#EC622D]/10 mb-3">
            <GiftIcon className="h-7 w-7 text-[#EC622D]" />
          </div>
          <h1
            className="text-4xl md:text-5xl text-[#1F4C25] mb-2 tracking-wide"
            style={{ fontFamily: "Anton, sans-serif" }}
          >
            GIVE THE GIFT OF BIRDIES
          </h1>
          <p className="text-[#1F4C25]/75 text-base">
            Indoor golf simulator credit, redeemable on any bay booking, food or drink.
          </p>
        </div>

        <Card className="p-6 md:p-8 bg-white border-[#1F4C25]/15 space-y-7">
          {/* Amount */}
          <div>
            <Label className="text-[#1F4C25] font-semibold mb-3 block">Gift Amount</Label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-3">
              {PRESET_AMOUNTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => {
                    setAmount(a);
                    setCustomAmount("");
                  }}
                  className={cn(
                    "py-3 rounded-lg border-2 font-semibold transition-all",
                    amount === a && !customAmount
                      ? "border-[#EC622D] bg-[#EC622D] text-white"
                      : "border-[#1F4C25]/20 text-[#1F4C25] hover:border-[#EC622D]/50"
                  )}
                >
                  ${a}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#1F4C25]/60 text-sm">Or custom:</span>
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1F4C25]/60">$</span>
                <Input
                  type="number"
                  min={10}
                  max={1000}
                  placeholder="Other amount"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="pl-7 border-[#1F4C25]/20"
                />
              </div>
            </div>
          </div>

          {/* Delivery method */}
          <div>
            <Label className="text-[#1F4C25] font-semibold mb-3 block">How should we deliver it?</Label>
            <div className="space-y-2">
              {[
                { v: "email_recipient" as const, icon: Mail, title: "Email the recipient", sub: "We email them directly on the chosen date" },
                { v: "print_to_sender" as const, icon: Printer, title: "Email me to print", sub: "We send a printable card to your email" },
                { v: "both" as const, icon: GiftIcon, title: "Both", sub: "Recipient gets email + you get a printable copy" },
              ].map(({ v, icon: Icon, title, sub }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDeliveryMethod(v)}
                  className={cn(
                    "w-full text-left p-4 rounded-lg border-2 transition-all flex items-start gap-3",
                    deliveryMethod === v
                      ? "border-[#EC622D] bg-[#EC622D]/5"
                      : "border-[#1F4C25]/15 hover:border-[#EC622D]/40"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 mt-0.5 flex-shrink-0",
                      deliveryMethod === v ? "text-[#EC622D]" : "text-[#1F4C25]/60"
                    )}
                  />
                  <div className="flex-1">
                    <div className="font-semibold text-[#1F4C25]">{title}</div>
                    <div className="text-sm text-[#1F4C25]/70">{sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Recipient */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="recipient_name" className="text-[#1F4C25] font-semibold">Recipient Name</Label>
              <Input
                id="recipient_name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Jane Doe"
                className="mt-1 border-[#1F4C25]/20"
              />
            </div>
            <div>
              <Label htmlFor="recipient_email" className="text-[#1F4C25] font-semibold">
                Recipient Email {deliveryMethod === "print_to_sender" && <span className="text-[#1F4C25]/50 text-xs">(optional)</span>}
              </Label>
              <Input
                id="recipient_email"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="jane@email.com"
                className="mt-1 border-[#1F4C25]/20"
              />
            </div>
          </div>

          {/* Sender */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="sender_name" className="text-[#1F4C25] font-semibold">Your Name</Label>
              <Input
                id="sender_name"
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="John Smith"
                className="mt-1 border-[#1F4C25]/20"
              />
            </div>
            <div>
              <Label htmlFor="sender_email" className="text-[#1F4C25] font-semibold">Your Email</Label>
              <Input
                id="sender_email"
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="john@email.com"
                className="mt-1 border-[#1F4C25]/20"
              />
            </div>
          </div>

          {/* Message */}
          <div>
            <Label htmlFor="message" className="text-[#1F4C25] font-semibold">
              Personal Message <span className="text-[#1F4C25]/50 text-xs">(optional, 280 chars)</span>
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 280))}
              placeholder="Happy birthday! Enjoy a session on me."
              rows={3}
              className="mt-1 border-[#1F4C25]/20"
            />
            <div className="text-xs text-[#1F4C25]/50 mt-1 text-right">{message.length}/280</div>
          </div>

          {/* Delivery date */}
          <div>
            <Label className="text-[#1F4C25] font-semibold mb-1 block">Delivery Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal border-[#1F4C25]/20",
                    !date && "text-[#1F4C25]/60"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, "PPP") : <span>Send today (default)</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {date && (
              <button
                type="button"
                onClick={() => setDate(undefined)}
                className="text-xs text-[#EC622D] mt-2 hover:underline"
              >
                Clear date (send immediately)
              </button>
            )}
          </div>

          {/* Total + CTA */}
          <div className="pt-4 border-t border-[#1F4C25]/10">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#1F4C25]/70">Total</span>
              <span className="text-3xl font-bold text-[#1F4C25]" style={{ fontFamily: "Anton, sans-serif" }}>
                ${finalAmount ? finalAmount.toFixed(2) : "0.00"}
              </span>
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              size="lg"
              className="w-full bg-[#EC622D] hover:bg-[#EC622D]/90 text-white text-base h-12"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Continue to Payment"
              )}
            </Button>
            <p className="text-xs text-[#1F4C25]/60 text-center mt-3">
              Secure payment via Stripe. You'll be charged ${finalAmount ? finalAmount.toFixed(2) : "0.00"} AUD.
            </p>
          </div>
        </Card>
      </main>
    </div>
  );
}

export default function Gift() {
  if (isHubHost()) {
    return <GiftContent />;
  }
  return (
    <MarketingLayout>
      <Seo title={"Gift Cards | Birdies Bayside Indoor Golf"} description={"Buy a Birdies Bayside gift card, redeemable on simulator bay bookings and memberships at our Redland Bay indoor golf centre."} path="/gift" />
      <GiftContent />
    </MarketingLayout>
  );
}
