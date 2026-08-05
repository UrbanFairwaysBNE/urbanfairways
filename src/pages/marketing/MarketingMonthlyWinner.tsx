import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Trophy, CalendarRange, Medal, Gift } from "lucide-react";
import venueInterior from "@/assets/venue-interior.jpg";
import pageHeader from "@/assets/page-header-city.jpg";
import { useTenant, hubUrl } from "@/config/tenant";
import { MonthlyBoard } from "@/components/compete/CompeteBoards";

const MarketingMonthlyWinner = () => {
  const { tenant } = useTenant();

  const points = [
    {
      icon: CalendarRange,
      title: "Every week counts",
      body: `Each weekly ${tenant.venue_name} League tournament awards points on a sliding scale, 25 points down to 1. Play more weeks, bank more points.`,
    },
    {
      icon: Medal,
      title: "Net and gross tables",
      body: "Two races run side by side. The net table rewards playing to your handicap, the gross table is a straight shootout for the lowest scorers in the building.",
    },
    {
      icon: Trophy,
      title: "Month's end decides it",
      body: "Standings are grouped by calendar month in Brisbane time. Whoever tops the table when the last tournament of the month closes takes the title.",
    },
    {
      icon: Gift,
      title: "Rotating prizes",
      body: "Monthly winners take home a rotating prize from our local partners, plus the medal and a permanent spot in the honour roll.",
    },
  ];

  return (
    <MarketingLayout>
      <Seo
        title={`Monthly Winner | ${tenant.venue_name} League`}
        description={`The ${tenant.venue_name} Monthly Winner race: points from every weekly league tournament, live net and gross standings, and a monthly prize.`}
        path="/monthly-winner"
      />

      <section className="relative h-[19vh] min-h-[130px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">
            Monthly · Members
          </p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
            Monthly<br /><span className="text-accent">Winner</span>
          </h1>
        </div>
      </section>

      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <p className="text-lg text-foreground/80 leading-relaxed">
            The weekly league is a sprint. The Monthly Winner race is the season within the season. Every tournament you
            play across the month adds points to your tally, so consistency beats a single hot week. Turn up, play your
            two rounds, and let the table do the rest.
          </p>
          <p className="text-base text-foreground/70 leading-relaxed mt-5">
            There is no separate entry and nothing extra to pay. If you are playing the {tenant.venue_name} League, you
            are already in the running.
          </p>
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
            Live standings
          </p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary text-center leading-tight mb-8">
            Who's leading this month.
          </h2>
          <MonthlyBoard />
        </div>
      </section>

      <section className="pb-16">
        <div className="container mx-auto px-4 max-w-3xl text-center">
          <h2 className="font-display text-2xl sm:text-3xl text-primary mb-4">Want in on the race?</h2>
          <p className="text-foreground/75 mb-6">
            Monthly points come from the weekly league, which is included with eligible memberships.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <a
              href="/membership-info"
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              View Memberships
            </a>
            <a
              href={hubUrl(tenant, "/booking")}
              className="border border-border hover:bg-muted text-primary font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              Book a Bay
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingMonthlyWinner;
