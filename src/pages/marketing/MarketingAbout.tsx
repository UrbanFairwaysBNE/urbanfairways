import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, LayoutGrid, Monitor, BadgePercent, Trophy, Smartphone } from "lucide-react";
import venueInterior from "@/assets/venue-interior.jpg";
import { useTenant, hubUrl } from "@/config/tenant";

const getHighlights = (venueName: string) => [
  {
    icon: LayoutGrid,
    title: "Multi-Bay Centre",
    body: "Fully automated simulator bays, book any time that suits you.",
  },
  {
    icon: Monitor,
    title: "Top of the Range Tech",
    body: "Tour-accurate launch data, 4K visuals, and a huge library of world-famous courses.",
  },
  {
    icon: BadgePercent,
    title: "Competitive Casual Rates",
    body: "Simple off-peak and peak pricing per bay, for groups of players.",
  },
  {
    icon: Trophy,
    title: "Leagues & Comps",
    body: `The ${venueName} League every week, plus regular local competitions.`,
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
    <Seo title={`About ${tenant.venue_name} | Indoor Golf Centre`} description={`Meet ${tenant.venue_name}: automated simulator bays, tour-accurate launch data, 4K visuals and weekly competitions.`} path="/about" />
    <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Welcome</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">About {tenant.venue_name}</h1>
      </div>
    </section>

    {/* WHAT WE ARE */}
    <section className="py-10 sm:py-20">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">What We Are</p>
          <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
            A Premier Indoor Golf Centre
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
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Our Story</p>
          <h2 className="font-display text-4xl sm:text-5xl leading-tight mb-6">
            Indoor Golf Made Easy.
          </h2>
          <div className="space-y-4 text-primary-foreground/85 text-lg leading-relaxed">
            <p>
              {tenant.venue_name} was created with one simple goal: to make indoor golf available to everyone.
              No memberships you don't need, no intimidating clubhouse, no waiting on a tee sheet. Just a great
              space, great technology, and an open door.
            </p>
            <p>
              Indoor golf is growing in popularity all the time, and it's now a genuine alternative to traditional
              golf rather than a poor substitute for it. Modern simulators track every part of your swing and ball
              flight, so the feedback you get in a bay is often better than anything you'd get on the range.
            </p>
            <p>
              It also offers ways to play and enjoy the game that outdoor golf simply cannot. Play world-famous
              courses, hit a focused practice session on your lunch break, run closest-to-the-pin games with mates,
              or work through a proper coaching plan with real data behind it. Rain, wind, heat and daylight stop
              being part of the equation.
            </p>
            <p>
              Whether you're a seasoned player chasing a lower handicap or you've never swung a club in your life,
              we have you covered. Our bays, our coaches and our team are here to make it easy from the moment you
              walk in.
            </p>
            <p className="font-display text-accent text-2xl pt-4">Play. Improve. Elevate.</p>
          </div>

        </div>
        <div className="rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
          <img src={venueInterior} alt="Venue interior" className="w-full h-full object-cover" />
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
          Join {tenant.venue_name} today and experience the future of golf.
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
