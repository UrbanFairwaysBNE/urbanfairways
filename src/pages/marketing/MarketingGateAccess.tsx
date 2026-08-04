import Seo from "@/components/Seo";
import { useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import venueInterior from "@/assets/venue-interior.jpg";
import { useTenant } from "@/config/tenant";

const MarketingGateAccess = () => {
  const { tenant } = useTenant();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const fullName = String(data.get("fullName") || "").trim();
    const email = String(data.get("email") || "").trim();
    const phone = String(data.get("phone") || "").trim();

    if (!fullName || !email || !phone) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke("send-gate-access-request", {
        body: { fullName, email, phone },
      });
      if (error) throw error;
      setSubmitted(true);
      form.reset();
      toast({ title: "Request received", description: "We'll approve your access shortly." });
    } catch (err) {
      console.error(err);
      toast({
        title: "Something went wrong",
        description: `Please try again or call ${tenant.support_phone}.`,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <MarketingLayout>
    <Seo title={`Gate & Bay Access Guide | ${tenant.venue_name}`} description={`How to access the ${tenant.venue_name} car park gate and your simulator bay outside staffed hours, step by step.`} path="/gate-access" />
      <section className="relative h-[22vh] min-h-[160px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
        <div className="relative container mx-auto px-4 pb-6">
          <p className="text-accent font-display tracking-[0.25em] uppercase text-xs mb-1.5">After-Hours Entry</p>
          <h1 className="font-display text-3xl sm:text-4xl text-primary-foreground leading-none">
            {tenant.venue_name} Gate Access Request
          </h1>
        </div>
      </section>

      <section className="py-8 sm:py-16">
        <div className="container mx-auto px-4 max-w-2xl">
          <ol className="space-y-3 mb-8 text-foreground/85">
            <li className="flex gap-3">
              <span className="font-display text-accent text-lg leading-none">1.</span>
              <span>Enter your information below to receive an SMS from Noke (it may take up to 20 minutes to come through).</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-accent text-lg leading-none">2.</span>
              <span>Download the Noke app and enter your phone number (include the 0).</span>
            </li>
            <li className="flex gap-3">
              <span className="font-display text-accent text-lg leading-none">3.</span>
              <span>Use the Noke app to access the premises after hours (5pm).</span>
            </li>
          </ol>

          {submitted ? (
            <div className="bg-card border border-border rounded-2xl p-8 text-center shadow-sm">
              <h2 className="font-display text-2xl text-primary mb-2">Request received</h2>
              <p className="text-foreground/80">
                Thanks! We'll approve your access shortly. Keep an eye on your phone for the Noke SMS invite.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-6 text-sm text-accent hover:underline"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="bg-card border border-border rounded-2xl p-6 sm:p-8 space-y-4 shadow-sm"
            >
              <Field name="fullName" label="Full Name" required />
              <Field name="email" label="Email" type="email" required />
              <Field name="phone" label="Phone Number" type="tel" required />
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-5 py-3 rounded-md disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </form>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
};

const Field = ({
  name,
  label,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) => (
  <div>
    <label className="block text-xs uppercase tracking-wider text-foreground/60 mb-1.5">{label}</label>
    <input
      name={name}
      type={type}
      required={required}
      className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
    />
  </div>
);

export default MarketingGateAccess;
