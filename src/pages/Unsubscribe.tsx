import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, XCircle, MailX } from "lucide-react";
import { useTenant, hubUrl } from "@/config/tenant";

export default function Unsubscribe() {
  const { tenant } = useTenant();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  const email = searchParams.get("email");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!email) {
      setStatus("error");
      setErrorMessage("Invalid unsubscribe link. No email provided.");
      return;
    }

    const processUnsubscribe = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("marketing-unsubscribe", {
          body: { email, token },
        });

        if (error) throw error;

        if (data?.success) {
          setStatus("success");
        } else {
          throw new Error(data?.error || "Failed to unsubscribe");
        }
      } catch (err: any) {
        console.error("Unsubscribe error:", err);
        setStatus("error");
        setErrorMessage(err.message || "Something went wrong. Please try again.");
      }
    };

    processUnsubscribe();
  }, [email, token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {status === "loading" && (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            )}
            {status === "success" && (
              <CheckCircle2 className="h-12 w-12 text-green-600" />
            )}
            {status === "error" && (
              <XCircle className="h-12 w-12 text-destructive" />
            )}
            {status === "already" && (
              <MailX className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <CardTitle>
            {status === "loading" && "Processing..."}
            {status === "success" && "Unsubscribed Successfully"}
            {status === "error" && "Oops!"}
            {status === "already" && "Already Unsubscribed"}
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Please wait while we process your request."}
            {status === "success" && (
              <>
                You've been unsubscribed from {tenant.venue_name} marketing emails.
                <br />
                <span className="text-xs text-muted-foreground mt-2 block">
                  You'll still receive booking confirmations and important account updates.
                </span>
              </>
            )}
            {status === "error" && errorMessage}
            {status === "already" && "You're already unsubscribed from marketing emails."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button
            variant="outline"
            onClick={() => window.location.href = hubUrl(tenant, "/")}
          >
            Go to Hub
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
