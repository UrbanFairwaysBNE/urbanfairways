import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trophy, Award, Calendar, DollarSign, Mail, CheckCircle2, Clock, User, ChevronDown, ChevronUp, Send } from "lucide-react";
import { format } from "date-fns";
import { getRecentBlockLabels } from "@/lib/league-block";
import { useTenant, formatTenantAddress, type TenantSettings } from "@/config/tenant";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface WeeklyPrize {
  id: string;
  tournament_id: number;
  player_id: number;
  player_name: string;
  profile_user_id: string | null;
  prize_amount: number;
  awarded_at: string;
  email_sent: boolean;
  status: string;
}

interface MonthlyAward {
  id: string;
  tour_id: number;
  month: string;
  winner_player_name: string;
  winner_player_id: number | null;
  prize_description: string | null;
  awarded_at: string;
  notes: string | null;
}

interface Tournament {
  tournament_id: number;
  name: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface Scorecard {
  player_id: number;
  player_name: string;
  to_par_net: number | null;
  total_net: number;
  round: number | null;
  out_gross: number | null;
  in_gross: number | null;
}

interface AggregatedPlayer {
  player_id: number;
  player_name: string;
  total_net_sum: number;
  to_par_net_sum: number;
  rounds_completed: number;
  isDNF: boolean;
}

interface MonthlyStanding {
  player_id: number;
  player_name: string;
  total_net_score: number | null;
  tournaments_played: number;
  net_position: number | null;
}

// Default email template for monthly winners
const buildDefaultMonthlyEmailTemplate = (t: TenantSettings) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${t.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
  <!-- HEADER -->
  <tr>
    <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
      <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="${t.venue_name}" style="display:block; width:140px; height:auto; border:0;" />
    </td>
  </tr>
  <!-- BODY -->
  <tr>
    <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
      <h1 style="margin:0 0 18px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
        🏆 MONTHLY WINNER!
      </h1>
      <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:18px; color:#1F4C25;">
        Congratulations <strong>{{first_name}}</strong>!
      </p>
      <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
        You've been crowned the <strong>{{month}}</strong> ${t.venue_name} Tour Champion! Your consistent play throughout the month has earned you this well-deserved recognition.
      </p>
      <div style="background-color:#ffffff; border:1px solid rgba(31,76,37,0.15); border-radius:12px; padding:20px; margin:22px 0; text-align:center;">
        <p style="font-size:14px; color:#1F4C25; margin:0 0 8px 0; font-family:Inter, Arial, sans-serif; opacity:0.75;">Your Prize</p>
        <p style="font-family:Anton, Impact, Arial Black, sans-serif; font-size:28px; color:#EC622D; margin:0;">{{prize_description}}</p>
      </div>
      <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
        Pop in next time you're at ${t.venue_name} to collect your prize. Keep up the great golf!
      </p>
      <p style="margin:24px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; color:#1F4C25;">
        See you on the virtual fairways,<br>
        <strong>The ${t.venue_name} Team</strong>
      </p>
    </td>
  </tr>
  <!-- FOOTER -->
  <tr>
    <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="padding-bottom:14px;">
            <a href="${t.socials?.instagram || '#'}" style="margin:0 8px; text-decoration:none;">
              <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
            </a>
            <a href="${t.socials?.facebook || '#'}" style="margin:0 8px; text-decoration:none;">
              <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
            </a>
          </td>
        </tr>
        <tr>
          <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
            <div><a href="https://maps.google.com/?q=${encodeURIComponent(formatTenantAddress(t))}" style="color:#FFFFFF; text-decoration:underline;">${formatTenantAddress(t)}</a></div>
            <div><a href="tel:${t.support_phone}" style="color:#FFFFFF; text-decoration:underline;">${t.support_phone}</a></div>
            <div><a href="https://${t.booking_domain}" style="color:#FFFFFF; text-decoration:underline;">${t.booking_domain}</a></div>
            <div style="margin-top:10px; font-size:12px; opacity:0.75;">© ${t.venue_name}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;

export function SGTWinners() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  
  // Weekly prize approval state
  const [selectedTournamentForApproval, setSelectedTournamentForApproval] = useState<number | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<{ playerId: number; playerName: string } | null>(null);
  
  // Monthly prize approval state
  const [monthlyApprovalOpen, setMonthlyApprovalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedMonthlyWinner, setSelectedMonthlyWinner] = useState<{ playerId: number; playerName: string } | null>(null);
  const [monthlyPrizeDescription, setMonthlyPrizeDescription] = useState("");
  const [monthlyEmailSubject, setMonthlyEmailSubject] = useState("");
  const [monthlyEmailHtml, setMonthlyEmailHtml] = useState(() => buildDefaultMonthlyEmailTemplate(tenant));

  // Fetch weekly prizes (approved only for the history section)
  const { data: weeklyPrizes, isLoading: loadingWeekly } = useQuery({
    queryKey: ["sgt-weekly-prizes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_weekly_prizes")
        .select("*")
        .eq("status", "approved")
        .order("awarded_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as WeeklyPrize[];
    },
  });

  // Fetch completed tournaments that need prize approval (only from Feb 2026 onwards)
  const { data: completedTournaments, isLoading: loadingCompleted } = useQuery({
    queryKey: ["sgt-completed-tournaments-pending"],
    queryFn: async () => {
      // Only show tournaments from February 2026 onwards (when prizes started)
      const prizeStartDate = "2026-02-01";
      
      // Get today's date in Brisbane timezone (proper timezone API, no manual offset)
      const todayBrisbane = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Australia/Brisbane",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      
      const { data: tournaments, error: tournError } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name, status, start_date, end_date")
        .in("status", ["Completed", "In Progress", "Active"])
        .gte("start_date", prizeStartDate)
        .lte("end_date", todayBrisbane)
        .order("end_date", { ascending: false })
        .limit(20);
      
      if (tournError) throw tournError;

      const { data: prizes, error: prizeError } = await supabase
        .from("sgt_weekly_prizes")
        .select("tournament_id")
        .eq("status", "approved");
      
      if (prizeError) throw prizeError;

      const awardedTournamentIds = new Set(prizes?.map(p => p.tournament_id) || []);
      return (tournaments || []).filter(t => !awardedTournamentIds.has(t.tournament_id)) as Tournament[];
    },
  });

  // Fetch leaderboard for selected tournament
  const { data: tournamentLeaderboard, isLoading: loadingLeaderboard } = useQuery({
    queryKey: ["sgt-tournament-leaderboard", selectedTournamentForApproval],
    queryFn: async () => {
      if (!selectedTournamentForApproval) return [];

      const { data, error } = await supabase
        .from("sgt_scorecards")
        .select("player_id, player_name, to_par_net, total_net, round, out_gross, in_gross")
        .eq("tournament_id", selectedTournamentForApproval)
        .order("to_par_net", { ascending: true });
      
      if (error) throw error;
      
      // Aggregate by player: sum total_net across complete 18-hole rounds
      const playerMap = new Map<number, AggregatedPlayer>();
      
      for (const card of (data as Scorecard[])) {
        const isComplete18 = (card.out_gross ?? 0) > 0 && (card.in_gross ?? 0) > 0;
        
        if (!playerMap.has(card.player_id)) {
          playerMap.set(card.player_id, {
            player_id: card.player_id,
            player_name: card.player_name,
            total_net_sum: 0,
            to_par_net_sum: 0,
            rounds_completed: 0,
            isDNF: false,
          });
        }
        
        const entry = playerMap.get(card.player_id)!;
        if (isComplete18) {
          entry.total_net_sum += card.total_net;
          entry.to_par_net_sum += (card.to_par_net ?? 0);
          entry.rounds_completed += 1;
        }
      }
      
      // Mark players with < 2 complete rounds as DNF
      const aggregated = Array.from(playerMap.values()).map(p => ({
        ...p,
        isDNF: p.rounds_completed < 2,
      }));
      
      // Sort: non-DNF first by to_par_net_sum ascending (lowest to-par wins), then DNF players
      aggregated.sort((a, b) => {
        if (a.isDNF && !b.isDNF) return 1;
        if (!a.isDNF && b.isDNF) return -1;
        return a.to_par_net_sum - b.to_par_net_sum;
      });
      
      return aggregated;
    },
    enabled: !!selectedTournamentForApproval,
  });

  // Fetch monthly standings for the selected month
  const { data: monthlyStandings, isLoading: loadingMonthlyStandings } = useQuery({
    queryKey: ["sgt-monthly-standings-for-approval", selectedMonth],
    queryFn: async () => {
      if (!selectedMonth) return [];

      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("player_id, player_name, total_net_score, tournaments_played, net_position")
        .eq("month", selectedMonth)
        .order("net_position", { ascending: true });
      
      if (error) throw error;
      return data as MonthlyStanding[];
    },
    enabled: !!selectedMonth,
  });

  // Fetch monthly awards
  const { data: monthlyAwards, isLoading: loadingMonthly } = useQuery({
    queryKey: ["sgt-monthly-awards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_monthly_awards")
        .select("*")
        .order("awarded_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as MonthlyAward[];
    },
  });

  // Get months that have standings but no award yet
  const { data: pendingMonths } = useQuery({
    queryKey: ["sgt-pending-months"],
    queryFn: async () => {
      // Get all months with standings
      const { data: standingsMonths, error: standingsError } = await supabase
        .from("sgt_monthly_standings")
        .select("month")
        .order("month", { ascending: false });
      
      if (standingsError) throw standingsError;

      // Get all months with awards
      const { data: awardedMonths, error: awardsError } = await supabase
        .from("sgt_monthly_awards")
        .select("month");
      
      if (awardsError) throw awardsError;

      const awardedSet = new Set(awardedMonths?.map(a => a.month) || []);
      const uniqueMonths = [...new Set(standingsMonths?.map(s => s.month) || [])];
      
      return uniqueMonths.filter(m => !awardedSet.has(m));
    },
  });

  // Fetch tournaments for reference
  const { data: tournaments } = useQuery({
    queryKey: ["sgt-tournaments-for-prizes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name, status, start_date")
        .order("start_date", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as Tournament[];
    },
  });

  // Fetch active tour
  const { data: activeTour } = useQuery({
    queryKey: ["sgt-active-tour"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Approve weekly prize mutation
  const approvePrize = useMutation({
    mutationFn: async ({ tournamentId, playerId, playerName }: { tournamentId: number; playerId: number; playerName: string }) => {
      const { data, error } = await supabase.functions.invoke("approve-weekly-prize", {
        body: { tournamentId, playerId, playerName, prizeAmount: 40 },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-weekly-prizes"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-completed-tournaments-pending"] });
      setSelectedTournamentForApproval(null);
      setSelectedWinner(null);
      
      if (data.credited) {
        toast.success(`$40 credited to ${data.playerName}${data.emailSent ? " and email sent" : ""}`);
      } else {
        toast.success(`Prize recorded for ${data.playerName} (external player - no credit applied)`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve prize");
    },
  });

  // Approve monthly prize mutation
  const approveMonthlyPrize = useMutation({
    mutationFn: async () => {
      if (!activeTour || !selectedMonth || !selectedMonthlyWinner) {
        throw new Error("Missing required fields");
      }

      const { data, error } = await supabase.functions.invoke("approve-monthly-prize", {
        body: {
          tourId: activeTour.tour_id,
          month: selectedMonth,
          playerId: selectedMonthlyWinner.playerId,
          playerName: selectedMonthlyWinner.playerName,
          prizeDescription: monthlyPrizeDescription,
          emailSubject: monthlyEmailSubject || `Congratulations! You're the ${selectedMonth} Monthly Winner!`,
          emailHtml: monthlyEmailHtml,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-monthly-awards"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-pending-months"] });
      
      // Reset form
      setMonthlyApprovalOpen(false);
      setSelectedMonth("");
      setSelectedMonthlyWinner(null);
      setMonthlyPrizeDescription("");
      setMonthlyEmailSubject("");
      setMonthlyEmailHtml(buildDefaultMonthlyEmailTemplate(tenant));
      
      if (data.emailSent) {
        toast.success(`Monthly award sent to ${data.recipientEmail}`);
      } else {
        toast.success(`Monthly award recorded for ${data.playerName} (no email sent - player not linked)`);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to approve monthly prize");
    },
  });

  const getTournamentName = (tournamentId: number) => {
    const tournament = tournaments?.find(t => t.tournament_id === tournamentId);
    return tournament?.name || `Tournament #${tournamentId}`;
  };

  const formatScore = (score: number | null) => {
    if (score === null) return "-";
    if (score === 0) return "E";
    return score > 0 ? `+${score}` : `${score}`;
  };

  // Block-label options for the manual approval dropdown when no
  // pending months exist. Uses the 4-week block model (anchored to
  // 2026-03-01). Shows the last 6 blocks, newest first.
  const monthOptions = getRecentBlockLabels(6);

  return (
    <div className="space-y-6">
      {/* Pending Weekly Approvals Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            Pending Weekly Prize Approvals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingCompleted ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : !completedTournaments?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>All completed tournaments have been awarded</p>
            </div>
          ) : (
            <div className="space-y-4">
              {completedTournaments.map(tournament => (
                <div
                  key={tournament.tournament_id}
                  className="p-4 border rounded-lg bg-muted/30"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium">{tournament.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Ended: {tournament.end_date ? format(new Date(tournament.end_date), "dd MMM yyyy") : "Unknown"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-orange-600">
                      Needs Approval
                    </Badge>
                  </div>

                  {selectedTournamentForApproval === tournament.tournament_id ? (
                    <div className="space-y-3 pt-2 border-t">
                      <Label>Select Winner</Label>
                      {loadingLeaderboard ? (
                        <Skeleton className="h-10 w-full" />
                      ) : !tournamentLeaderboard?.length ? (
                        <p className="text-sm text-muted-foreground">No scorecards found for this tournament</p>
                      ) : (
                        <>
                          <Select
                            value={selectedWinner ? `${selectedWinner.playerId}` : undefined}
                            onValueChange={(value) => {
                              const player = tournamentLeaderboard.find(p => p.player_id === parseInt(value));
                              if (player) {
                                setSelectedWinner({ playerId: player.player_id, playerName: player.player_name });
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose the winner..." />
                            </SelectTrigger>
                            <SelectContent>
                              {tournamentLeaderboard.map((player, idx) => (
                                <SelectItem 
                                  key={player.player_id} 
                                  value={`${player.player_id}`}
                                  disabled={player.isDNF}
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-muted-foreground w-6">#{idx + 1}</span>
                                    <span className={player.isDNF ? "text-muted-foreground" : ""}>{player.player_name}</span>
                                    {player.isDNF ? (
                                      <Badge variant="outline" className="text-xs text-destructive border-destructive/30">DNF</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">
                                        ({player.to_par_net_sum === 0 ? "E" : player.to_par_net_sum > 0 ? `+${player.to_par_net_sum}` : player.to_par_net_sum} Net, {player.rounds_completed} rds)
                                      </span>
                                    )}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedTournamentForApproval(null);
                                setSelectedWinner(null);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={!selectedWinner || approvePrize.isPending}
                              onClick={() => {
                                if (selectedWinner) {
                                  approvePrize.mutate({
                                    tournamentId: tournament.tournament_id,
                                    playerId: selectedWinner.playerId,
                                    playerName: selectedWinner.playerName,
                                  });
                                }
                              }}
                            >
                              {approvePrize.isPending ? "Approving..." : "Approve $40 Credit"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedTournamentForApproval(tournament.tournament_id)}
                    >
                      <User className="h-4 w-4 mr-2" />
                      Select Winner
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Prize Approval Section */}
      <Card>
        <Collapsible open={monthlyApprovalOpen} onOpenChange={setMonthlyApprovalOpen}>
          <CardHeader className="cursor-pointer">
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between w-full">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-purple-500" />
                  Award Monthly Prize
                  {pendingMonths && pendingMonths.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {pendingMonths.length} pending
                    </Badge>
                  )}
                </CardTitle>
                {monthlyApprovalOpen ? (
                  <ChevronUp className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {/* Month Selection */}
              <div className="space-y-2">
                <Label>Select Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a month..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(pendingMonths && pendingMonths.length > 0 ? pendingMonths : monthOptions).map(month => (
                      <SelectItem key={month} value={month}>
                        {month}
                        {pendingMonths?.includes(month) && (
                          <span className="ml-2 text-orange-600">(pending)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Winner Selection */}
              {selectedMonth && (
                <div className="space-y-2">
                  <Label>Select Winner from Leaderboard</Label>
                  {loadingMonthlyStandings ? (
                    <Skeleton className="h-10 w-full" />
                  ) : !monthlyStandings?.length ? (
                    <p className="text-sm text-muted-foreground">No standings found for {selectedMonth}</p>
                  ) : (
                    <Select
                      value={selectedMonthlyWinner ? `${selectedMonthlyWinner.playerId}` : undefined}
                      onValueChange={(value) => {
                        const player = monthlyStandings.find(p => p.player_id === parseInt(value));
                        if (player) {
                          setSelectedMonthlyWinner({ playerId: player.player_id, playerName: player.player_name });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose the monthly winner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {monthlyStandings.map((player) => (
                          <SelectItem key={player.player_id} value={`${player.player_id}`}>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-muted-foreground w-6">#{player.net_position}</span>
                              <span>{player.player_name}</span>
                              <span className="text-muted-foreground">
                                ({formatScore(player.total_net_score)} / {player.tournaments_played} rounds)
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {/* Prize Description */}
              {selectedMonthlyWinner && (
                <>
                  <div className="space-y-2">
                    <Label>Prize Description</Label>
                    <Input
                      value={monthlyPrizeDescription}
                      onChange={(e) => setMonthlyPrizeDescription(e.target.value)}
                      placeholder="e.g., $50 Bar Tab, Golf Glove, Sleeve of ProV1s..."
                    />
                    <p className="text-xs text-muted-foreground">This will appear in the email</p>
                  </div>

                  <div className="space-y-2">
                    <Label>Email Subject</Label>
                    <Input
                      value={monthlyEmailSubject}
                      onChange={(e) => setMonthlyEmailSubject(e.target.value)}
                      placeholder={`Congratulations! You're the ${selectedMonth} Monthly Winner!`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Email Content (HTML)</Label>
                    <Textarea
                      value={monthlyEmailHtml}
                      onChange={(e) => setMonthlyEmailHtml(e.target.value)}
                      rows={12}
                      className="font-mono text-xs"
                      placeholder="Paste your HTML email template here..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Available variables: {"{{first_name}}"}, {"{{player_name}}"}, {"{{month}}"}, {"{{prize_description}}"}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setMonthlyApprovalOpen(false);
                        setSelectedMonth("");
                        setSelectedMonthlyWinner(null);
                        setMonthlyPrizeDescription("");
                        setMonthlyEmailSubject("");
                        setMonthlyEmailHtml(buildDefaultMonthlyEmailTemplate(tenant));
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!selectedMonthlyWinner || !monthlyPrizeDescription || approveMonthlyPrize.isPending}
                      onClick={() => approveMonthlyPrize.mutate()}
                      className="gap-2"
                    >
                      <Send className="h-4 w-4" />
                      {approveMonthlyPrize.isPending ? "Sending..." : "Approve & Send Email"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Weekly Prizes History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Weekly Prizes ($40 Credit)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingWeekly ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !weeklyPrizes?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <Trophy className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No weekly prizes awarded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyPrizes.map(prize => (
                <div
                  key={prize.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Trophy className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{prize.player_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getTournamentName(prize.tournament_id)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {prize.prize_amount}
                    </Badge>
                    {prize.profile_user_id ? (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
                        External
                      </Badge>
                    )}
                    {prize.email_sent && (
                      <Badge variant="outline" className="gap-1">
                        <Mail className="h-3 w-3" />
                        Sent
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(prize.awarded_at), "dd MMM yyyy")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Awards History Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-500" />
            Monthly Awards History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !monthlyAwards?.length ? (
            <div className="text-center py-6 text-muted-foreground">
              <Award className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No monthly awards recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {monthlyAwards.map(award => (
                <div
                  key={award.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-purple-100 flex items-center justify-center">
                      <Award className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{award.winner_player_name}</p>
                      <div className="flex items-center flex-wrap gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {award.month}
                        {award.prize_description && (
                          <>
                            <span>•</span>
                            <span>{award.prize_description}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(award.awarded_at), "dd MMM yyyy")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
