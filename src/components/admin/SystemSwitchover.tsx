import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Code2, Copy, Eye, FileText, Loader2 } from "lucide-react";
import { useTenant } from "@/config/tenant";
import { getSwitchoverNotices } from "@/lib/switchover-notices";
import { renderTemplatePreview } from "@/lib/email-preview";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmailPreviewFrame } from "@/components/admin/EmailPreviewFrame";

export function SystemSwitchover() {
  const { tenant, isLoading, error } = useTenant();
  const { toast } = useToast();
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [copying, setCopying] = useState<string | null>(null);
  const notices = getSwitchoverNotices(tenant);

  const showPreview = async (notice: typeof notices[number]) => {
    setPreviewing(notice.id);
    try {
      const html = await renderTemplatePreview(notice.subject, notice.html);
      setPreview({ subject: notice.subject, html });
    } catch {
      toast({ title: "Preview unavailable", description: "Please try again.", variant: "destructive" });
    } finally {
      setPreviewing(null);
    }
  };

  const copyNotice = async (notice: typeof notices[number]) => {
    try {
      await navigator.clipboard.writeText(`Subject: ${notice.subject}\n\n${notice.text}`);
      toast({ title: "Notice copied" });
    } catch {
      toast({ title: "Could not copy notice", variant: "destructive" });
    }
  };

  /**
   * Branded body markup only — fonts, colours and the button are styled
   * inline so it matches the preview wherever it is pasted. The bulk email
   * sender adds the header, footer and unsubscribe link itself, so copying
   * the whole document would brand the email twice.
   */
  const copyHtml = async (notice: typeof notices[number]) => {
    setCopying(notice.id);
    try {
      await navigator.clipboard.writeText(notice.html);
      toast({
        title: "Branded email body copied",
        description: "Paste it into Bulk email → HTML Content. The header, footer and unsubscribe link are added when it sends.",
      });
    } catch {
      toast({ title: "Could not copy HTML", variant: "destructive" });
    } finally {
      setCopying(null);
    }
  };

  return (
    <div className="space-y-8">
      <header className="space-y-3 border-b pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-display">System switchover</h2>
          <Badge variant="outline">Preparation only</Badge>
        </div>
        <p className="font-medium">Tuesday 20 October 2026 · Brisbane (AEST)</p>
        <p className="text-sm text-muted-foreground">No emails have been sent from this section. Membership cancellations and credits have not been scheduled.</p>
      </header>

      <section className="space-y-4" aria-label="Switchover notices">
        <h3 className="font-display text-lg">Customer notices</h3>
        {error && <p className="text-destructive">Venue details could not be loaded. Please try again before using the notices.</p>}
        {notices.map((notice) => (
          <Card key={notice.id}>
            <CardContent className="p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h4 className="font-medium flex items-center gap-2"><FileText className="h-4 w-4 shrink-0" />{notice.title}</h4>
                <Badge variant="secondary">Draft · Not sent</Badge>
              </div>
              <p className="text-sm font-medium break-words">{notice.subject}</p>
              <div className="whitespace-pre-line text-sm leading-relaxed">{notice.text}</div>
              {notice.id === "launch-day" && <p className="text-sm text-destructive">Send only after the accounts, cancellations and credits are verified. Customers set their password themselves through the forgot-password form linked in the notice.</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={isLoading || Boolean(error) || previewing !== null} onClick={() => showPreview(notice)}>
                  {previewing === notice.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}Preview email
                </Button>
                <Button variant="ghost" disabled={isLoading || Boolean(error)} onClick={() => copyNotice(notice)}><Copy className="h-4 w-4 mr-2" />Copy notice</Button>
                <Button variant="ghost" disabled={isLoading || Boolean(error) || copying !== null} onClick={() => copyHtml(notice)}>
                  {copying === notice.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Code2 className="h-4 w-4 mr-2" />}Copy HTML email
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4 border-t pt-6" aria-label="Launch readiness">
        <h3 className="font-display text-lg">Launch readiness · Not yet verified</h3>
        <ol className="list-decimal pl-5 space-y-3 text-sm leading-relaxed">
          <li>Export the old customer list and active memberships, including each member’s current weekly price. Keep this snapshot for the one-week credit calculation.</li>
          <li>Import customer accounts, reconcile duplicates by email and check existing accounts are preserved. Importing alone does not cancel memberships or issue credit.</li>
          <li>Confirm the exact cancellation time and stop recurring billing in the old system. Reconcile every subscription before opening new membership signups.</li>
          <li>Issue each current member’s one-week dollar credit once, with an auditable account-credit entry. Verify it can be used to pay for a session.</li>
          <li>Test an imported customer’s secure password link, sign-in, credit balance and new membership signup before sending launch-day notices.</li>
        </ol>
        <Button variant="outline" asChild><Link to="/admin/customer-import">Customer import<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
      </section>

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{preview?.subject}</DialogTitle></DialogHeader>
          {preview && <EmailPreviewFrame html={preview.html} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
