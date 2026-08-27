import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { StatCard } from "@/components/league/StatCard";
import { ProgressStatCard } from "@/components/league/ProgressStatCard";
import { sgtClient, MemberStats, PlayerRound } from "@/lib/sgt-api";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Mail,
  Target,
  Trophy,
  TrendingDown,
  BarChart3,
  Zap,
  CircleDot,
  AlertTriangle,
  Gauge,
  Award
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface HoleData {
  [key: string]: number | string;
}

interface ProgressStats {
  avgBirdies: number;
  avgPars: number;
  avgBogeys: number;
  avgDoublePlus: number;
  par3Avg: number;
  par4Avg: number;
  par5Avg: number;
  blowUpFrequency: number;
  consistencyScore: number;
  bestToPar: number;
}

function calculateProgressStats(rounds: PlayerRound[]): ProgressStats | null {
  // Only use complete 18-hole rounds with hole data
  const validRounds = rounds.filter(r => 
    r.scorecard?.holeData && 
    r.scorecard.out_gross > 0 && 
    r.scorecard.in_gross > 0 && 
    r.scorecard.total_gross > 0
  );
  if (validRounds.length === 0) return null;

  let totalBirdies = 0;
  let totalPars = 0;
  let totalBogeys = 0;
  let totalDoublePlus = 0;
  let par3Scores: number[] = [];
  let par4Scores: number[] = [];
  let par5Scores: number[] = [];
  let blowUpHoles = 0;
  let totalHoles = 0;
  let roundScores: number[] = [];

  for (const round of validRounds) {
    const holeData = round.scorecard.holeData as HoleData;
    if (!holeData) continue;

    roundScores.push(round.scorecard.toPar_gross);

    for (let hole = 1; hole <= 18; hole++) {
      const par = holeData[`h${hole}_Par`] as number;
      const gross = holeData[`hole${hole}_gross`] as number;

      if (typeof par !== 'number' || typeof gross !== 'number') continue;

      totalHoles++;
      const scoreToPar = gross - par;

      if (scoreToPar <= -1) totalBirdies++;
      else if (scoreToPar === 0) totalPars++;
      else if (scoreToPar === 1) totalBogeys++;
      else totalDoublePlus++;

      if (scoreToPar >= 3) blowUpHoles++;

      if (par === 3) par3Scores.push(gross);
      else if (par === 4) par4Scores.push(gross);
      else if (par === 5) par5Scores.push(gross);
    }
  }

  const numRounds = validRounds.length;
  const avgScore = roundScores.reduce((a, b) => a + b, 0) / roundScores.length;
  const consistentRounds = roundScores.filter(s => Math.abs(s - avgScore) <= 5).length;

  return {
    avgBirdies: totalBirdies / numRounds,
    avgPars: totalPars / numRounds,
    avgBogeys: totalBogeys / numRounds,
    avgDoublePlus: totalDoublePlus / numRounds,
    par3Avg: par3Scores.length > 0 ? par3Scores.reduce((a, b) => a + b, 0) / par3Scores.length : 0,
    par4Avg: par4Scores.length > 0 ? par4Scores.reduce((a, b) => a + b, 0) / par4Scores.length : 0,
    par5Avg: par5Scores.length > 0 ? par5Scores.reduce((a, b) => a + b, 0) / par5Scores.length : 0,
    blowUpFrequency: totalHoles > 0 ? (blowUpHoles / totalHoles) * 100 : 0,
    consistencyScore: (consistentRounds / numRounds) * 100,
    bestToPar: Math.min(...roundScores),
  };
}

