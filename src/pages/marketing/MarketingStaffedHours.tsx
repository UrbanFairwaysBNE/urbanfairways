import Seo from "@/components/Seo";
import { Clock, Phone, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useTenant } from "@/config/tenant";
import { useOperatingHours } from "@/hooks/useOperatingHours";
import { useStaffedHours, groupDayRanges } from "@/hooks/useStaffedHours";

const MarketingStaffedHours = () => {
  const { tenant } = useTenant();
  const { hours: operating, isLoading: loadingOperating } = useOperatingHours();
  const { staffedRanges, hasStaffedHours, isLoading: loadingStaffed } = useStaffedHours();

  const openRanges = groupDayRanges(
    operating
      .filter((h) => h.is_open)
      .map((h) => ({
        day_of_week: h.day_of_week,
        start_time: h.open_time,
        end_time: h.close_time,
      }))
  );

  return (
    <MarketingLayout>
    <Seo title={`Staffed Hours & Opening Times | ${tenant.venue_name}`} description={`Current staffed hours and automated bay access times for ${tenant.venue_name} indoor golf.`} path="/staffed-hours" />
      {/* Hero */}
      <section className="bg-primary text-primary-foreground py-10 md:py-14">
        <div className="container mx-auto px-4 text-center">
          <h1 className="font-display text-3xl sm:text-5xl tracking-wide uppercase">
            Staffed Hours
          </h1>
          <p className="mt-4 text-primary-foreground/80 max-w-2xl mx-auto">
            Open every day during <span className="text-accent-soft font-semibold">extended access hours</span> for
            casual customers and members.
          </p>
        </div>
      </section>

      {/* Opening + Staffed hours */}
      <section className="py-10 md:py-24 bg-background">
        <div className="container mx-auto px-4 grid md:grid-cols-2 gap-8 max-w-5xl">
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-accent" />
              <h2 className="font-display text-2xl uppercase tracking-wide">Opening Hours</h2>
            </div>
            {loadingOperating ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : openRanges.length ? (
              <ul className="divide-y divide-border">
                {openRanges.map((h) => (
                  <li key={h.day} className="flex items-center justify-between py-3">
                    <span className="font-medium">{h.day}</span>
                    <span className="font-display tracking-wide text-primary">{h.time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Hours coming soon.</p>
            )}
            <p className="text-muted-foreground mt-4 text-sm">
              Automated access for casual customers and members*.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="h-6 w-6 text-accent" />
              <h2 className="font-display text-2xl uppercase tracking-wide">Staffed Hours</h2>
            </div>
            {loadingStaffed ? (
              <p className="text-muted-foreground">Loading…</p>
            ) : hasStaffedHours ? (
              <ul className="divide-y divide-border">
                {staffedRanges.map((h) => (
                  <li key={h.day} className="flex items-center justify-between py-3">
                    <span className="font-medium">{h.day}</span>
                    <span className="font-display tracking-wide text-primary">{h.time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                Our centre is currently fully automated — no staffed hours are scheduled. Tech
                support is always available over the phone.
              </p>
            )}
          </div>
        </div>
      </section>


      {/* Automated centre note */}
      <section className="py-8 sm:py-12 bg-muted/40">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="text-muted-foreground">
            {hasStaffedHours
              ? "*Our centre is fully automated outside of staffed hours. This keeps our pricing low and makes self-service simple. We recommend booking your first session during staffed hours so our friendly staff can help you learn the sim tech. Tech support is always available over the phone."
              : "*Our centre is fully automated. This keeps our pricing low and makes self-service simple. Tech support is always available over the phone."}
          </p>

          <a
            href={`tel:${tenant.support_phone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-2 mt-6 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-6 py-3 rounded-md transition-colors"
          >
            <Phone className="h-4 w-4" />
            {tenant.support_phone}
          </a>
        </div>
      </section>

      {/* No BYO */}
      <section className="py-10 sm:py-16 bg-background">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="rounded-xl border-2 border-accent bg-accent/5 p-6 sm:p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-3">
              <AlertTriangle className="h-6 w-6 text-accent" />
              <h2 className="font-display text-3xl uppercase tracking-wide text-primary">
                Strict No BYO
              </h2>
            </div>
            <p className="text-muted-foreground">
              Drinks are available on-site, please don't bring your own.
            </p>
          </div>

          <div className="text-center mt-6 sm:mt-10">
            <Link
              to="/contact"
              className="font-display uppercase tracking-wide text-accent hover:underline"
            >
              Questions? Get in touch →
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingStaffedHours;
