import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Users, UserSearch, Trophy, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const CompHub = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(["league", "common"]);

  const tiles = [
    {
      title: t("league:comp.tileRegisterTeamTitle"),
      description: t("league:comp.tileRegisterTeamDesc"),
      icon: Users,
      onClick: () => navigate("/comp/register-team"),
      accent: true,
    },
    {
      title: t("league:comp.tileFindPartnerTitle"),
      description: t("league:comp.tileFindPartnerDesc"),
      icon: UserSearch,
      onClick: () => navigate("/comp/find-partner"),
      accent: false,
    },
    {
      title: t("league:comp.tileLeaderboardTitle"),
      description: t("league:comp.tileLeaderboardDesc"),
      icon: Trophy,
      onClick: () => navigate("/comp/leaderboard"),
      accent: false,
    },
  ];

  return (
    <div className="min-h-screen bg-background safe-area-top">
      <div className="max-w-lg mx-auto p-4 pt-6 space-y-6">
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("league:comp.hubBackToHub")}
        </button>

        <div>
          <h1 className="font-display text-3xl text-primary font-bold">{t("league:comp.hubTitle")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("league:comp.hubSubtitle")}
          </p>
        </div>

        <div className="grid gap-4">
          {tiles.map((tile) => (
            <div
              key={tile.title}
              className={`bg-card rounded-lg p-5 shadow-md border ${
                tile.accent ? "border-primary/30" : "border-border"
              } relative`}
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center ${
                    tile.accent ? "bg-primary/15" : "bg-accent/10"
                  }`}
                >
                  <tile.icon
                    className={`h-5 w-5 ${
                      tile.accent ? "text-primary" : "text-accent"
                    }`}
                  />
                </div>
                <h2 className="font-semibold text-lg">{tile.title}</h2>
              </div>
              <p className="text-muted-foreground mb-4 text-sm">
                {tile.description}
              </p>
              <Button
                className={`w-full ${
                  tile.accent
                    ? "bg-accent text-accent-foreground hover:bg-accent/90"
                    : "bg-accent text-accent-foreground hover:bg-accent/90"
                }`}
                onClick={tile.onClick}
              >
                {tile.title}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CompHub;
