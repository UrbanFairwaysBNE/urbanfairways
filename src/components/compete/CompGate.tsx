import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalCompSettings } from "@/hooks/useLocalCompSettings";

/**
 * Locks the Weekly Comp section for customers when the comp is switched off
 * in Local Comp settings.
 */
export function CompGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { compEnabled, isLoading } = useLocalCompSettings();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!compEnabled) {
    return (
      <div className="min-h-screen bg-background safe-area-top">
        <div className="max-w-lg mx-auto p-4 pt-6 space-y-6">
          <button
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Hub
          </button>

          <div className="bg-card rounded-lg border border-border p-8 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <h1 className="font-display text-2xl text-primary font-bold">Weekly Comp Paused</h1>
            <p className="text-muted-foreground text-sm">
              The weekly comp isn't running at the moment. Keep an eye on What's On, we'll let you
              know as soon as it's back.
            </p>
            <Button onClick={() => navigate("/dashboard")}>Back to Hub</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
