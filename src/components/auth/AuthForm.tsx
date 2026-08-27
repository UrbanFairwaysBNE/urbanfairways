import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { TermsContent } from "@/components/legal/TermsContent";
import { CURRENT_TERMS_VERSION } from "@/lib/terms-version";
import { useTenant } from "@/config/tenant";
import { useTranslation } from "react-i18next";


const buildSignUpSchema = (t: (k: string) => string) => z.object({
  firstName: z.string().trim().min(1, t("auth:firstNameRequired")).max(50, t("auth:firstNameTooLong")),
  lastName: z.string().trim().min(1, t("auth:lastNameRequired")).max(50, t("auth:lastNameTooLong")),
  email: z.string().trim().email(t("auth:invalidEmail")).max(255, t("auth:emailTooLong")),
  phone: z.string().trim().min(8, t("auth:phoneMinLength")).max(20, t("auth:phoneTooLong")),
  password: z.string().min(6, t("auth:passwordMinLength")).max(100, t("auth:passwordTooLong")),
});

const buildSignInSchema = (t: (k: string) => string) => z.object({
  email: z.string().trim().email(t("auth:invalidEmail")),
  password: z.string().min(1, t("auth:passwordRequired")),
});

interface AuthFormProps {
  defaultToSignUp?: boolean;
}

