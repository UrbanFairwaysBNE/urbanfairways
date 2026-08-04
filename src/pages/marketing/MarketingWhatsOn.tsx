import Seo from "@/components/Seo";
import { useEffect, useState } from "react";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Loader2, Repeat } from "lucide-react";
import venueInterior from "@/assets/venue-interior.jpg";
import { useTenant } from "@/config/tenant";

interface Event {
  id: string;
  title: string;
  description: string | null;
  event_date: string | null;
  is_recurring: boolean;
}

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const MarketingWhatsOn = () => {
  const { tenant } = useTenant();
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("whats_on_events")
        .select("id, title, description, event_date, is_recurring")
        .eq("is_active", true)
        .order("is_recurring", { ascending: false })
        .order("event_date", { ascending: true, nullsFirst: false });
      setEvents((data as Event[]) ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <MarketingLayout>
    <Seo title={`What's On | Events at ${tenant.venue_name}`} description={`Upcoming events, leagues, competitions and specials at ${tenant.venue_name} indoor golf.`} path="/whats-on" />
      <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Welcome</p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">What's On</h1>
        </div>
      </section>

      <section className="py-10 sm:py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Events & Specials</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
              Happening at {tenant.venue_name}
            </h2>
            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              From weekly comps to free pizza nights, here's what you can look forward to.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-10 sm:py-16">
              <Loader2 className="h-8 w-8 text-accent animate-spin" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-foreground/70 font-inter">
              No upcoming events at the moment. Check back soon!
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
                      {ev.is_recurring ? <Repeat className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                    </div>
                    {ev.is_recurring ? (
                      <span className="text-xs font-display font-bold tracking-[0.2em] uppercase text-accent">Weekly</span>
                    ) : ev.event_date ? (
                      <span className="text-xs font-display tracking-[0.15em] uppercase text-accent">
                        {formatDate(ev.event_date)}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="font-display text-2xl tracking-wide uppercase text-primary mb-2 leading-tight">
                    {ev.title}
                  </h3>
                  {ev.description && (
                    <p className="text-foreground/75 text-sm leading-relaxed">{ev.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingWhatsOn;
