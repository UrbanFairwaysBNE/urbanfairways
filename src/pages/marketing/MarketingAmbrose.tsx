import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Users, Target, Wallet, Clock, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import venueInterior from "@/assets/venue-interior.jpg";
import pageHeader from "@/assets/page-header-city.jpg";
import { useTenant } from "@/config/tenant";
import { AmbroseBoard, useNextAmbrose } from "@/components/compete/CompeteBoards";

const MarketingAmbrose = () => {
  const { tenant } = useTenant();
  const { data: nextAmbrose } = useNextAmbrose();

  const points = [
    {
      icon: Users,
      title: "Pairs, not solos",
      body: "Bring a mate or let us pair you up. Two players, one ball, one card. It is the friendliest format in golf and the easiest way to meet the regulars.",
    },
    {
      icon: Target,
      title: "Alternating shots",
      body: "Both players tee off, you pick the better ball, then play alternate shots from there. Nobody has a bad round on their own.",
    },
    {
      icon: Wallet,
      title: "$20 per team",
      body: "Entry is $20 a team and goes straight into the pot. The winning pair takes home venue credit plus the bragging rights until next Wednesday.",
    },
    {
      icon: Clock,
      title: "Open to everyone",
      body: "You do not need a membership. Casual players are just as welcome, and combined handicaps keep the field level from first-timers to single figures.",
    },
  ];

  return (
    <MarketingLayout>
      <Seo
        title={`2-Man Ambrose | Wednesday Nights at ${tenant.venue_name}`}
        description={`Team up for the Wednesday night 2-Man Ambrose at ${tenant.venue_name}. Combined handicaps, alternating shots, $100 weekly prize pot and live results.`}
        path="/ambrose"
      />

      <section className="relative h-[19vh] min-h-[130px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pageHeader})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">
            Wednesdays · Open to all
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
            2-Man<br /><span className="text-accent">Ambrose</span>
          </h1>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="text-lg text-foreground/80 leading-relaxed">
            Wednesday night is team night. Grab a partner, combine your handicaps and take on the field in the quickest,
            loudest comp of the week. Ambrose is forgiving by design, so a wayward drive costs you nothing as long as
            your partner keeps one in play.
          </p>
          <p className="text-base text-foreground/70 leading-relaxed mt-5">
            It runs weekly, it is open to members and casual players alike, and the whole thing wraps up in a couple of
            hours. If you have never played a comp before, this is the one to start with.
          </p>

          {nextAmbrose && (
            <div className="mt-8 inline-block rounded-xl border border-border bg-card px-6 py-4">
              <div className="text-[11px] uppercase tracking-widest text-accent font-bold mb-1">Next comp</div>
              <div className="font-display text-xl text-primary">
                {format(new Date(nextAmbrose.date + "T00:00:00"), "EEEE dd MMMM")}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <a
              href="/comp/register-team"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              Register a Team <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/comp/find-partner"
              className="border border-border hover:bg-muted text-primary font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              Find a Partner
            </a>
          </div>
        </div>
      </section>

      <section className="bg-primary text-primary-foreground py-12 sm:py-16">
        <div className="container mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
          {points.map((p) => (
            <div key={p.title} className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-6">
              <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                <p.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg tracking-wide uppercase mb-2">{p.title}</h3>
              <p className="text-primary-foreground/75 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3 text-center">
            Latest results
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary text-center leading-tight mb-8">
            Wednesday night leaderboard.
          </h2>
          <AmbroseBoard />
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingAmbrose;
