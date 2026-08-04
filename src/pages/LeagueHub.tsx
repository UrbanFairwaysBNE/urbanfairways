import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { LeagueRegistrationPrompt } from "@/components/league/LeagueRegistrationPrompt";
import { StatCard } from "@/components/league/StatCard";
import { usePlayerScorecards, PlayerRoundWithScorecard } from "@/hooks/usePlayerScorecards";
import {
  Target,
  TrendingUp,
  Trophy,
  Calendar,
  Loader2,
  MapPin,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";

interface UserStanding {
  position: number;
  points: number;
  first: number;
  top5: number;
  top10: number;
}

export default function LeagueHub() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [sgtUserId, setSgtUserId] = useState<number | null>(null);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [standing, setStanding] = useState<UserStanding | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);
  
  // Use cached scorecards from database - minimizes API calls
  const { data: rounds = [], isLoading: roundsLoading } = usePlayerScorecards();

  const toggleExpand = (roundKey: string) => {
    setExpandedRound(expandedRound === roundKey ? null : roundKey);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadDashboard() {
      setIsLoadingProfile(true);
      try {
        // Get user profile and sgt_user_id
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, email, sgt_user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        setDisplayName(profile?.display_name || profile?.first_name || user.email?.split("@")[0] || "Golfer");
        setSgtUserId(profile?.sgt_user_id || null);

        // If user has SGT account, get their handicap and standing from database
        if (profile?.sgt_user_id) {
          // Get handicap from tour member record
          const { data: tourMember } = await supabase
            .from("sgt_tour_members")
            .select("hcp_index, custom_hcp")
            .eq("user_id", profile.sgt_user_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          
          setHandicap(tourMember?.custom_hcp ?? tourMember?.hcp_index ?? null);

          // Get user's standing from tour standings (look up by user_name)
          const { data: member } = await supabase
            .from("sgt_members")
            .select("user_name")
            .eq("user_id", profile.sgt_user_id)
            .maybeSingle();

          if (member?.user_name) {
            const { data: standingData } = await supabase
              .from("sgt_tour_standings")
              .select("position, points, first, top5, top10")
              .eq("user_name", member.user_name)
              .eq("gross_or_net", "net")
              .order("updated_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (standingData) {
              setStanding({
                position: standingData.position,
                points: standingData.points ?? 0,
                first: standingData.first ?? 0,
                top5: standingData.top5 ?? 0,
                top10: standingData.top10 ?? 0,
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    loadDashboard();
  }, [user, authLoading]);

  const isLoading = authLoading || isLoadingProfile || roundsLoading;

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  // Convert cached scorecard format for ScorecardDisplay
  const formatScorecardForDisplay = (round: PlayerRoundWithScorecard) => {
    if (!round.scorecard) return undefined;
    return {
      tournamentId: round.scorecard.tournament_id,
      playerId: round.scorecard.player_id,
      player_name: round.scorecard.player_name,
      hcp_index: round.scorecard.hcp_index ?? 0,
      round: round.scorecard.round ?? 1,
      courseName: round.scorecard.course_name ?? "",
      teetype: round.scorecard.teetype ?? "",
      rating: round.scorecard.rating ?? 0,
      slope: round.scorecard.slope ?? 0,
      total_gross: round.scorecard.total_gross ?? 0,
      total_net: round.scorecard.total_net ?? 0,
      toPar_gross: round.scorecard.to_par_gross ?? 0,
      toPar_net: round.scorecard.to_par_net ?? 0,
      in_gross: round.scorecard.in_gross ?? 0,
      out_gross: round.scorecard.out_gross ?? 0,
      in_net: round.scorecard.in_net ?? 0,
      out_net: round.scorecard.out_net ?? 0,
      holeData: round.scorecard.hole_data as Record<string, number | string> | undefined,
    };
  };

  return (
    <LeagueLayout>
      {/* Welcome Section */}
      <div className="mb-6 animate-fade-in">
        <h1 className="font-anton text-2xl md:text-3xl text-primary mb-1">
          WELCOME BACK, {displayName.toUpperCase()}
        </h1>
        <p className="font-inter text-muted-foreground text-sm">
          Here's your latest performance in the League Hub
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
        </div>
      ) : !sgtUserId ? (
        // Show registration prompt if user doesn't have SGT account
        <LeagueRegistrationPrompt />
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <StatCard
              label="Handicap"
              value={handicap ?? "N/A"}
              icon={<Target className="h-5 w-5" />}
              delay={0}
            />
            <StatCard
              label="Rounds Played"
              value={rounds.length}
              subValue="This season"
              icon={<Calendar className="h-5 w-5" />}
              delay={100}
            />
            <StatCard
              label="Tour Position"
              value={standing?.position ? `#${standing.position}` : "N/A"}
              subValue={standing ? `${standing.points} pts` : undefined}
              icon={<Trophy className="h-5 w-5" />}
              delay={200}
            />
            <StatCard
              label="Best Finish"
              value={standing?.first ? `${standing.first} Win${standing.first > 1 ? "s" : ""}` : standing?.top5 ? `${standing.top5} Top 5` : "N/A"}
              icon={<TrendingUp className="h-5 w-5" />}
              delay={300}
            />
          </div>

          {/* Recent Rounds */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-anton text-xl text-primary">RECENT ROUNDS</h2>
              <Link
                to="/league/rounds"
                className="flex items-center gap-1 text-brand-accent font-inter font-medium text-sm hover:underline"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {rounds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border/50 p-8 text-center shadow-sm">
                <p className="text-muted-foreground font-inter">
                  No rounds recorded yet. Get out there and play!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {rounds.slice(0, 3).map((round, index) => {
                  const roundKey = `${round.tournamentId}-${round.scorecard?.round || index}`;
                  const isExpanded = expandedRound === roundKey;
                  const displayScorecard = formatScorecardForDisplay(round);
                  
                  return (
                    <div
                      key={roundKey}
                      className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm"
                    >
                      <button
                        onClick={() => toggleExpand(roundKey)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <h3 className="font-inter font-semibold text-primary text-base leading-tight mb-2">
                              {round.tournamentName}
                              {round.scorecard?.round && ` - Round ${round.scorecard.round}`}
                            </h3>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-inter font-medium mb-2 ${
                              round.status === "Completed"
                                ? "badge-completed"
                                : "badge-in-progress"
                            }`}>
                              {round.status}
                            </span>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground font-inter">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              <span>{round.courseName}</span>
                              <span className="text-border">•</span>
                              <span>
                                {new Date(round.date).toLocaleDateString("en-AU", {
                                  weekday: "short",
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric"
                                })}
                              </span>
                            </div>
                          </div>
                          <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {isExpanded && displayScorecard && (
                        <div className="px-4 pb-4 pt-2 border-t border-border/50 animate-fade-in">
                          <ScorecardDisplay scorecard={displayScorecard} showDetails />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </LeagueLayout>
  );
}
