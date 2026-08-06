import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save, AlertCircle, AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface TierRow {
  id: string;
  tier: string;
  display_name: string;
  hourly_rate: number | null;
  off_peak_hourly_rate: number | null;
  weekly_subscription_price: number | null;
  is_default: boolean;
  is_subscription: boolean;
  requires_verification: boolean;
  display_order: number;
  stripe_price_id: string | null;
}

type Draft = Record<string, { weekly: string; hourly: string; offPeak: string }>;

const num = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));

/**
 * Single source of truth editor for membership tier pricing and casual
 * (walk-in) peak / off-peak rates. Everything written here feeds the app,
 * homepage and membership page via `pricing_config`.
 */
export const PricingRatesSettings = () => {
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmRow, setConfirmRow] = useState<TierRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pricing_config")
      .select(
        "id,tier,display_name,hourly_rate,off_peak_hourly_rate,weekly_subscription_price,is_default,is_subscription,requires_verification,display_order,stripe_price_id",
      )
      .order("display_order");
    if (error) {
      toast.error("Couldn't load pricing");
    } else {
      const rows = (data ?? []) as TierRow[];
      setTiers(rows);
      setDraft(
        Object.fromEntries(
          rows.map((r) => [
            r.id,
            {
              weekly: str(r.weekly_subscription_price),
              hourly: str(r.hourly_rate),
              offPeak: str(r.off_peak_hourly_rate),
            },
          ]),
        ),
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const setField = (id: string, field: keyof Draft[string], value: string) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], [field]: value } }));

  const isDirty = (row: TierRow) => {
    const d = draft[row.id];
    if (!d) return false;
    return (
      d.weekly !== str(row.weekly_subscription_price) ||
      d.hourly !== str(row.hourly_rate) ||
      d.offPeak !== str(row.off_peak_hourly_rate)
    );
  };

  const weeklyChanged = (row: TierRow) =>
    !row.is_default && draft[row.id]?.weekly !== str(row.weekly_subscription_price);

  const requestSave = (row: TierRow) => {
    if (weeklyChanged(row)) {
      setConfirmRow(row);
      return;
    }
    save(row);
  };

  const save = async (row: TierRow) => {
    const d = draft[row.id];
    const hourly = num(d.hourly);
    if (hourly === null) {
      toast.error("Hourly rate is required and must be a positive number");
      return;
    }
    setSavingId(row.id);
    const { error } = await supabase
      .from("pricing_config")
      .update({
        hourly_rate: hourly,
        off_peak_hourly_rate: num(d.offPeak),
        weekly_subscription_price: row.is_default ? null : num(d.weekly),
      })
      .eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast.error(`Couldn't save ${row.display_name}: ${error.message}`);
      return;
    }
    toast.success(`${row.display_name} pricing updated`);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );
  }

  const casual = tiers.filter((t) => t.is_default);
  const members = tiers.filter((t) => !t.is_default);

  const renderTier = (row: TierRow) => {
    const d = draft[row.id];
    const dirty = isDirty(row);
    return (
      <Card key={row.id}>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{row.display_name}</span>
            {row.requires_verification && (
              <Badge variant="outline" className="text-xs">Verification required</Badge>
            )}
            {!row.stripe_price_id && (
              <Badge variant="secondary" className="text-xs">Stripe not linked</Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`weekly-${row.id}`}>Weekly membership fee ($)</Label>
              <Input
                id={`weekly-${row.id}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={d.weekly}
                onChange={(e) => setField(row.id, "weekly", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`hourly-${row.id}`}>Member hourly rate ($)</Label>
              <Input
                id={`hourly-${row.id}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={d.hourly}
                onChange={(e) => setField(row.id, "hourly", e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`offpeak-${row.id}`}>Off-peak hourly rate ($) — optional</Label>
            <Input
              id={`offpeak-${row.id}`}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={d.offPeak}
              onChange={(e) => setField(row.id, "offPeak", e.target.value)}
              placeholder="Leave blank to use the member hourly rate at all times"
            />
          </div>

          {weeklyChanged(row) && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Changing the weekly fee applies to <strong>every {row.display_name} member</strong>,
                existing and new — all members stay on one consistent price.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button size="sm" onClick={() => requestSave(row)} disabled={!dirty || savingId === row.id}>
              <Save className="h-4 w-4 mr-2" />
              {savingId === row.id ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderCasual = (row: TierRow) => {
    const d = draft[row.id];
    const dirty = isDirty(row);
    return (
      <Card key={row.id}>
        <CardContent className="pt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{row.display_name}</span>
            <Badge variant="outline" className="text-xs">Pay as you go</Badge>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`peak-${row.id}`}>Peak hourly rate ($)</Label>
              <Input
                id={`peak-${row.id}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={d.hourly}
                onChange={(e) => setField(row.id, "hourly", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mon–Fri 4:00pm–11:00pm, Sat–Sun 10:00am–11:00pm, and all public holidays.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`offpeakc-${row.id}`}>Off-peak hourly rate ($)</Label>
              <Input
                id={`offpeakc-${row.id}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={d.offPeak}
                onChange={(e) => setField(row.id, "offPeak", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mon–Fri 5:30am–4:00pm and Sat–Sun 5:30am–10:00am.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => save(row)} disabled={!dirty || savingId === row.id}>
              <Save className="h-4 w-4 mr-2" />
              {savingId === row.id ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>
          These rates are the single source of truth — the app, homepage and membership page all
          read from here. Stripe subscriptions are not linked yet, so changing a weekly fee updates
          what's displayed and charged for new sign-ups only once Stripe is wired up.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Membership tiers
        </h3>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No membership tiers configured.</p>
        ) : (
          members.map(renderTier)
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Casual rates
        </h3>
        {casual.length === 0 ? (
          <p className="text-sm text-muted-foreground">No casual tier configured.</p>
        ) : (
          casual.map(renderCasual)
        )}
      </section>
    </div>
  );
};
