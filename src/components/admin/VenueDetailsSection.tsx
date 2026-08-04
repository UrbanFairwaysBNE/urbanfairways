import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  TENANT_DEFAULTS,
  TENANT_QUERY_KEY,
  useTenant,
  type TenantSettings,
} from "@/config/tenant";

const FIELDS: { key: keyof TenantSettings; label: string; placeholder?: string }[] = [
  { key: "venue_name", label: "Venue name", placeholder: "Your Venue" },
  { key: "legal_entity", label: "Legal entity", placeholder: "Your Venue Pty Ltd" },
  { key: "abn", label: "ABN", placeholder: "00 000 000 000" },
  { key: "booking_domain", label: "Booking domain", placeholder: "example.com" },
  { key: "hub_domain", label: "Hub domain", placeholder: "hub.example.com" },
  { key: "support_phone", label: "Support phone", placeholder: "07 0000 0000" },
  { key: "support_email", label: "Support email", placeholder: "info@example.com" },
  { key: "sender_email", label: "Sender email", placeholder: "noreply@example.com" },
  { key: "admin_alert_email", label: "Admin alert email", placeholder: "admin@example.com" },
  { key: "address_line", label: "Street address", placeholder: "1 Example Street" },
  { key: "suburb", label: "Suburb", placeholder: "Suburb" },
  { key: "state", label: "State", placeholder: "QLD" },
  { key: "postcode", label: "Postcode", placeholder: "4000" },
];


const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "youtube"] as const;

export default function VenueDetailsSection() {
  const { tenant, isLoading } = useTenant();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<TenantSettings>(TENANT_DEFAULTS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isLoading) setForm(tenant);
  }, [isLoading, tenant]);

  const setField = (key: keyof TenantSettings, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setSocial = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, socials: { ...prev.socials, [key]: value } }));

  const save = async () => {
    setIsSaving(true);
    try {
      const payload = { ...form };
      delete (payload as { id?: string }).id;

      const { error } = form.id
        ? await supabase.from("tenant_settings").update(payload).eq("id", form.id)
        : await supabase.from("tenant_settings").insert(payload);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: TENANT_QUERY_KEY });
      toast({ title: "Venue details saved" });
    } catch (e) {
      toast({
        title: "Could not save venue details",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading venue details…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`tenant-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`tenant-${f.key}`}
                    value={(form[f.key] as string) ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <h3 className="font-medium">Social links</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {SOCIAL_KEYS.map((key) => (
                  <div key={key} className="space-y-1.5">
                    <Label htmlFor={`tenant-social-${key}`} className="capitalize">
                      {key}
                    </Label>
                    <Input
                      id={`tenant-social-${key}`}
                      value={form.socials?.[key] ?? ""}
                      placeholder="https://…"
                      onChange={(e) => setSocial(key, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button onClick={save} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save venue details
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
