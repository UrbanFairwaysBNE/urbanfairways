import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Frown, Meh, Smile, CheckCircle2 } from "lucide-react";
import venueLogo from "@/assets/venue-logo.png";
import { useTenant, formatTenantAddress } from "@/config/tenant";

type Score = "bad" | "ok" | "good";

const scoreOptions: { value: Score; label: string; icon: typeof Frown; color: string }[] = [
  { value: "bad", label: "Bad", icon: Frown, color: "text-red-500 hover:bg-red-50 border-red-200" },
  { value: "ok", label: "OK", icon: Meh, color: "text-amber-500 hover:bg-amber-50 border-amber-200" },
  { value: "good", label: "Good", icon: Smile, color: "text-emerald-600 hover:bg-emerald-50 border-emerald-200" },
];

export default function Feedback() {
  const { tenant } = useTenant();
  const { token: routeToken, quick: routeQuick } = useParams<{ token?: string; quick?: Score }>();
  const [searchParams] = useSearchParams();
  const token = routeToken || searchParams.get("token") || "";
  const quickScore = (routeQuick || searchParams.get("quick")) as Score | null;

  // Support legacy URL params, but also look up from token
  const [prefillName, setPrefillName] = useState(searchParams.get("name") || "");
  const [prefillEmail, setPrefillEmail] = useState(searchParams.get("email") || "");

  const [score, setScore] = useState<Score | null>(
    quickScore && ["bad", "ok", "good"].includes(quickScore) ? quickScore : null
  );
  const [name, setName] = useState(prefillName);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Look up name/email from token if not in URL params
  useEffect(() => {
    if (token && !searchParams.get("name")) {
      supabase
        .from("feedback_emails_sent" as any)
        .select("email, user_id")
        .eq("id", token)
        .single()
        .then(({ data }: any) => {
          if (data?.email) {
            setPrefillEmail(data.email);
            // Try to get name from profiles
            if (data.user_id) {
              supabase
                .from("profiles")
                .select("first_name")
                .eq("user_id", data.user_id)
                .single()
                .then(({ data: profile }) => {
                  if (profile?.first_name) {
                    setPrefillName(profile.first_name);
                    setName(profile.first_name);
                  }
                });
            }
          }
        });
    }
  }, [token]);

  const handleSubmit = async () => {
    if (!score) return;
    setSubmitting(true);
    try {
      await supabase.from("feedback_responses" as any).insert({
        token,
        name: name || null,
        score,
        comment: comment || null,
        email: prefillEmail || null,
      } as any);

      // Mark feedback as received
      if (token) {
        await supabase
          .from("feedback_emails_sent" as any)
          .update({ feedback_received: true } as any)
          .eq("id", token);
      }

      // Notify admin immediately on bad feedback
      if (score === "bad") {
        supabase.functions.invoke("notify-bad-feedback", {
          body: { name: name || null, email: prefillEmail || null, comment: comment || null },
        }).catch(() => {}); // fire-and-forget
      }

      setSubmitted(true);
    } catch {
      // Still show success to user
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#F4F1EB] flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <img src={venueLogo} alt={tenant.venue_name} className="h-14 mx-auto" />
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-[#1C1F24]/10">
            <CheckCircle2 className="h-16 w-16 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-[#1C1F24] mb-2">Thanks for your feedback!</h1>
            <p className="text-[#1C1F24]/70">
              We really appreciate you taking the time. Your feedback helps us make {tenant.venue_name} even better.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F1EB] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center">
          <img src={venueLogo} alt={tenant.venue_name} className="h-14 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#1C1F24]">How was your visit?</h1>
          <p className="text-[#1C1F24]/70 mt-1">We'd love to hear about your experience at {tenant.venue_name}</p>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#1C1F24]/10 space-y-5">
          {/* Score selection */}
          <div>
            <label className="block text-sm font-medium text-[#1C1F24] mb-3">
              How would you rate your experience?
            </label>
            <div className="grid grid-cols-3 gap-3">
              {scoreOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = score === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setScore(option.value)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? `${option.color} bg-opacity-100 border-current scale-105 shadow-md`
                        : `border-gray-200 text-gray-400 hover:border-gray-300`
                    }`}
                  >
                    <Icon className={`h-10 w-10 ${isSelected ? "" : "opacity-50"}`} />
                    <span className={`text-sm font-semibold ${isSelected ? "" : "text-gray-500"}`}>
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-[#1C1F24] mb-1.5">
              Your name <span className="text-[#1C1F24]/40">(optional)</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="border-[#1C1F24]/15 focus:border-[#1C1F24]/30"
            />
          </div>

          {/* Comment */}
          <div>
            <label className="block text-sm font-medium text-[#1C1F24] mb-1.5">
              Any feedback? <span className="text-[#1C1F24]/40">(optional)</span>
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you loved, or what we could improve..."
              rows={4}
              className="border-[#1C1F24]/15 focus:border-[#1C1F24]/30 resize-none"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!score || submitting}
            className="w-full bg-[#5F6F52] hover:bg-[#d4551f] text-white font-semibold py-3 rounded-xl text-base"
          >
            {submitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </div>

        <p className="text-center text-xs text-[#1C1F24]/40">
          {tenant.venue_name} · {formatTenantAddress(tenant)}
        </p>
      </div>
    </div>
  );
}
