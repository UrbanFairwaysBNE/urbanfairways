import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useAnalyticsData, AnalyticsTimeframe } from "@/hooks/useAnalyticsData";
import { GrowthMetricCard } from "@/components/admin/analytics/GrowthMetricCard";
import { RevenueChart } from "@/components/admin/analytics/RevenueChart";
import { CustomerEngagementChart } from "@/components/admin/analytics/CustomerEngagementChart";
import { DayOfWeekChart } from "@/components/admin/analytics/DayOfWeekChart";
import { HourlyHeatmap } from "@/components/admin/analytics/HourlyHeatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TIMEFRAME_OPTIONS: { value: AnalyticsTimeframe; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "6m", label: "Last 6 Months" },
  { value: "12m", label: "Last 12 Months" },
  { value: "all", label: "All Time" },
];

export default function AdminAnalytics() {
  const { isAdmin, isLoading: authLoading } = useAdminAuth();
  const [timeframe, setTimeframe] = useState<AnalyticsTimeframe>("30d");
  const { data, isLoading, refetch, isFetching } = useAnalyticsData(timeframe);

  if (authLoading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) return null;

  // Calculate trend for new customers
  const customerTrend = data
    ? data.newCustomersLastWeek > 0
      ? ((data.newCustomersThisWeek - data.newCustomersLastWeek) / data.newCustomersLastWeek) * 100
      : data.newCustomersThisWeek > 0
      ? 100
      : 0
    : 0;
  const customerTrendDirection = customerTrend > 0 ? "up" : customerTrend < 0 ? "down" : "neutral";

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold uppercase tracking-wide">
              Analytics
            </h1>
            <p className="text-sm text-muted-foreground">
              Key performance metrics for {tenant.venue_name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={timeframe} onValueChange={(v) => setTimeframe(v as AnalyticsTimeframe)}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEFRAME_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {isLoading || !data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-[350px]" />
              <Skeleton className="h-[350px]" />
            </div>
          </div>
        ) : (
          <>
            {/* Growth Metrics */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Growth Metrics
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <GrowthMetricCard
                  title="New Customers"
                  value={data.newCustomersThisWeek}
                  subtitle={TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label || ""}
                  trend={customerTrendDirection}
                  trendValue={`${customerTrend > 0 ? "+" : ""}${customerTrend.toFixed(0)}% vs prev period`}
                />
                <GrowthMetricCard
                  title="Return Rate"
                  value={`${data.returnRate.toFixed(1)}%`}
                  subtitle="Customers with 2+ bookings"
                  target="15%"
                />
                <GrowthMetricCard
                  title="Member Conversion"
                  value={`${data.memberConversionRate.toFixed(1)}%`}
                  subtitle="Visitors → Members"
                  target="10%"
                />
                <GrowthMetricCard
                  title="Churn Rate"
                  value={`${data.churnRate.toFixed(1)}%`}
                  subtitle="Members cancelled"
                  trend={data.churnRate < 5 ? "up" : "down"}
                  trendValue={data.churnRate < 5 ? "Good" : "High"}
                />
              </div>
            </div>

            {/* Revenue & Averages */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Revenue Health
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <RevenueChart data={data.monthlyRevenue} />
                </div>
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base font-medium">
                        Booking Averages
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Booking Value</p>
                        <p className="text-2xl font-bold">
                          ${data.avgBookingValue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Avg Session Duration</p>
                        <p className="text-2xl font-bold">
                          {data.avgSessionDuration.toFixed(1)} hrs
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Customers</p>
                        <p className="text-2xl font-bold">
                          {data.totalCustomers.toLocaleString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>

            {/* Customer Engagement */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Customer Engagement
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <CustomerEngagementChart data={data.bookingFrequency} />
                <DayOfWeekChart data={data.dayOfWeekUtilization} />
              </div>
            </div>

            {/* Referral Sources */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                How New Customers Found Us
              </h2>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-medium">
                    Referral Sources
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      New customers in {TIMEFRAME_OPTIONS.find(o => o.value === timeframe)?.label.toLowerCase()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {data.referralSources.every(r => r.count === 0) && data.referralUnknown === 0 ? (
                    <p className="text-sm text-muted-foreground">No new customers in this period.</p>
                  ) : (
                    <div className="space-y-3">
                      {data.referralSources.map((r) => (
                        <div key={r.source} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{r.label}</span>
                            <span className="text-muted-foreground">
                              {r.count} ({r.percentage.toFixed(1)}%)
                            </span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${r.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {data.referralUnknown > 0 && (
                        <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                          {data.referralUnknown} new customer{data.referralUnknown === 1 ? "" : "s"} without a recorded source (not included in percentages).
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Operational Insights */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                Operational Insights
              </h2>
              <HourlyHeatmap data={data.hourlyHeatmap} />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
