import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { LogOut, Calendar, Settings, ClipboardList, Trophy, Lock, Users, Info, Megaphone, Plus, Trash2, CalendarDays, GraduationCap } from "lucide-react";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import { usePricing } from "@/hooks/usePricing";
import swingLabBadge from "@/assets/uf-lab-circle-light.png";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/query-keys";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLocalCompSettings } from "@/hooks/useLocalCompSettings";
import { useTranslation } from "react-i18next";

type MembershipTier = string;

const Dashboard = () => {
  const { t } = useTranslation(["dashboard", "common"]);
  const { tenant } = useTenant();
  const { hasLeagueAccess: hasLeagueTierAccess, hasRangeAccess: hasRangeTierAccess } = usePricing();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { compEnabled } = useLocalCompSettings();
  const [membershipTier, setMembershipTier] = useState<MembershipTier>("casual");
  const [membershipOnHold, setMembershipOnHold] = useState(false);
  const [hasSgtAccount, setHasSgtAccount] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountAccessLoading, setAccountAccessLoading] = useState(true);
  const [whatsOnOpen, setWhatsOnOpen] = useState(false);
  const [leagueGuideOpen, setLeagueGuideOpen] = useState(false);
  
  const [showEventForm, setShowEventForm] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDesc, setNewEventDesc] = useState("");
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventRecurring, setNewEventRecurring] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const [isStaff, setIsStaff] = useState(false);
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchAccountAccess = async () => {
      if (!user) {
        setMembershipTier("casual");
        setMembershipOnHold(false);
        setHasSgtAccount(false);
        setIsStaff(false);
        setIsCoach(false);
        setIsAdmin(false);
        setAccountAccessLoading(false);
        return;
      }

      setAccountAccessLoading(true);

      try {
        const [profileResult, adminResult] = await Promise.all([
          supabase
            .from("profiles")
            .select("membership_tier, sgt_user_id, membership_on_hold, custom_segment, is_coach")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.rpc('has_role', {
            _user_id: user.id,
            _role: 'admin'
          }),
        ]);

        if (cancelled) return;

        const profile = profileResult.data;
        setMembershipTier((profile?.membership_tier as MembershipTier) || "casual");
        setMembershipOnHold(!!profile?.membership_on_hold);
        setHasSgtAccount(!!profile?.sgt_user_id);
        setIsStaff((profile as any)?.custom_segment === "staff");
        setIsCoach(!!(profile as any)?.is_coach);
        setIsAdmin(!!adminResult.data);
      } catch (error) {
        if (!cancelled) {
          console.error("Error fetching account access:", error);
          setMembershipTier("casual");
          setMembershipOnHold(false);
          setHasSgtAccount(false);
          setIsStaff(false);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) setAccountAccessLoading(false);
      }
    };

    fetchAccountAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.BAYS,
      queryFn: async () => {
        const { data } = await supabase.from("bays").select("*").eq("is_active", true).order("bay_number");
        return data || [];
      },
      staleTime: STALE_TIMES.STATIC,
    });
    queryClient.prefetchQuery({
      queryKey: QUERY_KEYS.PRICING,
      queryFn: async () => {
        const { data } = await supabase.from("pricing_config").select("*").order("display_order");
        return data || [];
      },
      staleTime: STALE_TIMES.STATIC,
    });
  }, [queryClient]);

  const { data: events = [] } = useQuery({
    queryKey: ["whats-on-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("whats_on_events")
        .select("*")
        .eq("is_active", true)
        .order("event_date", { ascending: true, nullsFirst: false });
      return data || [];
    },
  });

  const addEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("whats_on_events").insert({
        title: newEventTitle,
        description: newEventDesc || null,
        event_date: newEventRecurring ? null : (newEventDate || null),
        is_recurring: newEventRecurring,
        created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whats-on-events"] });
      setNewEventTitle("");
      setNewEventDesc("");
      setNewEventDate("");
      setNewEventRecurring(false);
      setShowEventForm(false);
      toast({ title: t("dashboard:eventAdded") });
    },
  });

  const removeEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("whats_on_events").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whats-on-events"] });
      toast({ title: t("dashboard:eventRemoved") });
    },
  });

  const handleSignOut = async () => {
    setMembershipTier("casual");
    setMembershipOnHold(false);
    setHasSgtAccount(false);
    setIsAdmin(false);
    setAccountAccessLoading(false);
    await signOut();
    navigate("/", { replace: true });
  };

  if (isLoading || (isAuthenticated && accountAccessLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">{t("common:loading")}</div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const firstName = user?.user_metadata?.first_name || t("dashboard:defaultName");
  const hasLeagueAccess = hasLeagueTierAccess(membershipTier) || isStaff || isAdmin;
  const hasRangeAccess = hasRangeTierAccess(membershipTier) || isStaff || isAdmin;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-primary py-4 px-6 flex items-center justify-between safe-area-top">
        <img src={venueLogo} alt={tenant.venue_name} className="h-7 sm:h-10 w-auto" />
        <div className="flex items-center gap-2 sm:gap-4">
          <NotificationBell />
          {isAdmin && (
            <Button
              size="sm"
              onClick={() => navigate("/admin")}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Settings className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">{t("dashboard:admin")}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleSignOut}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 sm:p-6">
        <div className="container max-w-lg mx-auto">
          <h1 className="font-display text-3xl sm:text-4xl text-primary mb-5">
            {t("dashboard:welcome", { name: firstName.toUpperCase() })}
          </h1>

          <div className="grid grid-cols-1 gap-3">
            {/* Book a Bay */}
            {membershipOnHold ? (
              <div className="bg-card rounded-xl p-4 shadow-sm border border-amber-300 bg-amber-50/50">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <h2 className="font-semibold text-base">{t("dashboard:bookBay")}</h2>
                    <p className="text-xs text-amber-700">{t("dashboard:membershipOnHold")}</p>
                  </div>
                  <Lock className="h-4 w-4 text-amber-500" />
                </div>
              </div>
            ) : (
              <button
                onClick={() => navigate("/booking")}
                className="bg-card rounded-xl p-4 shadow-sm border border-border hover:border-accent/50 hover:shadow-md transition-all text-left active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <Calendar className="h-5 w-5 text-accent" />
                  </div>
                  <h2 className="font-semibold text-base">{t("dashboard:bookBay")}</h2>
                </div>
              </button>
            )}

            {/* Book a Lesson (coaches only) */}
            {isCoach && (
              <button
                onClick={() => navigate("/booking?mode=lesson")}
                className="bg-card rounded-xl p-4 shadow-sm border border-border hover:border-accent/50 hover:shadow-md transition-all text-left active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <GraduationCap className="h-5 w-5 text-accent" />
                  </div>
                  <h2 className="font-semibold text-base">{t("dashboard:bookLesson")}</h2>
                </div>
              </button>
            )}

            {/* My Bookings */}
            <button
              onClick={() => navigate("/my-bookings")}
              className="bg-card rounded-xl p-4 shadow-sm border border-border hover:border-accent/50 hover:shadow-md transition-all text-left active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <ClipboardList className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-base">{t("dashboard:myBookings")}</h2>
              </div>
            </button>

            {/* UF Lab */}
            <button
              onClick={() => hasRangeAccess ? navigate("/swing-lab") : navigate("/membership")}
              className={`bg-card rounded-xl p-4 shadow-sm border text-left active:scale-[0.98] transition-all relative ${
                hasRangeAccess ? "border-border hover:border-accent/50 hover:shadow-md" : "border-border opacity-60"
              }`}
            >
              {!hasRangeAccess && (
                <div className="absolute top-3 right-3 flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                  <span>{t("common:members")}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <img
                  src={swingLabBadge}
                  alt="UF Lab"
                  className="h-12 w-12 rounded-full object-cover shrink-0"
                />
                <h2 className={`font-semibold text-base ${hasRangeAccess ? "" : "text-muted-foreground"}`}>{t("dashboard:ufLab")}</h2>
              </div>
            </button>

            {/* League */}
            <button
              onClick={() => hasLeagueAccess ? navigate(hasSgtAccount ? "/league" : "/league/register") : navigate("/membership")}
              className={`bg-card rounded-xl p-4 shadow-sm border text-left active:scale-[0.98] transition-all relative ${
                hasLeagueAccess ? "border-league-primary/30 hover:border-league-primary/60 hover:shadow-md" : "border-border opacity-60"
              }`}
            >
              {!hasLeagueAccess && (
                <div className="absolute top-3 right-3 flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Lock className="h-3 w-3" />
                  <span>{t("common:members")}</span>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLeagueGuideOpen(true); }}
                className="absolute top-3 right-3 h-6 w-6 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                style={!hasLeagueAccess ? { right: "5.5rem" } : {}}
                title={t("dashboard:leagueGuideTitle", { venue: tenant.venue_name })}
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${hasLeagueAccess ? "bg-league-primary/15" : "bg-muted"}`}>
                  <Trophy className={`h-5 w-5 ${hasLeagueAccess ? "text-league-primary-dark" : "text-muted-foreground"}`} />
                </div>
                <h2 className="font-semibold text-base">{t("dashboard:ufLeague")}</h2>
              </div>
            </button>

            {/* Weekly Comp */}
            {compEnabled && (
              <button
                onClick={() => navigate("/comp")}
                className="bg-card rounded-xl p-4 shadow-sm border border-primary/30 hover:border-primary/60 hover:shadow-md transition-all text-left active:scale-[0.98]"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <h2 className="font-semibold text-base">{t("dashboard:weeklyComp")}</h2>
                </div>
              </button>
            )}

            {/* What's On */}
            <button
              onClick={() => setWhatsOnOpen(true)}
              className="bg-card rounded-xl p-4 shadow-sm border border-accent/30 hover:border-accent/60 hover:shadow-md transition-all text-left active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Megaphone className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-base">{t("dashboard:whatsOn")}</h2>
              </div>
            </button>

            {/* My Account */}
            <button
              onClick={() => navigate("/my-account")}
              className="bg-card rounded-xl p-4 shadow-sm border border-border hover:border-accent/50 hover:shadow-md transition-all text-left active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Settings className="h-5 w-5 text-accent" />
                </div>
                <h2 className="font-semibold text-base">{t("dashboard:myAccount")}</h2>
              </div>
            </button>

          </div>
        </div>
      </main>

      {/* What's On Sheet */}
      <Sheet open={whatsOnOpen} onOpenChange={setWhatsOnOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader className="flex flex-row items-center justify-between pr-2">
            <SheetTitle className="flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-accent" />
              {t("dashboard:whatsOn")}
            </SheetTitle>
            {isAdmin && (
              <button
                onClick={() => setShowEventForm(!showEventForm)}
                className="h-8 w-8 rounded-full bg-accent/10 hover:bg-accent/20 flex items-center justify-center transition-colors"
              >
                <Plus className="h-4 w-4 text-accent" />
              </button>
            )}
          </SheetHeader>

          <div className="mt-4 space-y-3">
            {/* Admin add form */}
            {isAdmin && showEventForm && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <Input
                  placeholder={t("dashboard:eventTitle")}
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="h-9 text-sm"
                />
                <Input
                  placeholder={t("dashboard:eventDescription")}
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="h-9 text-sm"
                />
                <div className="flex items-center gap-3">
                  <Label htmlFor="recurring" className="text-sm">Recurring</Label>
                  <Switch
                    id="recurring"
                    checked={newEventRecurring}
                    onCheckedChange={setNewEventRecurring}
                  />
                </div>
                {!newEventRecurring && (
                  <Input
                    type="date"
                    value={newEventDate}
                    onChange={(e) => setNewEventDate(e.target.value)}
                    className="h-9 text-sm"
                  />
                )}
                <Button
                  size="sm"
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={!newEventTitle.trim() || addEvent.isPending}
                  onClick={() => addEvent.mutate()}
                >
                  {t("dashboard:addEvent")}
                </Button>
              </div>
            )}

            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">{t("dashboard:noEvents")}</p>
            ) : (
              events.map((event: any) => (
                <div key={event.id} className="flex items-start gap-3 p-3 bg-card rounded-lg border border-border group">
                  <div className="h-9 w-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 mt-0.5">
                    <CalendarDays className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{event.description}</p>
                    )}
                    {event.is_recurring ? (
                      <p className="text-xs text-accent font-medium mt-1">{t("dashboard:recurring")}</p>
                    ) : event.event_date ? (
                      <p className="text-xs text-accent font-medium mt-1">
                        {new Date(event.event_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                      </p>
                    ) : null}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => removeEvent.mutate(event.id)}
                      className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded flex items-center justify-center hover:bg-destructive/10 transition-all shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>


      <Dialog open={leagueGuideOpen} onOpenChange={setLeagueGuideOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-league-primary-dark" />
              {t("dashboard:leagueGuideTitle", { venue: tenant.venue_name })}
            </DialogTitle>
          </DialogHeader>
          <ol className="space-y-3 text-sm text-foreground list-decimal pl-5">
            {["leagueGuideStep1", "leagueGuideStep2", "leagueGuideStep3", "leagueGuideStep4", "leagueGuideStep5"].map((key) => (
              <li
                key={key}
                dangerouslySetInnerHTML={{ __html: t(`dashboard:${key}`, { venue: tenant.venue_name }) }}
              />
            ))}
          </ol>
          <div className="mt-4 rounded-lg border border-brand-accent/30 bg-brand-accent/10 p-3">
            <p className="text-xs font-semibold text-brand-accent mb-1">{t("dashboard:topTip")}</p>
            <p
              className="text-sm text-foreground"
              dangerouslySetInnerHTML={{ __html: t("dashboard:leagueGuideTip") }}
            />
          </div>

        </DialogContent>
      </Dialog>

      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {tenant.venue_name}. {t("common:allRightsReserved")}
        </p>
      </footer>
    </div>
  );
};

export default Dashboard;