export function AuthForm({ defaultToSignUp = false }: AuthFormProps) {
  const { t } = useTranslation(["auth", "common"]);
  const { tenant } = useTenant();
  const signUpSchema = buildSignUpSchema(t);
  const signInSchema = buildSignInSchema(t);
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(defaultToSignUp);
  const [isLoading, setIsLoading] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Check for forgot=true query param to auto-show forgot password form
  useEffect(() => {
    if (searchParams.get("forgot") === "true") {
      setIsForgotPassword(true);
    }
  }, [searchParams]);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    
    if (!formData.email.trim()) {
      setErrors({ email: t("auth:emailRequired") });
      return;
    }

    const emailValidation = z.string().email().safeParse(formData.email.trim());
    if (!emailValidation.success) {
      setErrors({ email: t("auth:invalidEmail") });
      return;
    }

    setIsLoading(true);
    try {
      // Match admin flow exactly: use supabase.functions.invoke for consistent headers/auth
      const { data, error } = await supabase.functions.invoke("send-password-reset", {
        body: {
          email: formData.email.trim(),
          redirectUrl: `${window.location.origin}/reset-password`,
        },
      });

      if (error) {
        toast({
          title: t("auth:errorTitle"),
          description: error.message || t("auth:failedToSendResetLink"),
          variant: "destructive",
        });
      } else if (data?.error) {
        toast({
          title: t("auth:errorTitle"),
          description: data.error || t("auth:failedToSendResetLink"),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("auth:checkYourEmailTitle"),
          description: t("auth:resetLinkSentDesc"),
        });
        setIsForgotPassword(false);
      }
    } catch (err) {
      toast({
        title: t("auth:errorTitle"),
        description: t("auth:somethingWentWrong"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!acceptedTerms) {
          setErrors({ terms: t("auth:termsRequired") });
          setIsLoading(false);
          return;
        }

        const validation = signUpSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }

        const { data: signUpData, error } = await supabase.auth.signUp({
          email: formData.email.trim(),
          password: formData.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: {
              first_name: formData.firstName.trim(),
              last_name: formData.lastName.trim(),
              phone: formData.phone.trim(),
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            // Auto-redirect to forgot password with email pre-filled
            setIsForgotPassword(true);
            setIsLoading(false);
            toast({
              title: t("auth:alreadyHaveAccountTitle"),
              description: t("auth:alreadyHaveAccountDesc"),
            });
            return;
          } else {
            toast({
              title: t("auth:signUpFailed"),
              description: error.message,
              variant: "destructive",
            });
          }
        } else {
          // Record acceptance of the current terms version (best effort)
          if (signUpData.user) {
            supabase
              .rpc("accept_terms", { _version: CURRENT_TERMS_VERSION })
              .then(({ error: termsError }) => {
                if (termsError) console.error("Failed to record terms acceptance:", termsError);
              });
          }

          // Send welcome email
          if (signUpData.user) {
            supabase.functions.invoke("send-welcome-email", {
              body: {
                user_id: signUpData.user.id,
                email: formData.email.trim(),
                first_name: formData.firstName.trim(),
                last_name: formData.lastName.trim(),
              },
            }).catch((err) => {
              console.error("Failed to send welcome email:", err);
            });
          }
          
          toast({

            title: t("auth:welcomeToVenue", { venueName: tenant.venue_name }),
            description: t("auth:accountCreatedDesc"),
          });
        }
      } else {
        const validation = signInSchema.safeParse(formData);
        if (!validation.success) {
          const fieldErrors: Record<string, string> = {};
          validation.error.errors.forEach((err) => {
            if (err.path[0]) {
              fieldErrors[err.path[0] as string] = err.message;
            }
          });
          setErrors(fieldErrors);
          setIsLoading(false);
          return;
        }

        const email = formData.email.trim();
        const password = formData.password;

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          toast({
            title: t("auth:signInFailed"),
            description: t("auth:invalidEmailOrPassword"),
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      toast({
        title: t("auth:errorTitle"),
        description: t("auth:somethingWentWrong"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Forgot password form
  if (isForgotPassword) {
    return (
      <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="font-display text-3xl text-primary">
            {t("auth:resetPasswordTitle")}
          </CardTitle>
          <CardDescription>
            {t("auth:resetPasswordDesc")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">{t("auth:emailLabel")}</Label>
              <Input
                id="reset-email"
                name="email"
                type="email"
                placeholder={t("auth:emailPlaceholder")}
                value={formData.email}
                onChange={handleChange}
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && (
                <p className="text-destructive text-sm">{errors.email}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={isLoading}
            >
              {isLoading ? t("auth:sending") : t("auth:sendResetLinkButton")}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setErrors({});
              }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {t("auth:backToSignIn")}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md shadow-xl border-none">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="font-display text-3xl text-primary">
            {isSignUp ? t("auth:createAccountTitle") : t("auth:welcomeBackTitle")}
          </CardTitle>
          <CardDescription>
            {isSignUp
              ? t("auth:joinVenueDesc", { venueName: tenant.venue_name })
              : t("auth:signInToAccessDesc")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          
          <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("auth:firstName")}</Label>
                  <Input
                    id="firstName"
                    name="firstName"
                    placeholder={t("auth:firstNamePlaceholder")}
                    value={formData.firstName}
                    onChange={handleChange}
                    className={errors.firstName ? "border-destructive" : ""}
                  />
                  {errors.firstName && (
                    <p className="text-destructive text-sm">{errors.firstName}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("auth:lastName")}</Label>
                  <Input
                    id="lastName"
                    name="lastName"
                    placeholder={t("auth:lastNamePlaceholder")}
                    value={formData.lastName}
                    onChange={handleChange}
                    className={errors.lastName ? "border-destructive" : ""}
                  />
                  {errors.lastName && (
                    <p className="text-destructive text-sm">{errors.lastName}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t("auth:phoneNumberLabel")}</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder={t("auth:phonePlaceholder")}
                  value={formData.phone}
                  onChange={handleChange}
                  inputMode="tel"
                  autoComplete="tel"
                  className={errors.phone ? "border-destructive" : ""}
                />
                {errors.phone && (
                  <p className="text-destructive text-sm">{errors.phone}</p>
                )}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth:emailLabel")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={t("auth:emailPlaceholder")}
              value={formData.email}
              onChange={handleChange}
              inputMode="email"
              autoComplete={isSignUp ? "email" : "username"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-destructive text-sm">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth:password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              autoComplete={isSignUp ? "new-password" : "current-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={errors.password ? "border-destructive" : ""}
            />
            {errors.password && (
              <p className="text-destructive text-sm">{errors.password}</p>
            )}
            {!isSignUp && (
              <button
                type="button"
                onClick={() => {
                  setIsForgotPassword(true);
                  setErrors({});
                }}
                className="text-sm text-accent hover:underline"
              >
                {t("auth:forgotPassword")}
              </button>
            )}
          </div>

          {isSignUp && (
            <div className="space-y-2">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => {
                    setAcceptedTerms(checked === true);
                    if (errors.terms) {
                      setErrors((prev) => ({ ...prev, terms: "" }));
                    }
                  }}
                  className={errors.terms ? "border-destructive" : ""}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="terms"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {t("auth:acceptThe")}{" "}
                    <Dialog>
                      <DialogTrigger asChild>
                        <button type="button" className="text-accent hover:underline font-semibold">
                          {t("auth:termsAndConditions")}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[80vh]">
                        <DialogHeader>
                          <DialogTitle className="font-display text-xl text-primary">
                            {t("auth:termsAndConditions")}
                          </DialogTitle>
                        </DialogHeader>
                        <ScrollArea className="h-[60vh] pr-4">
                          <TermsContent />

                        </ScrollArea>
                      </DialogContent>
                    </Dialog>
                  </label>
                </div>
              </div>
              {errors.terms && (
                <p className="text-destructive text-sm">{errors.terms}</p>
              )}
            </div>
          )}

          <Button
            type="submit"
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            disabled={isLoading}
          >
            {isLoading ? t("auth:pleaseWait") : isSignUp ? t("auth:createAccountButton") : t("auth:signInButton")}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrors({});
              setAcceptedTerms(false);
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isSignUp
              ? t("auth:alreadyHaveAccountLink")
              : t("auth:noAccountLink")}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}