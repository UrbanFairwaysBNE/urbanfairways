import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Gift, Loader2 } from "lucide-react";

interface LoyaltySettings {
  enabled: boolean;
  visit_threshold: number;
  credit_amount: number;
}

export function LoyaltyPromoSettings() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<LoyaltySettings>({
    enabled: false,
    visit_threshold: 5,
    credit_amount: 35,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [creditsIssued, setCreditsIssued] = useState(0);

  useEffect(() => {
    fetchSettings();
    fetchCreditsCount();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("loyalty_promo_settings")
      .select("*")
      .eq("id", "global")
      .single();

    if (!error && data) {
      setSettings({
        enabled: data.enabled,
        visit_threshold: data.visit_threshold,
        credit_amount: data.credit_amount,
      });
    }
    setIsLoading(false);
  };

  const fetchCreditsCount = async () => {
    const { count } = await supabase
      .from("loyalty_credits_issued")
      .select("*", { count: "exact", head: true });
    setCreditsIssued(count || 0);
  };

  const saveSettings = async () => {
    if (settings.visit_threshold < 1 || settings.credit_amount <= 0) {
      toast({
        title: "Invalid settings",
        description: "Visit threshold must be at least 1 and credit amount must be positive.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const { error } = await supabase
      .from("loyalty_promo_settings")
      .update({
        enabled: settings.enabled,
        visit_threshold: settings.visit_threshold,
        credit_amount: settings.credit_amount,
      })
      .eq("id", "global");

    if (error) {
      toast({
        title: "Error saving settings",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Loyalty settings saved",
        description: settings.enabled
          ? `Casual customers will earn $${settings.credit_amount.toFixed(2)} every ${settings.visit_threshold} visits.`
          : "Loyalty promo is disabled.",
      });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5 shrink-0" />
              Casual Loyalty Promo
            </CardTitle>
            <CardDescription>
              Reward casual customers with credit after reaching a booking milestone
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {creditsIssued > 0 && (
              <Badge variant="secondary">{creditsIssued} issued</Badge>
            )}
            <Badge variant={settings.enabled ? "default" : "secondary"} className={settings.enabled ? "bg-green-600" : ""}>
              {settings.enabled ? "Active" : "Disabled"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="loyalty-enabled">Enable loyalty promo</Label>
          <Switch
            id="loyalty-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) =>
              setSettings((s) => ({ ...s, enabled: checked }))
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="visit-threshold">Visits required</Label>
            <Input
              id="visit-threshold"
              type="number"
              min="1"
              value={settings.visit_threshold}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  visit_threshold: parseInt(e.target.value) || 1,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Credit is earned every {settings.visit_threshold} bookings
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="credit-amount">Credit amount ($)</Label>
            <Input
              id="credit-amount"
              type="number"
              min="1"
              step="0.01"
              value={settings.credit_amount}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  credit_amount: parseFloat(e.target.value) || 0,
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Added to casual customer's balance automatically
            </p>
          </div>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
          <strong className="text-foreground">How it works:</strong> When a casual customer's total booking count reaches a multiple of {settings.visit_threshold} (e.g. {settings.visit_threshold}, {settings.visit_threshold * 2}, {settings.visit_threshold * 3}...), they automatically receive ${settings.credit_amount.toFixed(2)} credit and a notification email. Only casual customers (non-members) are eligible.
        </div>

        <Button onClick={saveSettings} disabled={isSaving} className="w-full">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Loyalty Settings"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
