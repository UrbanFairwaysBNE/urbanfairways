import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, LayoutGrid, Monitor, BadgePercent, Trophy, Smartphone } from "lucide-react";
import birdiesNeonSign from "@/assets/venue-interior.jpg";
import { useTenant, hubUrl } from "@/config/tenant";

const HERO = "https://cdn.shopify.com/s/files/1/0758/7030/6550/files/Birdies_Golf.jpg?v=1751956878&width=3840";

const getHighlights = (venueName: string) => [
  {
    icon: LayoutGrid,
    title: "6 Bay Centre",
    body: "Six fully automated simulator bays, book any time that suits you.",
  },
  {
    icon: Monitor,
    title: "Top of the Range Tech",
    body: "Tour-accurate launch data, 4K visuals, and 2,300+ world-famous courses.",
  },
  {
    icon: BadgePercent,
    title: "Competitive Visitor Rates",
    body: "Off-peak from $30/hr, peak from $35/hr per bay, up to 4 players.",
  },
  {
    icon: Trophy,
    title: "Leagues & Comps",
    body: `The ${venueName} League every week, plus our Wednesday 2-Man Ambrose competition.`,
  },
  {
    icon: Smartphone,
    title: `Official ${venueName} Hub App`,
    body: "Track league rounds, view stats and progress, manage bookings, all in one place.",
  },
];

const MarketingAbout = () => {
  const { tenant } = useTenant();
  const highlights = getHighlights(tenant.venue_name);
  return (
  <MarketingLayout>
    <Seo title={`About ${tenant.venue_name} | Our Indoor Golf Centre`} description={`Meet ${tenant.venue_name}: six fully automated simulator bays, tour-accurate launch data, 4K visuals and weekly competitions in Redland Bay.`} path="/about" />
    <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${HERO})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-xs mb-1.5">Welcome</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">About {tenant.venue_name}</h1>
      </div>
    </section>

    {/* WHAT WE ARE */}
    <section className="py-10 sm:py-20">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">What We Are</p>
          <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
            Redland Bay's Premier Indoor Golf Centre
          </h2>
          <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
            World-class golf simulators, a welcoming local community, and flexible access so you can play, practice, and compete on your schedule.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                <h.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg tracking-wide uppercase mb-2">{h.title}</h3>
              <p className="text-foreground/75 text-sm leading-relaxed">{h.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>

    {/* OUR STORY */}
    <section className="py-10 sm:py-20 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center max-w-6xl">
        <div>
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Our Story</p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
            Golf has entered a new era, and it's happening indoors.
          </h2>
          <div className="space-y-4 text-primary-foreground/85 text-lg leading-relaxed">
            <p>
              Thanks to major leaps in simulator technology, indoor golf is no longer just a substitute for the real thing.
              The game has changed, and we are going all in.
            </p>
            <p>
              We created {tenant.venue_name} to bring this revolution to life. Our space is all about giving our community the
              opportunity to practice, compete, and refine their game with ease.
            </p>
            <p>
              Whether you're working on your swing or playing with friends, {tenant.venue_name} makes golf more accessible, more
              flexible, and far more convenient. No more 5-hour rounds, no more getting rained off, just great golf,
              when it suits you.
            </p>
            <p className="font-display text-accent text-2xl pt-4">Indoor Golf, Redefined.</p>
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
          <img src={birdiesNeonSign} alt={`${tenant.venue_name} neon sign`} className="w-full h-full object-cover" />
        </div>
      </div>
    </section>

    {/* CTA */}
    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4 text-center max-w-3xl">
        <h2 className="font-display text-3xl sm:text-5xl text-primary leading-tight mb-4">
          Ready to Play?
        </h2>
        <p className="text-foreground/80 text-lg mb-8">
          Join {tenant.venue_name} today and experience the future of golf in Redland Bay.
        </p>
        <a
          href={hubUrl(tenant, "/")}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
        >
          Book Now <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  </MarketingLayout>
  );
};

export default MarketingAbout;
