import { useAdminAuth } from "@/hooks/useAdminAuth";
import { usePricing } from "@/hooks/usePricing";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, DollarSign, TrendingUp, Users, UserCheck, Repeat, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, subDays, startOfDay, endOfDay } from "date-fns";
import { toZonedTime, formatInTimeZone } from "date-fns-tz";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type TimeFilter = "today" | "week" | "month" | "quarter";
type MemberTierFilter = string;
type MemberRevenueFilter = "weekly" | "monthly" | "quarterly";

interface DashboardStats {
  bookings: number;
  revenue: number;
  occupancy: number;
  memberCount: number;
  memberRevenue: number;
  momGrowth: number;
}

const timeFilterLabels: Record<TimeFilter, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
};



const memberRevenueLabels: Record<MemberRevenueFilter, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

const tierDisplayNames: Record<string, string> = {
  weekday: "Weekday",
  birdie: "Birdie",
  eagle: "Eagle",
};

export default function AdminDashboard() {
  const { isAdmin, isLoading } = useAdminAuth();
  const { pricing, defaultTier, memberTiers } = usePricing();
  const walkInTier = defaultTier?.tier ?? "casual";
  const memberTierLabels: Record<string, string> = {
    all: "All Members",
    ...Object.fromEntries(pricing.map((t) => [t.tier, t.display_name])),
  };
  const [stats, setStats] = useState<DashboardStats>({
    bookings: 0,
    revenue: 0,
    occupancy: 0,
    memberCount: 0,
    memberRevenue: 0,
    momGrowth: 0,
  });
  const [loadingStats, setLoadingStats] = useState(true);
  const [timezone, setTimezone] = useState<string>("Australia/Brisbane");
  
  // Filter states
  const [bookingsFilter, setBookingsFilter] = useState<TimeFilter>("today");
  const [revenueFilter, setRevenueFilter] = useState<TimeFilter>("today");
  const [occupancyFilter, setOccupancyFilter] = useState<TimeFilter>("today");
  const [memberTierFilter, setMemberTierFilter] = useState<MemberTierFilter>("all");
  const [memberRevenueFilter, setMemberRevenueFilter] = useState<MemberRevenueFilter>("weekly");

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

  // Returns ISO strings for timestamp comparisons (created_at)
  const getDateRange = (filter: TimeFilter): { start: string; end: string } => {
    const nowInTz = getNowInTimezone();
    
    // Get start/end of day in the configured timezone, then convert to ISO strings
    switch (filter) {
      case "today":
        return { 
          start: startOfDay(nowInTz).toISOString(), 
          end: endOfDay(nowInTz).toISOString() 
        };
      case "week":
        return {
          start: startOfDay(startOfWeek(nowInTz, { weekStartsOn: 1 })).toISOString(),
          end: endOfDay(endOfWeek(nowInTz, { weekStartsOn: 1 })).toISOString(),
        };
      case "month":
        return {
          start: startOfDay(startOfMonth(nowInTz)).toISOString(),
          end: endOfDay(endOfMonth(nowInTz)).toISOString(),
        };
      case "quarter":
        return {
          start: startOfDay(startOfQuarter(nowInTz)).toISOString(),
          end: endOfDay(endOfQuarter(nowInTz)).toISOString(),
        };
    }
  };

  // Returns date strings for DATE column comparisons (booking_date)
  const getBookingDateRange = (filter: TimeFilter): { start: string; end: string } => {
    const nowInTz = getNowInTimezone();
    const todayStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
    
    switch (filter) {
      case "today":
        return { start: todayStr, end: todayStr };
      case "week":
        return {
          start: format(startOfWeek(nowInTz, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
          end: format(endOfWeek(nowInTz, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        };
      case "month":
        return {
          start: format(startOfMonth(nowInTz), 'yyyy-MM-dd'),
          end: format(endOfMonth(nowInTz), 'yyyy-MM-dd'),
        };
      case "quarter":
        return {
          start: format(startOfQuarter(nowInTz), 'yyyy-MM-dd'),
          end: format(endOfQuarter(nowInTz), 'yyyy-MM-dd'),
        };
    }
  };

  const getDaysInRange = (filter: TimeFilter): number => {
    const nowInTz = getNowInTimezone();
    switch (filter) {
      case "today":
        return 1;
      case "week":
        return 7;
      case "month":
        return new Date(nowInTz.getFullYear(), nowInTz.getMonth() + 1, 0).getDate();
      case "quarter":
        const qStart = startOfQuarter(nowInTz);
        const qEnd = endOfQuarter(nowInTz);
        return Math.ceil((qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    }
  };

  const fetchStats = async (showLoading = true) => {
    if (showLoading) setLoadingStats(true);
    
    // Fetch bookings based on filter (uses booking_date which is a DATE column)
    const bookingsRange = getBookingDateRange(bookingsFilter);
    const { data: bookingsData } = await supabase
      .from('bookings')
      .select('total_price, duration_hours, status')
      .gte('booking_date', bookingsRange.start)
      .lte('booking_date', bookingsRange.end)
      .neq('status', 'cancelled');

    const bookings = bookingsData?.length || 0;

    // Fetch revenue based on filter (Bookings + POS, de-duplicated with same logic as SalesReporting)
    const revenueRange = getDateRange(revenueFilter);
    
    // Get booking IDs that were paid via POS to avoid double-counting
    const { data: posBookingLinks } = await supabase
      .from('pos_transactions')
      .select('booking_id')
      .not('booking_id', 'is', null)
      .eq('status', 'completed');
    
    const posBookingIds = new Set((posBookingLinks || []).map(t => String(t.booking_id)));
    
    // Fetch bookings (excluding those paid via POS - they'll be counted from POS items)
    const { data: bookingRevenueData } = await supabase
      .from('bookings')
      .select('id, total_price')
      .gte('created_at', revenueRange.start)
      .lte('created_at', revenueRange.end)
      .in('status', ['confirmed', 'completed', 'charged']);

    // Only count bookings NOT paid via POS
    const bookingRevenue = (bookingRevenueData || [])
      .filter(b => !posBookingIds.has(String(b.id)))
      .reduce((sum, b) => sum + Number(b.total_price), 0);

    // Fetch POS transactions and calculate revenue from items (same logic as SalesReporting)
    const { data: posRevenueData } = await supabase
      .from('pos_transactions')
      .select('items')
      .gte('created_at', revenueRange.start)
      .lte('created_at', revenueRange.end)
      .eq('status', 'completed');

    // Calculate POS revenue by summing all item prices (bookings paid via POS + products)
    let posRevenue = 0;
    for (const t of posRevenueData || []) {
      try {
        const items = t.items as Array<{ price?: number; quantity?: number }>;
        if (Array.isArray(items)) {
          for (const item of items) {
            posRevenue += (item.price || 0) * (item.quantity || 1);
          }
        }
      } catch {
        // Skip malformed items
      }
    }

    // Fetch membership payments for the period
    const { data: membershipPaymentsData } = await supabase
      .from('membership_payments')
      .select('amount, tier')
      .gte('paid_at', revenueRange.start)
      .lte('paid_at', revenueRange.end);

    const membershipRevenue = (membershipPaymentsData || [])
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const revenue = bookingRevenue + posRevenue + membershipRevenue;

    // Fetch occupancy based on filter (uses booking_date which is a DATE column)
    const occupancyRange = getBookingDateRange(occupancyFilter);
    const { data: occupancyData } = await supabase
      .from('bookings')
      .select('duration_hours')
      .gte('booking_date', occupancyRange.start)
      .lte('booking_date', occupancyRange.end)
      .neq('status', 'cancelled');

    const days = getDaysInRange(occupancyFilter);
    const totalHoursAvailable = 6 * 18 * days; // 6 bays * 18 hours * days
    const bookedHours = occupancyData?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
    const occupancy = totalHoursAvailable > 0 ? Math.round((bookedHours / totalHoursAvailable) * 100) : 0;

    // Fetch member count based on tier filter
    let membersQuery = supabase
      .from('profiles')
      .select('membership_tier')
      .neq('membership_tier', walkInTier);
    
    if (memberTierFilter !== "all") {
      membersQuery = supabase
        .from('profiles')
        .select('membership_tier')
        .eq('membership_tier', memberTierFilter);
    }
    
    const { data: members } = await membersQuery;
    const memberCount = members?.length || 0;

    // Calculate member revenue based on filter
    const weeklyFees: Record<string, number> = {
      weekday: 15,
      birdie: 27,
      eagle: 35,
    };
    
    const { data: allMembers } = await supabase
      .from('profiles')
      .select('membership_tier')
      .neq('membership_tier', walkInTier);

    const weeklyTotal = allMembers?.reduce((sum, m) => {
      const fee = weeklyFees[m.membership_tier as string] || 0;
      return sum + fee;
    }, 0) || 0;

    let memberRevenue = weeklyTotal;
    if (memberRevenueFilter === "monthly") {
      memberRevenue = weeklyTotal * 4;
    } else if (memberRevenueFilter === "quarterly") {
      memberRevenue = weeklyTotal * 13;
    }

    // Calculate MoM growth
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');
    const currentDay = today.getDate();
    const currentMonthStart = format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd');
    const lastMonthStart = format(new Date(today.getFullYear(), today.getMonth() - 1, 1), 'yyyy-MM-dd');
    const lastMonthSameDay = format(new Date(today.getFullYear(), today.getMonth() - 1, currentDay), 'yyyy-MM-dd');

    const { data: currentMonthBookings } = await supabase
      .from('bookings')
      .select('duration_hours')
      .gte('booking_date', currentMonthStart)
      .lte('booking_date', todayStr)
      .neq('status', 'cancelled');

    const { data: lastMonthBookings } = await supabase
      .from('bookings')
      .select('duration_hours')
      .gte('booking_date', lastMonthStart)
      .lte('booking_date', lastMonthSameDay)
      .neq('status', 'cancelled');

    const currentMonthHours = currentMonthBookings?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
    const lastMonthHours = lastMonthBookings?.reduce((sum, b) => sum + b.duration_hours, 0) || 0;
    
    let momGrowth = 0;
    if (lastMonthHours > 0) {
      momGrowth = Math.round(((currentMonthHours - lastMonthHours) / lastMonthHours) * 100);
    } else if (currentMonthHours > 0) {
      momGrowth = 100;
    }

    setStats({
      bookings,
      revenue,
      occupancy,
      memberCount,
      memberRevenue,
      momGrowth,
    });
    setLoadingStats(false);
  };

  // Fetch stats on mount and when filters change
  useEffect(() => {
    if (isAdmin) {
      fetchStats();
    }
  }, [isAdmin, bookingsFilter, revenueFilter, occupancyFilter, memberTierFilter, memberRevenueFilter]);

  // Auto-refresh every 30 seconds (silent refresh - no loading indicator)
  useEffect(() => {
    if (!isAdmin) return;
    
    const interval = setInterval(() => {
      fetchStats(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isAdmin, bookingsFilter, revenueFilter, occupancyFilter, memberTierFilter, memberRevenueFilter]);

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6 space-y-6">
          <Skeleton className="h-10 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const FilterDropdown = <T extends string>({
    value,
    onChange,
    options,
    labels,
  }: {
    value: T;
    onChange: (value: T) => void;
    options: T[];
    labels: Record<T, string>;
  }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
          {labels[value]}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-background">
        {options.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => onChange(option)}
            className={value === option ? "bg-muted" : ""}
          >
            {labels[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const getMemberRevenueLabel = () => {
    switch (memberRevenueFilter) {
      case "weekly":
        return "/wk";
      case "monthly":
        return "/mo";
      case "quarterly":
        return "/qtr";
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Overview of your business
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Bookings
                </CardTitle>
                <FilterDropdown
                  value={bookingsFilter}
                  onChange={setBookingsFilter}
                  options={["today", "week", "month", "quarter"]}
                  labels={timeFilterLabels}
                />
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-display">{stats.bookings}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue
                </CardTitle>
                <FilterDropdown
                  value={revenueFilter}
                  onChange={setRevenueFilter}
                  options={["today", "week", "month", "quarter"]}
                  labels={timeFilterLabels}
                />
              </div>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-display">${stats.revenue.toFixed(0)}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Occupancy
                </CardTitle>
                <FilterDropdown
                  value={occupancyFilter}
                  onChange={setOccupancyFilter}
                  options={["today", "week", "month", "quarter"]}
                  labels={timeFilterLabels}
                />
              </div>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-display">{stats.occupancy}%</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Member Count
                </CardTitle>
                <FilterDropdown
                  value={memberTierFilter}
                  onChange={setMemberTierFilter}
                  options={["all", ...memberTiers.map((t) => t.tier)]}
                  labels={memberTierLabels}
                />
              </div>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="text-2xl font-display">{stats.memberCount}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Member Revenue
                </CardTitle>
                <FilterDropdown
                  value={memberRevenueFilter}
                  onChange={setMemberRevenueFilter}
                  options={["weekly", "monthly", "quarterly"]}
                  labels={memberRevenueLabels}
                />
              </div>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-display">${stats.memberRevenue}{getMemberRevenueLabel()}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                MoM Growth
              </CardTitle>
              <Repeat className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className={`text-2xl font-display ${stats.momGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stats.momGrowth >= 0 ? '+' : ''}{stats.momGrowth}%
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/timetable'}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-medium">View Timetable</h3>
                <p className="text-sm text-muted-foreground">Manage bay bookings and schedule</p>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => window.location.href = '/admin/customers'}>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-accent/10">
                <Users className="h-6 w-6 text-accent" />
              </div>
              <div>
                <h3 className="font-medium">Manage Customers</h3>
                <p className="text-sm text-muted-foreground">View and edit customer details</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
