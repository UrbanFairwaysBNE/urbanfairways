import { Link } from "react-router-dom";
import { Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/config/tenant";

export function LeagueRegistrationPrompt() {
  const { tenant } = useTenant();
  return (
    <div className="bg-gradient-to-br from-primary to-primary/80 rounded-2xl p-6 text-primary-foreground animate-fade-in">
      <div className="flex items-start gap-4">
        <div className="bg-birdies-orange/20 rounded-full p-3">
          <Trophy className="h-6 w-6 text-birdies-orange" />
        </div>
        <div className="flex-1">
          <h2 className="font-anton text-xl mb-2">JOIN {tenant.venue_name.toUpperCase()} LEAGUE</h2>
          <p className="font-inter text-sm text-primary-foreground/80 mb-4">
            Create your Simulator Golf Tour account to compete in tournaments, track your handicap, and climb the leaderboard.
          </p>
          <Link to="/league/register">
            <Button 
              className="bg-birdies-orange hover:bg-birdies-orange/90 text-white font-inter font-semibold"
            >
              Get Started
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
