import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Eye, RotateCcw, Save, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant, formatTenantAddress, bookingUrl, type TenantSettings } from "@/config/tenant";

// Kept in sync with supabase/functions/_shared/email-wrapper.ts DEFAULTS.
const buildDefaultHeaderHtml = (t: TenantSettings) => `<tr>
  <td align="center" style="background-color:#1C1F24; padding:18px; border-radius:16px 16px 0 0;">
    <img
      src="${bookingUrl(t, "/__l5e/assets-v1/9691088f-3b4b-41b4-bcb3-d4cd4de1540c/venue-logo-email.png")}"
      width="140"
      alt="${t.venue_name}"
      style="display:block; width:140px; height:auto; border:0;"
    />
  </td>
</tr>`;

const buildDefaultFooterHtml = (t: TenantSettings) => `<tr>
  <td style="background-color:#1C1F24; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td align="center" style="padding-bottom:14px;">
          <a href="${t.socials?.instagram || "#"}" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
          <a href="${t.socials?.facebook || "#"}" style="margin:0 8px; text-decoration:none;">
            <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="font-family:Montserrat, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          <div><a href="https://maps.google.com/?q=${encodeURIComponent(formatTenantAddress(t))}" style="color:#FFFFFF; text-decoration:underline;">${formatTenantAddress(t)}</a></div>
          <div><a href="tel:${t.support_phone}" style="color:#FFFFFF; text-decoration:underline;">${t.support_phone}</a></div>
          <div><a href="https://${t.booking_domain}" style="color:#FFFFFF; text-decoration:underline;">${t.booking_domain}</a></div>
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">© ${t.venue_name}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

const buildPreview = (header: string, footer: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>@import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&family=Montserrat:wght@400;600&display=swap");</style>
</head>
<body style="margin:0; padding:0; background-color:#F4F1EB;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F4F1EB;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
        ${header}
        <tr><td style="background-color:#F4F1EB; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
          <h1 style="margin:0 0 14px; font-family:Montserrat, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1C1F24; text-align:center;">Sample Email Heading</h1>
          <p style="font-family:Montserrat,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1C1F24;text-align:center;margin:0 0 12px;">This is where the body of each email template appears. The header above and footer below are shared across every customer email and can be edited here.</p>
        </td></tr>
        ${footer}
      </table>
    </td></tr>
  </table>
</body></html>`;

export const EmailLayoutEditor = () => {
  const { tenant } = useTenant();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [initial, setInitial] = useState({ header: "", footer: "" });
  const [previewOpen, setPreviewOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("email_layout")
      .select("header_html, footer_html")
      .eq("id", "global")
      .maybeSingle();

    if (error) {
      toast({ title: "Failed to load layout", description: error.message, variant: "destructive" });
    }

    const h = data?.header_html || buildDefaultHeaderHtml(tenant);
    const f = data?.footer_html || buildDefaultFooterHtml(tenant);
    setHeader(h);
    setFooter(f);
    setInitial({ header: h, footer: f });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const dirty = header !== initial.header || footer !== initial.footer;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("email_layout")
      .update({ header_html: header, footer_html: footer, updated_at: new Date().toISOString() })
      .eq("id", "global");

    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Email layout saved",
        description: "Header and footer will apply to every customer email from now on.",
      });
      setInitial({ header, footer });
    }
    setSaving(false);
  };

  const resetToDefault = (which: "header" | "footer") => {
    if (which === "header") setHeader(buildDefaultHeaderHtml(tenant));
    else setFooter(buildDefaultFooterHtml(tenant));
  };

  // Mirrors applyTenantTokens() in supabase/functions/_shared/email-wrapper.ts
  const applyTokens = (html: string) => {
    const values: Record<string, string> = {
      venue_name: tenant.venue_name || "",
      legal_entity: tenant.legal_entity || "",
      address: formatTenantAddress(tenant),
      support_phone: tenant.support_phone || "",
      support_email: tenant.support_email || "",
      booking_domain: tenant.booking_domain || "",
      hub_domain: tenant.hub_domain || "",
    };
    return html.replace(
      /\{\{\s*(venue_name|legal_entity|address|support_phone|support_email|booking_domain|hub_domain)\s*\}\}/g,
      (_m, key: string) => values[key] ?? "",
    );
  };

  const previewSrc = useMemo(
    () => buildPreview(applyTokens(header), applyTokens(footer)),
    [header, footer, tenant],
  );


  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            The header and footer here wrap <strong>every customer email</strong> — booking
            confirmations, welcome, membership, gift cards, loyalty, credits, league emails
            and more. Individual email templates only contain body content; the wrapper is
            applied automatically at send time.
            <br />
            Edit raw email-safe HTML (inline styles, table-based layout). Both blocks
            should be a single <code>{"<tr>"}</code> row that sits inside the 600px
            container.
          </AlertDescription>
        </Alert>

        {loading ? (
          <>
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-header-html" className="text-sm font-medium">
                  Header HTML
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetToDefault("header")}
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset to default
                </Button>
              </div>
              <Textarea
                id="email-header-html"
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                rows={10}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="email-footer-html" className="text-sm font-medium">
                  Footer HTML
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resetToDefault("footer")}
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Reset to default
                </Button>
              </div>
              <Textarea
                id="email-footer-html"
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                rows={14}
                className="font-mono text-xs"
                spellCheck={false}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button onClick={save} disabled={!dirty || saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving…" : "Save layout"}
              </Button>
              <Button variant="outline" onClick={() => setPreviewOpen(true)}>
                <Eye className="h-4 w-4 mr-2" /> Preview
              </Button>
              {dirty && (
                <span className="text-xs text-muted-foreground">Unsaved changes</span>
              )}
            </div>
          </>
        )}

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Email preview</DialogTitle>
            </DialogHeader>
            <iframe
              srcDoc={previewSrc}
              title="Email preview"
              className="w-full h-[70vh] border rounded-md bg-white"
            />
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default EmailLayoutEditor;
