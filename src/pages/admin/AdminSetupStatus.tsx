import { AdminLayout } from "@/components/admin/AdminLayout";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { TestingSchedule } from "@/components/admin/TestingSchedule";

export default function AdminSetupStatus() {
  const { isAdmin, isLoading } = useAdminAuth();

  if (isLoading) return null;
  if (!isAdmin) return null;

  const onTestDomain = !window.location.hostname.endsWith("urbanfairways.com.au");

  return (
    <AdminLayout>
      <div className="p-4 lg:p-6 space-y-6">
        <div>
          <h1 className="font-display text-2xl lg:text-3xl uppercase tracking-wide text-foreground">
            Setup Status
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Domain handover reminders and the go-live testing schedule.
          </p>
        </div>

        {onTestDomain && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-base uppercase tracking-wide flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Before switching to urbanfairways.com.au
              </CardTitle>
              <CardDescription>
                Still running on a testing URL. Two things break the moment the domain
                changes unless they are handed over first.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-foreground space-y-2">
              <p>
                <span className="font-semibold">1. Stripe webhooks</span> — re-point the
                endpoint to the new URL and re-save{" "}
                <code className="text-xs">STRIPE_WEBHOOK_SECRET</code> if Stripe issues a new
                signing secret. Payments fail silently otherwise.
              </p>
              <p>
                <span className="font-semibold">2. Bay Controller</span> — update{" "}
                <code className="text-xs">HUB_ORIGIN</code> in{" "}
                <code className="text-xs">electron/main.js</code> and push to main so every
                bay PC auto-updates. All bay automation stops otherwise.
              </p>
              <p className="text-muted-foreground">
                Full list: <code className="text-xs">docs/platform/GO-LIVE-CHECKLIST.md</code>
              </p>
            </CardContent>
          </Card>
        )}

        <TestingSchedule />
      </div>
    </AdminLayout>
  );
}
