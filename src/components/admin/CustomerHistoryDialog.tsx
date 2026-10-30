import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Australia/Brisbane";

type Kind = "booking" | "pack" | "pos" | "membership" | "credit";

interface HistoryItem {
  id: string;
  kind: Kind;
  date: Date;
  title: string;
  detail: string;
  amount: number | null;
  status?: string;
}

const KIND_LABEL: Record<Kind, string> = {
  booking: "Booking",
  pack: "Prepaid pack",
  pos: "POS",
  membership: "Membership",
  credit: "Credit",
};

const METHOD_LABEL: Record<string, string> = {
  card: "Card",
  balance: "Credit balance",
  cash: "Cash",
  pending: "Unpaid",
  prepaid_hours: "Prepaid hours",
  partial: "Part prepaid/credit",
  free: "Free",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  customerName: string;
}

export function CustomerHistoryDialog({ open, onOpenChange, userId, customerName }: Props) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | Kind>("all");

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [bookings, packs, pos, memberships, credits, bays] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, created_at, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, pack_hours_used, bay_id, booking_type")
          .eq("user_id", userId)
          .order("booking_date", { ascending: false })
          .range(0, 999),
        supabase
          .from("pack_lots")
          .select("id, purchased_at, created_at, product_name, price_paid, hours_total, hours_remaining, status, expires_at, is_gift")
          .eq("user_id", userId),
        supabase
          .from("pos_transactions")
          .select("id, created_at, total, payment_method, status, items")
          .eq("customer_id", userId)
          .range(0, 999),
        supabase
          .from("membership_payments")
          .select("id, paid_at, amount, tier")
          .eq("user_id", userId)
          .range(0, 999),
        supabase
          .from("deposit_transactions")
          .select("*")
          .eq("user_id", userId)
          .range(0, 999),
        supabase.from("bays").select("id, name"),
      ]);
      const bayName = new Map((bays.data || []).map((b: any) => [b.id, b.name]));
      const out: HistoryItem[] = [];

      for (const b of (bookings.data || []) as any[]) {
        const method = METHOD_LABEL[b.payment_method] || b.payment_method || "-";
        const hrs = Number(b.pack_hours_used || 0);
        out.push({
          id: `b-${b.id}`,
          kind: "booking",
          date: new Date(`${b.booking_date}T${b.start_time}+10:00`),
          title: `${b.booking_type === "lesson" ? "Lesson" : bayName.get(b.bay_id) || "Bay"} · ${b.start_time.slice(0, 5)}–${b.end_time.slice(0, 5)} (${Number(b.duration_hours)}hr)`,
          detail: `${method}${hrs > 0 ? ` · ${hrs}hr from pack` : ""}`,
          amount: Number(b.total_price),
          status: b.status,
        });
      }
      for (const p of (packs.data || []) as any[]) {
        out.push({
          id: `p-${p.id}`,
          kind: "pack",
          date: new Date(p.purchased_at || p.created_at),
          title: `${p.product_name} (${Number(p.hours_total)}hr)${p.is_gift ? " · gift" : ""}`,
          detail: `${Number(p.hours_remaining)}hr remaining${p.expires_at ? ` · expires ${formatInTimeZone(new Date(p.expires_at), TZ, "d MMM yyyy")}` : ""}`,
          amount: Number(p.price_paid || 0),
          status: p.status,
        });
      }
      for (const t of (pos.data || []) as any[]) {
        const list = Array.isArray(t.items) ? t.items.map((i: any) => `${i.quantity || 1}x ${i.name}`).join(", ") : "POS sale";
        out.push({
          id: `t-${t.id}`,
          kind: "pos",
          date: new Date(t.created_at),
          title: list || "POS sale",
          detail: METHOD_LABEL[t.payment_method] || t.payment_method || "-",
          amount: Number(t.total),
          status: t.status,
        });
      }
      for (const m of (memberships.data || []) as any[]) {
        out.push({
          id: `m-${m.id}`,
          kind: "membership",
          date: new Date(m.paid_at),
          title: `${m.tier} membership payment`,
          detail: "Stripe",
          amount: Number(m.amount),
        });
      }
      for (const c of (credits.data || []) as any[]) {
        out.push({
          id: `c-${c.id}`,
          kind: "credit",
          date: new Date(c.created_at),
          title: c.description || c.transaction_type || "Credit change",
          detail: c.transaction_type || "",
          amount: Number(c.amount),
        });
      }

      out.sort((a, b) => b.date.getTime() - a.date.getTime());
      if (!cancelled) {
        setItems(out);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const shown = filter === "all" ? items : items.filter((i) => i.kind === filter);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>History — {customerName}</DialogTitle>
          <DialogDescription>Everything this customer has booked and purchased (Brisbane time).</DialogDescription>
        </DialogHeader>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="booking">Bookings</TabsTrigger>
            <TabsTrigger value="pack">Packs</TabsTrigger>
            <TabsTrigger value="pos">POS</TabsTrigger>
            <TabsTrigger value="membership">Membership</TabsTrigger>
            <TabsTrigger value="credit">Credit</TabsTrigger>
          </TabsList>
        </Tabs>
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No history yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((i) => (
              <li key={i.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline">{KIND_LABEL[i.kind]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatInTimeZone(i.date, TZ, "EEE d MMM yyyy, h:mma")}
                    </span>
                    {i.status && <span className="text-xs text-muted-foreground capitalize">· {i.status}</span>}
                  </div>
                  <p className="text-sm font-medium mt-1 capitalize-first">{i.title}</p>
                  {i.detail && <p className="text-xs text-muted-foreground">{i.detail}</p>}
                </div>
                {i.amount !== null && (
                  <span className="text-sm font-medium whitespace-nowrap">
                    {i.amount < 0 ? "-" : ""}${Math.abs(i.amount).toFixed(2)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
