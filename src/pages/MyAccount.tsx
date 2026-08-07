import { useNavigate, useSearchParams } from "react-router-dom";
import { usePricing } from "@/hooks/usePricing";
import { tierBadgeClass } from "@/lib/tier-config";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Crown, Lock, User, Mail, Phone, Plus, Loader2, Trash2, Pencil, Check, X, Wallet, CreditCard, Gamepad2, Copy, Eye, EyeOff, Gift } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant } from "@/config/tenant";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MembershipPaymentIssueDialog } from "@/components/membership/MembershipPaymentIssueDialog";
import { AlertCircle } from "lucide-react";
import { PrepaidPacksCard } from "@/components/account/PrepaidPacksCard";
import { CorporateStaffCard } from "@/components/account/CorporateStaffCard";
import { useCorporate } from "@/hooks/useCorporate";




interface Profile {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  membership_tier: string;
  deposit_balance: number;
  sgt_user_id: number | null;
  payment_failed_at: string | null;
}

interface SGTMember {
  user_name: string;
  user_game_id: string | null;
}

interface PaymentMethod {
  id: string;
  type?: string;
  brand: string;
  last4: string;
  expMonth?: number;
  expYear?: number;
  email?: string;
}

const MyAccount = () => {
  const { tenant } = useTenant();
  const { pricing, getTier, defaultTier, peakRate } = usePricing();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [isLoadingPaymentMethods, setIsLoadingPaymentMethods] = useState(true);
  const [isAddingPaymentMethod, setIsAddingPaymentMethod] = useState(false);
  const [deletingPaymentMethodId, setDeletingPaymentMethodId] = useState<string | null>(null);
  const [showMembershipBlockDialog, setShowMembershipBlockDialog] = useState(false);
  const [showPaymentIssueDialog, setShowPaymentIssueDialog] = useState(false);
  const [isOpeningBillingPortal, setIsOpeningBillingPortal] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [isRedeeming, setIsRedeeming] = useState(false);

  const handleRedeemCode = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code) return;
    setIsRedeeming(true);
    try {
      const { data, error } = await supabase.functions.invoke("redeem-gift-card-by-code", {
        body: { code },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`$${Number((data as any).amount).toFixed(2)} credit added to your account!`);
      setRedeemCode("");
      fetchProfile();
    } catch (e: any) {
      toast.error(e.message || "Could not redeem code. Please check and try again.");
    } finally {
      setIsRedeeming(false);
    }
  };
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);

  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
  });
  const [sgtMember, setSgtMember] = useState<SGTMember | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchPaymentMethods();
    }
  }, [user]);

  // Handle success/cancel from Stripe checkout
  useEffect(() => {
    const setup = searchParams.get("setup");
    if (setup === "success") {
      toast.success("Payment method added successfully!");
      fetchPaymentMethods();
      // Clean up URL
      navigate("/my-account", { replace: true });
    } else if (setup === "cancelled") {
      toast.info("Payment method setup was cancelled.");
      navigate("/my-account", { replace: true });
    }

    const pack = searchParams.get("pack");
    if (pack === "success") {
      toast.success("Payment received — your prepaid hours are on the way.");
      navigate("/my-account", { replace: true });
    } else if (pack === "cancelled") {
      toast.info("Pack purchase cancelled.");
      navigate("/my-account", { replace: true });
    }
  }, [searchParams, navigate]);


  const fetchProfile = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, membership_tier, deposit_balance, sgt_user_id, payment_failed_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);

      // If user has SGT account, fetch their SGT member info
      if (data?.sgt_user_id) {
        const { data: sgtData, error: sgtError } = await supabase
          .from("sgt_members")
          .select("user_name, user_game_id")
          .eq("user_id", data.sgt_user_id)
          .maybeSingle();

        if (!sgtError && sgtData) {
          setSgtMember(sgtData);
        }
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
      toast.error("Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopySGT = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success(`${field} copied to clipboard`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const fetchPaymentMethods = async () => {
    setIsLoadingPaymentMethods(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-payment-methods");
      
      if (error) throw error;
      setPaymentMethods(data.paymentMethods || []);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
    } finally {
      setIsLoadingPaymentMethods(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    setIsAddingPaymentMethod(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout-setup");
      
      if (error) throw error;
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error creating checkout session:", error);
      toast.error("Failed to start payment setup");
      setIsAddingPaymentMethod(false);
    }
  };

  const handleDeletePaymentMethod = async (paymentMethodId: string) => {
    // Block deletion for members - they must contact us
    if (profile?.membership_tier && profile.membership_tier !== "casual") {
      setShowMembershipBlockDialog(true);
      return;
    }

    setDeletingPaymentMethodId(paymentMethodId);
    try {
      const { data, error } = await supabase.functions.invoke("delete-payment-method", {
        body: { paymentMethodId },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast.success("Payment method removed successfully");
      fetchPaymentMethods();
    } catch (error) {
      console.error("Error deleting payment method:", error);
      toast.error("Failed to remove payment method");
    } finally {
      setDeletingPaymentMethodId(null);
    }
  };

  const handleOpenBillingPortal = async () => {
    setIsOpeningBillingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-portal");
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Error opening billing portal:", error);
      toast.error("Failed to open billing portal. Please try again.");
    } finally {
      setIsOpeningBillingPortal(false);
    }
  };

  const handleStartEditProfile = () => {
    setEditForm({
      first_name: profile?.first_name || "",
      last_name: profile?.last_name || "",
      phone: profile?.phone || "",
    });
    setIsEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setIsEditingProfile(false);
    setEditForm({
      first_name: "",
      last_name: "",
      phone: "",
    });
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          phone: editForm.phone.trim() || null,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast.success("Profile updated successfully");
      setIsEditingProfile(false);
      fetchProfile();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Failed to update profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      toast.error("Please fill in both password fields");
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });

      if (error) throw error;
      
      toast.success("Password updated successfully!");
      setShowPasswordDialog(false);
      setPasswordForm({ newPassword: "", confirmPassword: "" });
    } catch (error) {
      console.error("Error updating password:", error);
      toast.error("Failed to update password. Please try again.");
    } finally {
      setIsChangingPassword(false);
    }
  };



  const getPaymentMethodDisplay = (method: PaymentMethod) => {
    if (method.type === "link" || method.brand === "link") {
      return { icon: "🔗 Link", label: method.email || `•••• ${method.last4}` };
    }
    const brandLower = method.brand.toLowerCase();
    if (brandLower === "visa") return { icon: "💳 Visa", label: `•••• ${method.last4}` };
    if (brandLower === "mastercard") return { icon: "💳 Mastercard", label: `•••• ${method.last4}` };
    if (brandLower === "amex") return { icon: "💳 Amex", label: `•••• ${method.last4}` };
    return { icon: `💳 ${method.brand.charAt(0).toUpperCase() + method.brand.slice(1)}`, label: `•••• ${method.last4}` };
  };

  // Tier name, badge style and rate all come from pricing config
  const activeTier = getTier(profile?.membership_tier || defaultTier?.tier || "");
  const membershipInfo = {
    name: activeTier?.display_name || defaultTier?.display_name || "Walk-in",
    color: tierBadgeClass(pricing, activeTier?.tier),
    rate: activeTier ? Number(activeTier.hourly_rate) : peakRate,
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Membership Block Dialog */}
      <MembershipPaymentIssueDialog
        open={showPaymentIssueDialog}
        onOpenChange={setShowPaymentIssueDialog}
        onResolved={() => {
          fetchProfile();
          fetchPaymentMethods();
        }}
      />

      <AlertDialog open={showMembershipBlockDialog} onOpenChange={setShowMembershipBlockDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot Remove Payment Method</AlertDialogTitle>
            <AlertDialogDescription>
              Your payment method is linked to your active membership and cannot be removed.
              To cancel your membership or update your payment details, please contact us directly.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowMembershipBlockDialog(false)}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <header className="bg-primary py-4 px-6 flex items-center justify-between safe-area-top">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/dashboard")}
            className="text-primary-foreground hover:bg-primary-foreground/10"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-display text-base sm:text-2xl tracking-wide text-primary-foreground">
            MY ACCOUNT
          </span>
        </div>
        <img 
          src={venueLogo} 
          alt={tenant.venue_name} 
          className="h-7 sm:h-10 w-auto"
        />
      </header>

      {/* Main content */}
      <main className="flex-1 p-6">
        <div className="container max-w-2xl mx-auto space-y-6">
          {/* Payment issue banner */}
          {profile?.payment_failed_at && (
            <Card className="border-destructive bg-destructive/5">
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-destructive/15 flex items-center justify-center shrink-0">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-destructive">
                      Membership Payment Failed
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your last membership payment didn't go through, so new bookings are
                      paused until you settle the outstanding invoice. You're still a member,
                      we just need to retry payment.
                    </p>
                    <Button
                      className="mt-3 gradient-orange"
                      onClick={() => setShowPaymentIssueDialog(true)}
                    >
                      Fix my membership
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Membership Tier — corporate accounts bill through their company wallet */}
          {!corporateAccount && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Crown className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Membership</CardTitle>
                  <CardDescription>Your current membership tier and benefits</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <Badge className={`${membershipInfo.color} text-sm px-3 py-1`}>
                      {membershipInfo.name}
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-2">
                      Your hourly rate: <span className="font-semibold text-foreground">${membershipInfo.rate}/hour</span>
                    </p>
                  </div>
                  <Button variant="outline" onClick={() => navigate("/membership")}>
                    {profile?.membership_tier === "casual" ? "Become a Member" : "View Plans"}
                  </Button>
                </div>
                {profile?.membership_tier !== "casual" && (
                  <p className="text-xs text-muted-foreground">
                    To cancel your membership, please contact us.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Account Credit */}
          {(profile?.deposit_balance || 0) > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Wallet className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Account Credit</CardTitle>
                    <CardDescription>Available credit balance</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-primary">
                      ${(profile?.deposit_balance || 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Prepaid Hour Packs */}
          <PrepaidPacksCard />

          {/* Redeem Gift Card */}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Gift className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Redeem Gift Card</CardTitle>
                  <CardDescription>Got a printed gift card? Enter the code to add credit.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="UF-XXXXXX"
                  value={redeemCode}
                  onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
                  className="font-mono tracking-wider uppercase"
                  disabled={isRedeeming}
                />
                <Button onClick={handleRedeemCode} disabled={isRedeeming || !redeemCode.trim()}>
                  {isRedeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Redeem"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SGT Info */}
          {sgtMember && (
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <Gamepad2 className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>{tenant.venue_name} League Account</CardTitle>
                    <CardDescription>Your simulator golf tour credentials</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm text-muted-foreground">Username</p>
                      <p className="font-medium">{sgtMember.user_name}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopySGT("Username", sgtMember.user_name)}
                      className="h-8 w-8"
                    >
                      {copiedField === "Username" ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {sgtMember.user_game_id && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div>
                        <p className="text-sm text-muted-foreground">Game ID (UID)</p>
                        <p className="font-medium font-mono">{sgtMember.user_game_id}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopySGT("Game ID", sgtMember.user_game_id!)}
                        className="h-8 w-8"
                      >
                        {copiedField === "Game ID" ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Use these details if prompted during your session
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Profile Information */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>Your personal details</CardDescription>
                  </div>
                </div>
                {!isEditingProfile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartEditProfile}
                  >
                    <Pencil className="h-4 w-4 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={isEditingProfile ? editForm.first_name : (profile?.first_name || "")}
                    onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
                    disabled={!isEditingProfile}
                    className={!isEditingProfile ? "bg-muted" : ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={isEditingProfile ? editForm.last_name : (profile?.last_name || "")}
                    onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
                    disabled={!isEditingProfile}
                    className={!isEditingProfile ? "bg-muted" : ""}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={profile?.email || user?.email || ""}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Phone
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter phone number"
                  value={isEditingProfile ? editForm.phone : (profile?.phone || "")}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  disabled={!isEditingProfile}
                  className={!isEditingProfile ? "bg-muted" : ""}
                />
              </div>
              {isEditingProfile && (
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    {isSavingProfile ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCancelEditProfile}
                    disabled={isSavingProfile}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>Manage your saved payment methods</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingPaymentMethods ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : paymentMethods.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-muted-foreground mb-4">No payment methods saved</p>
                  <Button 
                    variant="outline" 
                    onClick={handleAddPaymentMethod}
                    disabled={isAddingPaymentMethod}
                  >
                    {isAddingPaymentMethod ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Payment Method
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {paymentMethods.map((method, index) => (
                    <div
                      key={method.id}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{getPaymentMethodDisplay(method).icon}</span>
                        <div>
                          <p className="font-medium">{getPaymentMethodDisplay(method).label}</p>
                          {method.expMonth && method.expYear && (
                            <p className="text-sm text-muted-foreground">
                              Expires {method.expMonth}/{method.expYear}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {index === 0 && <Badge variant="secondary">Default</Badge>}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePaymentMethod(method.id)}
                          disabled={deletingPaymentMethodId === method.id}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          {deletingPaymentMethodId === method.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2 mt-2">
                    {/* For members: show Update Card button to open Stripe billing portal */}
                    {profile?.membership_tier && profile.membership_tier !== "casual" && (
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={handleOpenBillingPortal}
                        disabled={isOpeningBillingPortal}
                      >
                        {isOpeningBillingPortal ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Opening...
                          </>
                        ) : (
                          <>
                            <Pencil className="h-4 w-4 mr-2" />
                            Update Card
                          </>
                        )}
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleAddPaymentMethod}
                      disabled={isAddingPaymentMethod}
                    >
                      {isAddingPaymentMethod ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Setting up...
                        </>
                      ) : (
                        <>
                          <Plus className="h-4 w-4 mr-2" />
                          Add Another Card
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Security */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Lock className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <CardTitle>Security</CardTitle>
                  <CardDescription>Manage your password and security settings</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">

              {/* Password Change */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="font-medium">Password</p>
                  <p className="text-sm text-muted-foreground">
                    Update your account password
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordDialog(true)}
                >
                  Change Password
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Password Change Dialog */}
          <AlertDialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change Password</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter your new password below. Must be at least 6 characters.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type={showPassword ? "text" : "password"}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>
              <AlertDialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setPasswordForm({ newPassword: "", confirmPassword: "" });
                  }}
                  disabled={isChangingPassword}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePasswordChange}
                  disabled={isChangingPassword}
                >
                  {isChangingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Update Password"
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-primary py-4 px-6 text-center">
        <p className="text-primary-foreground/60 text-sm">
          © {new Date().getFullYear()} {tenant.venue_name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
};

export default MyAccount;