export default function LeagueProfile() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation(["league", "common"]);
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [rounds, setRounds] = useState<PlayerRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        setDisplayName(profile?.display_name || profile?.first_name || user.email?.split("@")[0] || "Golfer");
        setEmail(profile?.email || user.email || "");

        const [statsData, roundsData] = await Promise.all([
          sgtClient.getMemberStats().catch(() => null),
          sgtClient.getPlayerRounds().catch(() => []),
        ]);

        setStats(statsData);
        setRounds(roundsData);
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user, authLoading]);

  const progressStats = useMemo(() => calculateProgressStats(rounds), [rounds]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  // Filter to only complete 18-hole scorecards (both halves must have scores)
  const completeRounds = rounds.filter(r => {
    const sc = r.scorecard;
    return sc.out_gross > 0 && sc.in_gross > 0 && sc.total_gross > 0;
  });

  const avgScore = completeRounds.length > 0
    ? Math.round(completeRounds.reduce((sum, r) => sum + r.scorecard.total_gross, 0) / completeRounds.length)
    : null;

  const bestRound = completeRounds.length > 0
    ? completeRounds.reduce((best, r) =>
        r.scorecard.total_gross < best.scorecard.total_gross ? r : best
      )
    : null;

  const completedRounds = completeRounds.filter(r => r.status === "Completed");

  return (
    <LeagueLayout>
      <div className="max-w-4xl mx-auto">
        {/* Profile Header Card */}
        <div className="bg-white rounded-2xl border border-border/50 overflow-hidden mb-6 shadow-sm animate-fade-in">
          {/* Green Hero Section */}
          <div className="bg-primary p-6 flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-brand-accent flex items-center justify-center text-white font-display text-4xl shadow-lg mb-4">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <h1 className="font-display text-2xl text-primary-foreground mb-1 uppercase tracking-wide">
              {displayName}
            </h1>
            {email && (
              <div className="flex items-center gap-2 text-primary-foreground/80 font-inter text-sm">
                <Mail className="h-4 w-4" />
                {email}
              </div>
            )}
          </div>

          {/* Handicap Section */}
          <div className="p-6 text-center">
            <p className="text-xs font-display text-muted-foreground uppercase tracking-wide mb-1">{t("league:profile.currentHandicap")}</p>
            <p className="text-5xl text-primary" style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}>
              {stats?.handicap ?? t("league:hub.notAvailable")}
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
          </div>
        ) : (
          <>
            {/* Performance Stats */}
            <div className="mb-6 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <h2 className="font-display text-xl text-primary mb-4">
                {t("league:profile.performanceStats")}
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label={t("league:profile.averageScore")}
                  value={avgScore ?? t("league:hub.notAvailable")}
                  icon={<BarChart3 className="h-5 w-5" />}
                  delay={0}
                />
                <StatCard
                  label={t("league:profile.bestRound")}
                  value={bestRound?.scorecard.total_gross ?? t("league:hub.notAvailable")}
                  subValue={bestRound?.courseName}
                  icon={<TrendingDown className="h-5 w-5" />}
                  delay={100}
                />
                <StatCard
                  label={t("league:profile.tourRank")}
                  value={stats?.standing?.position ? `#${stats.standing.position}` : t("league:hub.notAvailable")}
                  subValue={stats?.standing ? t("league:profile.points", { points: stats.standing.points }) : undefined}
                  icon={<Trophy className="h-5 w-5" />}
                  delay={200}
                />
                <StatCard
                  label={t("league:profile.roundsPlayed")}
                  value={completedRounds.length}
                  subValue={t("league:profile.completed18Holes")}
                  icon={<Target className="h-5 w-5" />}
                  delay={300}
                />
              </div>
            </div>

            {/* My Progress */}
            {progressStats && (
              <div className="mb-6 animate-slide-up" style={{ animationDelay: "150ms" }}>
                <h2 className="font-display text-xl text-primary mb-4">
                  {t("league:profile.myProgress")}
                </h2>
                <div className="bg-white rounded-2xl border border-border/50 p-5 shadow-sm">
                  {/* Scoring Breakdown */}
                  <div className="mb-6">
                    <h3 className="font-inter font-semibold text-primary mb-4 flex items-center gap-2 text-sm">
                      <CircleDot className="h-4 w-4 text-brand-accent" />
                      {t("league:profile.averagePerRound")}
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <ProgressStatCard
                        value={progressStats.avgBirdies.toFixed(1)}
                        label={t("league:profile.birdies")}
                        explanation={t("league:profile.birdiesExplanation")}
                        className="bg-primary/10"
                        valueClassName="text-primary"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgPars.toFixed(1)}
                        label={t("league:profile.pars")}
                        explanation={t("league:profile.parsExplanation")}
                        className="bg-muted"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgBogeys.toFixed(1)}
                        label={t("league:profile.bogeys")}
                        explanation={t("league:profile.bogeysExplanation")}
                        className="bg-brand-accent/10"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgDoublePlus.toFixed(1)}
                        label={t("league:profile.doublePlus")}
                        explanation={t("league:profile.doublePlusExplanation")}
                        className="bg-muted"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                    </div>
                  </div>

                  {/* Par Performance */}
                  <div className="mb-6">
                    <h3 className="font-inter font-semibold text-primary mb-4 flex items-center gap-2 text-sm">
                      <Zap className="h-4 w-4 text-brand-accent" />
                      {t("league:profile.parPerformance")}
                    </h3>
                    <div className="grid grid-cols-3 gap-3">
                      <ProgressStatCard
                        value={progressStats.par3Avg.toFixed(1)}
                        label={t("league:profile.par3Avg")}
                        subValue={`${progressStats.par3Avg - 3 > 0 ? '+' : ''}${(progressStats.par3Avg - 3).toFixed(1)} ${t("league:profile.vsPar")}`}
                        explanation={t("league:profile.par3Explanation")}
                        className="bg-muted/50"
                        valueClassName="text-primary"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.par4Avg.toFixed(1)}
                        label={t("league:profile.par4Avg")}
                        subValue={`${progressStats.par4Avg - 4 > 0 ? '+' : ''}${(progressStats.par4Avg - 4).toFixed(1)} ${t("league:profile.vsPar")}`}
                        explanation={t("league:profile.par4Explanation")}
                        className="bg-muted/50"
                        valueClassName="text-primary"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.par5Avg.toFixed(1)}
                        label={t("league:profile.par5Avg")}
                        subValue={`${progressStats.par5Avg - 5 > 0 ? '+' : ''}${(progressStats.par5Avg - 5).toFixed(1)} ${t("league:profile.vsPar")}`}
                        explanation={t("league:profile.par5Explanation")}
                        className="bg-muted/50"
                        valueClassName="text-primary"
                        variant="compact"
                      />
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <ProgressStatCard
                      value={progressStats.bestToPar === 0 ? 'E' : progressStats.bestToPar > 0 ? `+${progressStats.bestToPar}` : progressStats.bestToPar}
                      label={t("league:profile.bestToPar")}
                      explanation={t("league:profile.bestToParExplanation")}
                      className="bg-muted/30"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center"><Award className="h-5 w-5 text-brand-accent" /></div>}
                    />
                    <ProgressStatCard
                      value={`${progressStats.blowUpFrequency.toFixed(1)}%`}
                      label={t("league:profile.blowUpHoles")}
                      explanation={t("league:profile.blowUpHolesExplanation")}
                      className="bg-muted/30"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-brand-accent/20 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-brand-accent" /></div>}
                    />
                    <ProgressStatCard
                      value={`${progressStats.consistencyScore.toFixed(0)}%`}
                      label={t("league:profile.consistency")}
                      explanation={t("league:profile.consistencyExplanation")}
                      className="bg-muted/30 col-span-2 md:col-span-1"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center"><Gauge className="h-5 w-5 text-primary" /></div>}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </LeagueLayout>
  );
}