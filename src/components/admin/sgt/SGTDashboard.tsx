import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Calendar, Users, FileText, RefreshCw, MapPin, Mail, Bell, Zap, Clock, UserPlus, CalendarPlus, Settings2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { useTenant } from "@/config/tenant";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TourFormDialog } from "./TourFormDialog";
import { TournamentFormDialog } from "./TournamentFormDialog";

export function SGTDashboard() {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [showTourDialog, setShowTourDialog] = useState(false);
  const [showTournamentDialog, setShowTournamentDialog] = useState(false);

  // Fetch tour count
  const { data: toursData } = useQuery({
    queryKey: ["sgt-tours-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tours")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch active tours count
  const { data: activeToursData } = useQuery({
    queryKey: ["sgt-active-tours-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tours")
        .select("*", { count: "exact", head: true })
        .eq("active", 1);
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch tournament count
  const { data: tournamentsData } = useQuery({
    queryKey: ["sgt-tournaments-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_tournaments")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch member count
  const { data: membersData } = useQuery({
    queryKey: ["sgt-members-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_members")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch scorecard count
  const { data: scorecardsData } = useQuery({
    queryKey: ["sgt-scorecards-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_scorecards")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch course count
  const { data: coursesData } = useQuery({
    queryKey: ["sgt-courses-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_courses")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch recent tournaments
  const { data: recentTournaments } = useQuery({
    queryKey: ["sgt-recent-tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("*")
        .order("start_date", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
  });

  // Fetch tours for creation dialogs
  const { data: toursForDialog } = useQuery({
    queryKey: ["sgt-tours-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch notification settings
  const { data: notificationSettings } = useQuery({
    queryKey: ["sgt-notification-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_notification_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Mutation to update notification settings
  const updateNotificationMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      // Check if settings row exists
      const { data: existing } = await supabase
        .from("sgt_notification_settings")
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("sgt_notification_settings")
          .update({ 
            new_member_email_enabled: enabled,
            updated_at: new Date().toISOString()
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("sgt_notification_settings")
          .insert({ new_member_email_enabled: enabled });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-notification-settings"] });
      toast({
        title: "Settings updated",
        description: "Notification preferences saved.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update settings",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("sgt-sync");
      if (error) throw error;
      toast({
        title: "Sync started",
        description: "SGT data sync has been triggered.",
      });
    } catch (error) {
      toast({
        title: "Sync failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };




  const stats = [
    {
      title: "Total Tours",
      value: toursData ?? 0,
      subtitle: `${activeToursData ?? 0} active`,
      icon: Trophy,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10",
    },
    {
      title: "Tournaments",
      value: tournamentsData ?? 0,
      subtitle: "All time",
      icon: Calendar,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Members",
      value: membersData ?? 0,
      subtitle: "Registered",
      icon: Users,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Scorecards",
      value: scorecardsData ?? 0,
      subtitle: "Recorded",
      icon: FileText,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Courses",
      value: coursesData ?? 0,
      subtitle: "Available",
      icon: MapPin,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Action Buttons */}
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex gap-2">
          <Button onClick={() => setShowTourDialog(true)} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            New Tour
          </Button>
          <Button onClick={() => setShowTournamentDialog(true)} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            New Tournament
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSync} disabled={syncing} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync Data"}
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.subtitle}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Tournaments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Tournaments</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTournaments && recentTournaments.length > 0 ? (
            <div className="space-y-3">
              {recentTournaments.map((tournament) => (
                <div
                  key={tournament.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{tournament.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {tournament.course_name || "No course"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        tournament.status === "Completed"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : tournament.status === "Active"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                      }`}
                    >
                      {tournament.status}
                    </span>
                    {tournament.start_date && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(tournament.start_date), "MMM d, yyyy")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No tournaments found</p>
          )}
        </CardContent>
      </Card>

      {/* Automation Rules Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            <CardTitle>Automation Rules</CardTitle>
          </div>
          <CardDescription>
            These rules run automatically in the background
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tournament Start Day Registration */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 mt-0.5">
                <CalendarPlus className="h-4 w-4 text-blue-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Tournament Start Day Registration</h4>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    6:00 AM (Brisbane)
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Runs on the morning of each tournament start date. Registers all tour members for that tournament.
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                  <li>Uses <strong>Custom HCP</strong> if set, otherwise uses <strong>Combo HCP</strong></li>
                  <li>Uses tournament default tees</li>
                  <li>Only runs on tournament start dates (typically Sundays)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* New Member Onboarding Registration */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-green-500/10 mt-0.5">
                <UserPlus className="h-4 w-4 text-green-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">New Member Onboarding</h4>
                  <Badge variant="secondary" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    Instant
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  When you onboard a new member (set their handicap in Pending Onboarding), they are registered for the <strong>current tournament only</strong>.
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                  <li>Triggered immediately when member is added to a tour</li>
                  <li>Registers only for the current active tournament</li>
                  <li>Future tournaments: member is included in the start-day auto-registration</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Tournament Auto-Close */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-500/10 mt-0.5">
                <Calendar className="h-4 w-4 text-red-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Tournament Auto-Close</h4>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Every 4 hours
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically closes tournaments when their end date has passed.
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                  <li><strong>Always awards tour standings points</strong> when closing</li>
                  <li>Runs during the regular data sync</li>
                  <li>Updates player handicaps after closing</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Data Sync */}
          <div className="p-4 rounded-lg border bg-card">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 mt-0.5">
                <RefreshCw className="h-4 w-4 text-purple-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Data Sync</h4>
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Every 4 hours
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Syncs tours, tournaments, standings, and scorecards from SGT platform to local cache.
                </p>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1 ml-4 list-disc">
                  <li>Updates player Combo HCP when tournaments complete</li>
                  <li>Refreshes monthly standings for leaderboards</li>
                  <li>Manual sync available via button above</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Handicap Override Rule */}
          <div className="p-4 rounded-lg border bg-muted/50">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 mt-0.5">
                <Settings2 className="h-4 w-4 text-amber-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium">Handicap Override Rule</h4>
                  <Badge variant="outline" className="text-xs">Logic</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  <strong>Custom HCP always overrides Combo HCP</strong> when set. This allows you to manually adjust handicaps for players who are struggling or whose SGT handicap isn't quite right.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  To use SGT's Combo HCP for a player, simply clear their Custom HCP in the Members tab.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notification Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle>Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure email notifications for SGT events
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div>
                <Label htmlFor="new-member-email" className="text-sm font-medium">
                  New Member Email
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Receive an email when a new member joins the {tenant.venue_name} League
                </p>
              </div>
            </div>
            <Switch
              id="new-member-email"
              checked={notificationSettings?.new_member_email_enabled ?? false}
              onCheckedChange={(checked) => updateNotificationMutation.mutate(checked)}
              disabled={updateNotificationMutation.isPending}
            />
          </div>
          <p className="text-xs text-muted-foreground px-1">
            Notifications are sent to <strong className="text-primary">{tenant.admin_alert_email}</strong> when members register via the app. 
            The sync also sends notifications when externally-registered members are auto-linked by email match.
          </p>
        </CardContent>
      </Card>

      {/* Creation Dialogs */}
      <TourFormDialog 
        open={showTourDialog} 
        onOpenChange={setShowTourDialog} 
      />
      <TournamentFormDialog
        open={showTournamentDialog}
        onOpenChange={setShowTournamentDialog}
        tours={toursForDialog || []}
      />
    </div>
  );
}
