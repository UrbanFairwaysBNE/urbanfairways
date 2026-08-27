import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Users, CheckCircle } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

export default function CompRegisterTeam() {
  const navigate = useNavigate();
  const { t } = useTranslation(["league", "common"]);
  const { user, isLoading: authLoading } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const p1 = player1.trim();
    const p2 = player2.trim();
    const name = teamName.trim();

    if (!p1 || !p2 || !name) {
      toast.error(t("league:comp.registerTeam.allFieldsRequired"));
      return;
    }

    setSubmitting(true);

    // Duplicate check, same two player names (order-insensitive, case-insensitive)
    const p1Lower = p1.toLowerCase();
    const p2Lower = p2.toLowerCase();
    const { data: existing } = await supabase
      .from("local_comp_saved_teams")
      .select("team_name, player1_name, player2_name");

    const duplicate = (existing || []).find((t) => {
      const a = (t.player1_name || "").trim().toLowerCase();
      const b = (t.player2_name || "").trim().toLowerCase();
      return (a === p1Lower && b === p2Lower) || (a === p2Lower && b === p1Lower);
    });

    if (duplicate) {
      setSubmitting(false);
      toast.error(
        t("league:comp.registerTeam.alreadyRegistered", { teamName: duplicate.team_name }),
        { duration: 6000 }
      );
      return;
    }

    // Insert team
    const { error: teamError } = await supabase.from("local_comp_saved_teams").insert({
      team_name: name,
      player1_name: p1,
      player2_name: p2,
      player1_handicap: 0,
      player2_handicap: 0,
    });

    if (teamError) {
      setSubmitting(false);
      toast.error(t("league:comp.registerTeam.registerFailed"));
      console.error(teamError);
      return;
    }

    // Upsert players (default 0 hcp, staff sets it later). Ignore duplicate-key errors.
    for (const playerName of [p1, p2]) {
      const { error: playerErr } = await supabase
        .from("local_comp_players")
        .insert({
          name: playerName,
          name_normalized: playerName.toLowerCase(),
          handicap: 0,
        });
      // Ignore unique violation (player already exists), keep their existing hcp.
      if (playerErr && !playerErr.message.toLowerCase().includes("duplicate")) {
        console.warn("Player insert warning:", playerErr.message);
      }
    }

    setSubmitting(false);
    setSubmitted(true);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <Users className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-xl font-bold mb-2">{t("league:comp.registerTeam.signInRequiredTitle")}</h1>
        <p className="text-muted-foreground mb-6">{t("league:comp.registerTeam.signInRequiredBody")}</p>
        <Button onClick={() => navigate("/")}>{t("league:comp.registerTeam.goToLogin")}</Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle className="h-16 w-16 text-primary mb-4" />
        <h1 className="text-2xl font-bold mb-2">{t("league:comp.registerTeam.registeredTitle")}</h1>
        <p className="text-muted-foreground mb-6">
          {t("league:comp.registerTeam.registeredBody")}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => { setSubmitted(false); setTeamName(""); setPlayer1(""); setPlayer2(""); }}>
            {t("league:comp.registerTeam.registerAnother")}
          </Button>
          <Button onClick={() => navigate("/comp")}>{t("league:comp.registerTeam.backToCompArea")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-md mx-auto p-4 pt-6 space-y-6 safe-area-top">
        <button
          onClick={() => navigate("/comp")}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t("league:comp.registerTeam.backToCompAreaLink")}
        </button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {t("league:comp.registerTeam.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("league:comp.registerTeam.cardDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-5 rounded-lg border-2 border-primary/30 bg-primary/10 p-4 flex gap-3">
              <CheckCircle className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm font-semibold text-foreground leading-snug">
                <Trans
                  i18nKey="league:comp.registerTeam.lockedInNote"
                  components={{ underline: <span className="underline" /> }}
                />
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="player1">{t("league:comp.registerTeam.player1Label")}</Label>
                <Input
                  id="player1"
                  value={player1}
                  onChange={(e) => setPlayer1(e.target.value)}
                  placeholder={t("league:comp.registerTeam.player1Placeholder")}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="player2">{t("league:comp.registerTeam.player2Label")}</Label>
                <Input
                  id="player2"
                  value={player2}
                  onChange={(e) => setPlayer2(e.target.value)}
                  placeholder={t("league:comp.registerTeam.player2Placeholder")}
                  maxLength={100}
                  required
                />
              </div>
              <div>
                <Label htmlFor="teamName">{t("league:comp.registerTeam.teamNameLabel")}</Label>
                <Input
                  id="teamName"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder={t("league:comp.registerTeam.teamNamePlaceholder")}
                  maxLength={100}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? t("league:comp.registerTeam.registering") : t("league:comp.registerTeam.registerButton")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
