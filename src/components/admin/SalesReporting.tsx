import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Calendar, TrendingUp, DollarSign, ShoppingCart, CalendarDays, RefreshCw, Users } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { toZonedTime } from "date-fns-tz";

interface SaleRecord {
  id: string;
  type: "booking" | "pos" | "membership" | "pack";
  date: Date;
  amount: number;
  paymentMethod: string;
  customerName: string | null;
  customerEmail: string | null;
  description: string;
  status: string;
}

const tierDisplayNames: Record<string, string> = {
  weekday: "Weekday",
  birdie: "Birdie",
  eagle: "Eagle",
};

type DatePreset = "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "lastMonth" | "custom";
type SaleType = "all" | "booking" | "pos" | "membership" | "pack";
type PaymentMethod = "all" | "card" | "deposit" | "cash" | "terminal" | "stripe";

export function SalesReporting() {
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [timezone, setTimezone] = useState<string>("Australia/Brisbane");

  // Filters
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [saleType, setSaleType] = useState<SaleType>("all");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("all");

  // Summary stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [bookingRevenue, setBookingRevenue] = useState(0);
  const [posRevenue, setPosRevenue] = useState(0);
  const [membershipRevenue, setMembershipRevenue] = useState(0);
  const [transactionCount, setTransactionCount] = useState(0);

  // Fetch timezone from system settings
  useEffect(() => {
    const fetchTimezone = async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("timezone")
        .eq("id", "global")
        .single();
      if (data?.timezone) {
        setTimezone(data.timezone);
      }
    };
    fetchTimezone();
  }, []);

  // Helper to get current time in configured timezone
  const getNowInTimezone = () => {
    return toZonedTime(new Date(), timezone);
  };

  const getDateRange = (): { start: Date; end: Date } => {
    const now = getNowInTimezone();
    
    switch (datePreset) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "yesterday":
        const yesterday = subDays(now, 1);
        return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
      case "last7":
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
      case "last30":
        return { start: startOfDay(subDays(now, 29)), end: endOfDay(now) };
      case "thisMonth":
        return { start: startOfMonth(now), end: endOfDay(now) };
      case "lastMonth":
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "custom":
        return {
          start: customStartDate ? startOfDay(parseISO(customStartDate)) : startOfDay(subDays(now, 7)),
          end: customEndDate ? endOfDay(parseISO(customEndDate)) : endOfDay(now),
        };
      default:
        return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    }
  };

  const fetchSales = async () => {
    setIsLoading(true);
    
    const { start, end } = getDateRange();
    const startStr = start.toISOString();
    const endStr = end.toISOString();

    const allSales: SaleRecord[] = [];

    // Get booking IDs that were paid via POS - these will be counted from POS transaction items instead
    const { data: posBookingLinks } = await supabase
      .from("pos_transactions")
      .select("booking_id")
      .not("booking_id", "is", null)
      .eq("status", "completed");
    
    const posBookingIds = new Set((posBookingLinks || []).map(t => String(t.booking_id)));

    // Fetch bookings (only confirmed/completed, excluding those paid via POS - they'll be added from POS items)
    if (saleType === "all" || saleType === "booking") {
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select(`
          id,
          created_at,
          booking_date,
          start_time,
          total_price,
          payment_method,
          status,
          duration_hours,
          user_id
        `)
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .in("status", ["confirmed", "completed", "charged"]);

      if (!bookingsError && bookings) {
        // Get profiles for customer names
        const userIds = [...new Set(bookings.map(b => b.user_id))];
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .in("user_id", userIds);

        const profileMap = new Map<string, { user_id: string; first_name: string; last_name: string; email: string }>();
        if (profiles) {
          for (const p of profiles) {
            profileMap.set(p.user_id, p);
          }
        }

        for (const booking of bookings) {
          // Skip bookings paid via POS - they'll be added as "Booking" type from POS transaction items
          if (posBookingIds.has(String(booking.id))) continue;
          
          const profile = profileMap.get(booking.user_id);
          const bookingPaymentMethod = booking.payment_method || "card";
          
          // Apply payment method filter
          if (paymentMethod !== "all" && bookingPaymentMethod !== paymentMethod) continue;

          allSales.push({
            id: booking.id,
            type: "booking",
            date: new Date(booking.created_at),
            // Prepaid-hour redemptions were already paid when the pack was bought
            amount: bookingPaymentMethod === "prepaid_hours" ? 0 : Number(booking.total_price),
            paymentMethod: bookingPaymentMethod,
            customerName: profile ? `${profile.first_name} ${profile.last_name}` : null,
            customerEmail: profile?.email || null,
            description: `Bay booking - ${booking.booking_date} ${booking.start_time} (${booking.duration_hours}hr)`,
            status: booking.status,
          });
        }
      }
    }

    // Fetch POS transactions - split into Booking items and POS (product) items
    if (saleType === "all" || saleType === "pos" || saleType === "booking") {
      const { data: posTransactions, error: posError } = await supabase
        .from("pos_transactions")
        .select(`
          id,
          created_at,
          total,
          payment_method,
          status,
          items,
          customer_id,
          booking_id
        `)
        .gte("created_at", startStr)
        .lte("created_at", endStr)
        .eq("status", "completed");

      if (!posError && posTransactions) {
        // Get customer profiles
        const customerIds = [...new Set(posTransactions.map(t => t.customer_id).filter(Boolean))] as string[];
        
        const profileMap = new Map<string, { user_id: string; first_name: string; last_name: string; email: string }>();
        
        if (customerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, email")
            .in("user_id", customerIds);
          
          if (profiles) {
            for (const p of profiles) {
              profileMap.set(p.user_id, p);
            }
          }
        }

        for (const transaction of posTransactions) {
          const posPaymentMethod = transaction.payment_method === "pos" ? "stripeinperson" : (transaction.payment_method || "cash");
          
          // Apply payment method filter
          if (paymentMethod !== "all" && posPaymentMethod !== paymentMethod) continue;

          const profile = transaction.customer_id ? profileMap.get(transaction.customer_id) : null;
          const customerName = profile ? `${profile.first_name} ${profile.last_name}` : null;
          const customerEmail = profile?.email || null;
          
          // Parse items and split into booking items vs product items
          try {
            const items = transaction.items as Array<{ name: string; quantity: number; price: number; bookingId?: string }>;
            if (Array.isArray(items) && items.length > 0) {
              // Separate booking items from product items
              const bookingItems = items.filter(i => i.bookingId);
              const productItems = items.filter(i => !i.bookingId);
              
              // Add booking items as "Booking" type (if filtering allows)
              if (saleType === "all" || saleType === "booking") {
                for (const item of bookingItems) {
                  const itemTotal = (item.price || 0) * (item.quantity || 1);
                  allSales.push({
                    id: `${transaction.id}-booking-${item.bookingId}`,
                    type: "booking",
                    date: new Date(transaction.created_at),
                    amount: itemTotal,
                    paymentMethod: posPaymentMethod,
                    customerName,
                    customerEmail,
                    description: `Bay booking - ${item.name}`,
                    status: transaction.status,
                  });
                }
              }
              
              // Add product items as "POS" type (if filtering allows)
              if ((saleType === "all" || saleType === "pos") && productItems.length > 0) {
                const productTotal = productItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
                const productDescription = productItems.map(i => `${i.quantity}x ${i.name}`).join(", ");
                allSales.push({
                  id: `${transaction.id}-products`,
                  type: "pos",
                  date: new Date(transaction.created_at),
                  amount: productTotal,
                  paymentMethod: posPaymentMethod,
                  customerName,
                  customerEmail,
                  description: productDescription,
                  status: transaction.status,
                });
              }
            } else {
              // No items parsed, show as POS if appropriate
              if (saleType === "all" || saleType === "pos") {
                allSales.push({
                  id: transaction.id,
                  type: "pos",
                  date: new Date(transaction.created_at),
                  amount: transaction.total,
                  paymentMethod: posPaymentMethod,
                  customerName,
                  customerEmail,
                  description: "POS Sale",
                  status: transaction.status,
                });
              }
            }
          } catch {
            // Fallback: show as POS if appropriate
            if (saleType === "all" || saleType === "pos") {
              allSales.push({
                id: transaction.id,
                type: "pos",
                date: new Date(transaction.created_at),
                amount: transaction.total,
                paymentMethod: posPaymentMethod,
                customerName,
                customerEmail,
                description: "POS Sale",
                status: transaction.status,
              });
            }
          }
        }
      }
    }

    // Fetch membership payments
    if (saleType === "all" || saleType === "membership") {
      const { data: membershipPayments, error: membershipError } = await supabase
        .from("membership_payments")
        .select(`
          id,
          paid_at,
          amount,
          tier,
          user_id
        `)
        .gte("paid_at", startStr)
        .lte("paid_at", endStr);

      if (!membershipError && membershipPayments) {
        // Get user profiles for membership payments
        const memberUserIds = [...new Set(membershipPayments.map(p => p.user_id))];
        
        const memberProfileMap = new Map<string, { user_id: string; first_name: string; last_name: string; email: string }>();
        
        if (memberUserIds.length > 0) {
          const { data: memberProfiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, email")
            .in("user_id", memberUserIds);
          
          if (memberProfiles) {
            for (const p of memberProfiles) {
              memberProfileMap.set(p.user_id, p);
            }
          }
        }

        for (const payment of membershipPayments) {
          // Apply payment method filter (membership payments are always via Stripe)
          if (paymentMethod !== "all" && paymentMethod !== "stripe" && paymentMethod !== "card") continue;

          const profile = memberProfileMap.get(payment.user_id);
          const tierName = tierDisplayNames[payment.tier] || payment.tier;

          allSales.push({
            id: payment.id,
            type: "membership",
            date: new Date(payment.paid_at),
            amount: payment.amount,
            paymentMethod: "stripe",
            customerName: profile ? `${profile.first_name} ${profile.last_name}` : null,
            customerEmail: profile?.email || null,
            description: `${tierName} Membership - Weekly`,
            status: "paid",
          });
        }
      }
    }

    // Fetch prepaid pack purchases
    if (saleType === "all" || saleType === "pack") {
      const { data: packs } = await supabase
        .from("pack_lots")
        .select("id, purchased_at, price_paid, product_name, hours_total, purchaser_name, purchaser_email, status, is_gift, stripe_payment_intent_id")
        .not("purchased_at", "is", null)
        .not("stripe_payment_intent_id", "is", null)
        .gte("purchased_at", startStr)
        .lte("purchased_at", endStr);
      for (const lot of packs || []) {
        if (paymentMethod !== "all" && paymentMethod !== "stripe" && paymentMethod !== "card") continue;
        allSales.push({
          id: lot.id,
          type: "pack",
          date: new Date(lot.purchased_at as string),
          amount: Number(lot.price_paid || 0),
          paymentMethod: "stripe",
          customerName: lot.purchaser_name,
          customerEmail: lot.purchaser_email,
          description: `${lot.product_name} (${Number(lot.hours_total)}hr)${lot.is_gift ? " - gift" : ""}`,
          status: lot.status,
        });
      }
    }

    // Sort by date descending
    allSales.sort((a, b) => b.date.getTime() - a.date.getTime());

    setSales(allSales);

    // Calculate summaries
    const total = allSales.reduce((sum, s) => sum + s.amount, 0);
    const bookingTotal = allSales.filter(s => s.type === "booking").reduce((sum, s) => sum + s.amount, 0);
    const posTotal = allSales.filter(s => s.type === "pos").reduce((sum, s) => sum + s.amount, 0);
    const membershipTotal = allSales.filter(s => s.type === "membership").reduce((sum, s) => sum + s.amount, 0);

    setTotalRevenue(total);
    setBookingRevenue(bookingTotal);
    setPosRevenue(posTotal);
    setMembershipRevenue(membershipTotal);
    setTransactionCount(allSales.length);

    setIsLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, [datePreset, customStartDate, customEndDate, saleType, paymentMethod]);

  const exportToCSV = () => {
    setIsExporting(true);

    const headers = ["Date", "Time", "Type", "Description", "Customer", "Email", "Payment Method", "Amount", "Status"];
    const rows = sales.map(sale => [
      format(sale.date, "yyyy-MM-dd"),
      format(sale.date, "HH:mm"),
      sale.type === "booking" ? "Booking" : sale.type === "membership" ? "Membership" : sale.type === "pack" ? "Prepaid Pack" : "POS",
      `"${sale.description.replace(/"/g, '""')}"`,
      sale.customerName ? `"${sale.customerName.replace(/"/g, '""')}"` : "",
      sale.customerEmail || "",
      sale.paymentMethod,
      sale.amount.toFixed(2),
      sale.status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `sales-report-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setIsExporting(false);
  };

  const getPaymentMethodBadge = (method: string) => {
    const variants: Record<string, "default" | "secondary" | "outline"> = {
      card: "default",
      deposit: "secondary",
      cash: "outline",
      terminal: "default",
      stripe: "default",
    };
    return <Badge variant={variants[method] || "outline"}>{method}</Badge>;
  };

  const { start, end } = getDateRange();

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Report Filters
          </CardTitle>
          <CardDescription>Filter sales data by date, type, and payment method</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                  <SelectItem value="thisMonth">This Month</SelectItem>
                  <SelectItem value="lastMonth">Last Month</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {datePreset === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>Sale Type</Label>
              <Select value={saleType} onValueChange={(v) => setSaleType(v as SaleType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sales</SelectItem>
                  <SelectItem value="booking">Bookings Only</SelectItem>
                  <SelectItem value="pos">POS Only</SelectItem>
                  <SelectItem value="membership">Memberships Only</SelectItem>
                  <SelectItem value="pack">Prepaid Packs Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="stripe">Stripe (Subscription)</SelectItem>
                  <SelectItem value="deposit">Deposit/Credit</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="terminal">Terminal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing: {format(start, "d MMM yyyy")}, {format(end, "d MMM yyyy")}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchSales} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="default" size="sm" onClick={exportToCSV} disabled={isExporting || sales.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <TrendingUp className="h-4 w-4" />
              Total Revenue
            </div>
            <p className="text-2xl font-bold mt-1">${totalRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <CalendarDays className="h-4 w-4" />
              Booking Revenue
            </div>
            <p className="text-2xl font-bold mt-1">${bookingRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <ShoppingCart className="h-4 w-4" />
              POS Revenue
            </div>
            <p className="text-2xl font-bold mt-1">${posRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Users className="h-4 w-4" />
              Membership Revenue
            </div>
            <p className="text-2xl font-bold mt-1">${membershipRevenue.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <DollarSign className="h-4 w-4" />
              Transactions
            </div>
            <p className="text-2xl font-bold mt-1">{transactionCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Timeline</CardTitle>
          <CardDescription>All sales transactions in chronological order</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64" />
          ) : sales.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No sales found for this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="min-w-[200px]">Description</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={`${sale.type}-${sale.id}`}>
                      <TableCell className="whitespace-nowrap">
                        <div className="font-medium">{format(sale.date, "d MMM yyyy")}</div>
                        <div className="text-sm text-muted-foreground">{format(sale.date, "h:mm a")}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={sale.type === "booking" ? "default" : sale.type === "membership" ? "outline" : "secondary"}>
                          {sale.type === "booking" ? "Booking" : sale.type === "membership" ? "Membership" : sale.type === "pack" ? "Prepaid Pack" : "POS"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate">{sale.description}</TableCell>
                      <TableCell>
                        {sale.customerName ? (
                          <div>
                            <div className="font-medium">{sale.customerName}</div>
                            <div className="text-xs text-muted-foreground">{sale.customerEmail}</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Guest</span>
                        )}
                      </TableCell>
                      <TableCell>{getPaymentMethodBadge(sale.paymentMethod)}</TableCell>
                      <TableCell className="text-right font-medium">${sale.amount.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
