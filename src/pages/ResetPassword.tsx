import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Check, AlertCircle, Loader2, Mail } from "lucide-react";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export default function ResetPassword() {
  const { tenant } = useTenant();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [isValidSession, setIsValidSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [isRequestingLink, setIsRequestingLink] = useState(false);
  const [linkRequested, setLinkRequested] = useState(false);
  const [pendingTokens, setPendingTokens] = useState<{
    accessToken?: string;
    refreshToken?: string;
    tokenHash?: string;
    otpToken?: string;
    emailParam?: string;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const finishValidation = (isValid: boolean, message?: string | null) => {
    setIsValidSession(isValid);
    setErrorMessage(isValid ? null : message || "Invalid or expired reset link. Please request a new password reset.");
    setIsValidating(false);
    setPendingTokens(null);
  };

  // STEP 1: On page load, just detect tokens in URL, do NOT consume them.
  // Email security scanners (Outlook Safe Links, Mimecast, etc.) pre-fetch
  // links in a real browser and would burn one-time tokens before the user
  // clicks. We require an explicit button click to verify.
  useEffect(() => {
    let isMounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    const detect = async () => {
      try {
        const hash = window.location.hash;
        const search = window.location.search;
        const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const queryParams = new URLSearchParams(search);

        const accessToken = hashParams.get("access_token") || undefined;
        const refreshToken = hashParams.get("refresh_token") || undefined;
        const tokenHash = queryParams.get("token_hash") || hashParams.get("token_hash") || undefined;
        const emailParam = queryParams.get("email") || hashParams.get("email") || undefined;
        const otpToken =
          queryParams.get("token") ||
          hashParams.get("token") ||
          queryParams.get("email_otp") ||
          hashParams.get("email_otp") ||
          undefined;
        const type = hashParams.get("type") || queryParams.get("type");
        const errorParam = hashParams.get("error") || queryParams.get("error");
        const errorDescription = hashParams.get("error_description") || queryParams.get("error_description");

        if (!isMounted) return;

        if (errorParam) {
          finishValidation(false, errorDescription || "Invalid or expired link");
          return;
        }

        // Already-signed-in session? Allow immediate password set.
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        const hasAnyToken =
          (accessToken && refreshToken && type === "recovery") ||
          (emailParam && otpToken && type === "recovery") ||
          (tokenHash && type === "recovery");

        if (hasAnyToken) {
          // Stash tokens; require user click to verify.
          setPendingTokens({ accessToken, refreshToken, tokenHash, otpToken, emailParam });
          setIsValidating(false);
          return;
        }

        // Last-ditch: wait briefly for a PASSWORD_RECOVERY event
        // (in case Supabase auto-detected a hash session).
        const authStateChange = supabase.auth.onAuthStateChange((event, session) => {
          if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) {
            sessionStorage.setItem("password_reset_in_progress", "true");
            finishValidation(true);
          }
        });
        subscription = authStateChange.data.subscription;

        await new Promise((resolve) => setTimeout(resolve, 1200));
        const { data: { session: finalSession } } = await supabase.auth.getSession();
        if (finalSession) {
          sessionStorage.setItem("password_reset_in_progress", "true");
          finishValidation(true);
          return;
        }

        finishValidation(false, "Invalid or expired reset link. Please request a new password reset.");
      } catch (error: any) {
        console.error("[RESET] Detection error:", error);
        finishValidation(false, "An error occurred. Please try again.");
      }
    };

    detect();

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  // STEP 2: User clicks "Continue", now consume the token.
  const handleConfirmReset = async () => {
    if (!pendingTokens) return;
    setIsConfirming(true);
    try {
      const { accessToken, refreshToken, tokenHash, otpToken, emailParam } = pendingTokens;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      } else if (emailParam && otpToken) {
        const { error } = await supabase.auth.verifyOtp({
          email: emailParam,
          token: otpToken,
          type: "recovery",
        });
        if (error && tokenHash) {
          const { error: e2 } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (e2) throw e2;
        } else if (error) {
          throw error;
        }
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (error) throw error;
      } else {
        throw new Error("No reset token found");
      }

      window.history.replaceState(null, "", window.location.pathname);
      sessionStorage.setItem("password_reset_in_progress", "true");
      finishValidation(true);
    } catch (error: any) {
      console.error("[RESET] Confirm error:", error);
      finishValidation(false, "Invalid or expired reset link. Please request a new one.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      // Clear the recovery flag after successful password update
      sessionStorage.removeItem("password_reset_in_progress");
      
      setIsSuccess(true);
      toast.success("Password updated successfully!");
      
      // Redirect to dashboard after a moment
      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (error: any) {
      console.error("Update password error:", error);
      toast.error(error.message || "Failed to update password");
    } finally {
      setIsLoading(false);
    }
  };

  // Loading state while validating token
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Validating your reset link...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Gate: token detected but not yet consumed. Require user click so email
  // scanners (Outlook Safe Links, Mimecast, etc.) don't burn the one-time token.
  if (pendingTokens && !isValidSession && !errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={venueLogo} alt={tenant.venue_name} className="h-12 mx-auto mb-4" />
            <CardTitle className="font-display text-xl uppercase tracking-wide">
              Reset Your Password
            </CardTitle>
            <CardDescription>
              Click the button below to confirm and continue setting a new password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleConfirmReset} className="w-full" disabled={isConfirming}>
              {isConfirming ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleRequestNewLink = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast.error("Please enter your email address");
      return;
    }

    setIsRequestingLink(true);

    try {
      // Match admin flow exactly: use supabase.functions.invoke
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: {
          email: resetEmail,
          redirectUrl: `${window.location.origin}/reset-password`,
        },
      });

      if (error) throw new Error(error.message || "Failed to send reset link");
      if (data?.error) throw new Error(data.error);

      setLinkRequested(true);
      toast.success("Password reset link sent! Check your email.");
    } catch (error: any) {
      console.error("Request new link error:", error);
      toast.error(error.message || "Failed to send reset link");
    } finally {
      setIsRequestingLink(false);
    }
  };

  // Error state with request new link option
  if (errorMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <img src={venueLogo} alt={tenant.venue_name} className="h-12 mx-auto mb-4" />
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="font-display text-xl uppercase tracking-wide">
              {linkRequested ? "Check Your Email" : "Link Expired"}
            </CardTitle>
            <CardDescription>
              {linkRequested 
                ? "We've sent you a new password reset link. Please check your inbox."
                : errorMessage
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {linkRequested ? (
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Didn't receive the email? Check your spam folder or try again.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setLinkRequested(false)}
                  className="w-full"
                >
                  Request Another Link
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestNewLink} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="resetEmail">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="resetEmail"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter your email"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={isRequestingLink}>
                  {isRequestingLink ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Request New Link"
                  )}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate("/")}
                >
                  Back to Login
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-display uppercase tracking-wide mb-2">Password Updated!</h2>
            <p className="text-muted-foreground">
              Redirecting you to the dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Password form (only shown when session is valid)
  if (!isValidSession) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img src={venueLogo} alt={tenant.venue_name} className="h-12 mx-auto mb-4" />
          <CardTitle className="font-display text-2xl uppercase tracking-wide">
            Set Your Password
          </CardTitle>
          <CardDescription>
            Enter a new password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pl-10 pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Updating..." : "Set Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
