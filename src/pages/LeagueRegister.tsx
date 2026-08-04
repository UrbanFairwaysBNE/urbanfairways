import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import birdiesLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import { Loader2, ArrowLeft, CheckCircle2, Eye, EyeOff, UserPlus } from "lucide-react";

export default function LeagueRegister() {
  const { tenant } = useTenant();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [typicalScore, setTypicalScore] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  // Check if user already has SGT account
  useEffect(() => {
    if (!user) return;

    async function checkExisting() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("sgt_user_id")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (profile?.sgt_user_id) {
        navigate("/league");
      }
    }

    checkExisting();
  }, [user, navigate]);

  // Debounced username availability check
  useEffect(() => {
    if (username.length < 2) {
      setUsernameAvailable(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsCheckingUsername(true);
      try {
        const { data, error } = await supabase.functions.invoke("sgt-register", {
          body: { action: "check-username", username },
        });

        if (!error && data) {
          setUsernameAvailable(data.available);
        }
      } catch {
        // Silent fail
      } finally {
        setIsCheckingUsername(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [username]);

  const handleRegister = useCallback(async () => {
    if (!user || !username || !password) return;

    if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) {
      toast.error("Username must be 2-64 alphanumeric characters or underscores");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsRegistering(true);

    try {
      const { data, error } = await supabase.functions.invoke("sgt-register", {
        body: { action: "register", username, password, typicalScore: typicalScore.trim() || undefined },
      });

      if (error) {
        console.error("Registration error:", error);
        toast.error("Registration failed. Please try again.");
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      if (data?.success) {
        setRegistrationComplete(true);
        toast.success("SGT account created!", {
          description: "Your account has been linked. Redirecting to League Hub...",
        });
        setTimeout(() => navigate("/league"), 2500);
      }
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Registration failed. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  }, [user, username, password, typicalScore, navigate]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-brand-accent animate-spin" />
      </div>
    );
  }

  if (registrationComplete) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <header className="bg-primary py-4 px-4 safe-area-top">
          <div className="container flex items-center gap-3">
            <img src={birdiesLogo} alt={tenant.venue_name} className="h-8 w-auto" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="text-center">
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h1 className="font-anton text-2xl text-primary mb-2">
              WELCOME TO THE LEAGUE!
            </h1>
            <p className="font-inter text-muted-foreground">
              Redirecting you to the League Hub...
            </p>
            <Loader2 className="h-6 w-6 text-brand-accent animate-spin mx-auto mt-4" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-primary py-4 px-4 safe-area-top">
        <div className="container flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <img src={birdiesLogo} alt={tenant.venue_name} className="h-8 w-auto" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        <div className="bg-white border-b border-border/50 px-4 py-4">
          <div className="container max-w-md">
            <h1 className="font-anton text-xl text-primary mb-1">
              JOIN {tenant.venue_name.toUpperCase()} LEAGUE
            </h1>
            <p className="font-inter text-sm text-muted-foreground">
              Create your Simulator Golf Tour account to join the league
            </p>
          </div>
        </div>

        <div className="flex-1 px-4 py-6">
          <div className="container max-w-md">
            <div className="rounded-lg border border-border/50 bg-card p-6 space-y-5">
              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="sgt-username" className="font-inter text-sm font-medium text-primary">
                  SGT Username
                </Label>
                <div className="relative">
                  <Input
                    id="sgt-username"
                    type="text"
                    placeholder="e.g. CalBrown"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                    maxLength={64}
                    className="pr-10"
                  />
                  {isCheckingUsername && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  {!isCheckingUsername && usernameAvailable === true && username.length >= 2 && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                {usernameAvailable === false && (
                  <p className="text-xs text-destructive font-inter">Username is already taken</p>
                )}
                <p className="text-xs text-muted-foreground font-inter">
                  Letters, numbers, and underscores only
                </p>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <Label htmlFor="sgt-password" className="font-inter text-sm font-medium text-primary">
                  SGT Password
                </Label>
                <div className="relative">
                  <Input
                    id="sgt-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && username && password) handleRegister();
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground font-inter">
                  This is for your SGT account only, not your {tenant.venue_name} Hub login
                </p>
              </div>

              {/* Typical 18-hole score */}
              <div className="space-y-2">
                <Label htmlFor="typical-score" className="font-inter text-sm font-medium text-primary">
                  What do you typically shoot over 18 holes?
                </Label>
                <Input
                  id="typical-score"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 95, or 90-100 if unsure"
                  value={typicalScore}
                  onChange={(e) => setTypicalScore(e.target.value.slice(0, 20))}
                />
                <p className="text-xs text-muted-foreground font-inter">
                  Helps us set your starting handicap. A rough estimate is fine.
                </p>
              </div>



              {/* Info note */}
              <div className="rounded-md bg-muted/50 p-3">
                <p className="font-inter text-xs text-muted-foreground">
                  Your {tenant.venue_name} Hub email (<strong className="text-primary">{user.email}</strong>) will be used for your SGT account. 
                  An admin will set your initial handicap after registration.
                </p>
              </div>

              {/* Register Button */}
              <Button
                onClick={handleRegister}
                disabled={isRegistering || !username || !password || usernameAvailable === false}
                className="w-full bg-brand-accent hover:bg-brand-accent/90 text-white font-inter font-semibold"
              >
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create SGT Account & Join League
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
