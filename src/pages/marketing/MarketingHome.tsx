import Seo from "@/components/Seo";
import { Link } from "react-router-dom";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Check, Clock, DollarSign, Trophy, Target, ArrowRight, BarChart3, Crosshair, TrendingUp, Activity, Gauge } from "lucide-react";
import venueInterior from "@/assets/venue-interior.jpg";
import simBayImage from "@/assets/sim-bay.webp.asset.json";
import heroVideo from "@/assets/hero-video.mp4.asset.json";

import swingLabBadge from "@/assets/swing-lab-badge.png.asset.json";
import googlePlayBadge from "@/assets/google-play-badge.svg";
import { useTenant, hubUrl } from "@/config/tenant";
import { useCasualRates } from "@/hooks/useCasualRates";

const getFeatures = (venueName: string) => [
  { icon: Target, title: "High-Tech Simulators", body: "Tour-accurate launch data, 4K graphics and a huge library of world-famous courses." },
  { icon: Clock, title: "Extended Access Hours", body: "Simulator bays available across extended hours, book any time, play any time." },
  { icon: DollarSign, title: "Affordable Memberships", body: "Pay a simple weekly fee to unlock your member hourly rate." },
  { icon: Trophy, title: "Competitions & League", body: `Eligible members get access to the ${venueName} League. Other members can still jump into local weekly comps.` },
];

const swingLabFeatures = [
  { icon: Target, title: "Automatic shot capture from GSPro range sessions" },
  { icon: BarChart3, title: "Per-club gapping and distance averages" },
  { icon: Crosshair, title: "Dispersion analysis with visual scatter plots" },
  { icon: Activity, title: "Swing dynamics: path, face angle, attack angle and spin" },
  { icon: TrendingUp, title: "Progress tracking over 30, 90 and 180 days" },
  { icon: Gauge, title: "Tour and amateur benchmarking with focus cues" },
];

const MarketingHome = () => {
  const { tenant } = useTenant();
  const { peakLabel, offPeakLabel, specials } = useCasualRates();
  const features = getFeatures(tenant.venue_name);
  return (
    <MarketingLayout>
    <Seo title={`${tenant.venue_name} | Indoor Golf Simulators`} description={`${tenant.venue_name} in ${tenant.suburb || "your area"}. Book a simulator bay, play world-famous courses, join the league or visit the venue.`} path="/" />
      {/* HERO */}
      <section className="relative h-[88vh] min-h-[560px] flex items-center overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          poster={venueInterior}
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src={heroVideo.url} type="video/mp4" />
        </video>


        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
        <div className="relative container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-sm mb-4">
            Welcome to {tenant.venue_name}
          </p>
          <h1 className="font-display font-extrabold text-5xl sm:text-7xl lg:text-8xl text-primary-foreground leading-[0.95] tracking-tight uppercase">
            Play. Improve.<br />
            <span className="text-accent">Elevate.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-primary-foreground/90 max-w-xl">
            Indoor golf, the Urban way. Play for fun, Improve with real data, Elevate every part of your game. Everyone welcome.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3">
            <a
              href={hubUrl(tenant, "/")}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 h-12 rounded-md inline-flex items-center justify-center gap-2 transition-all hover:translate-x-0.5"
            >
              Book Now <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href={tenant.socials?.ios_app_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-au?size=250x83"
                alt="Download on the App Store"
                className="h-12 w-auto rounded-md"
              />
            </a>
            <a
              href={tenant.socials?.android_app_url || "#"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={googlePlayBadge}
                alt="Get it on Google Play"
                className="h-12 w-auto"
              />
            </a>
          </div>
        </div>
      </section>

      {/* WHAT IS THE VENUE */}
      <section className="py-12 sm:py-28">
        <div className="container mx-auto px-4 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">What is {tenant.venue_name}?</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight mb-6">
              A premier indoor golf centre in the West End of Brisbane.
            </h2>
            <p className="text-foreground/80 text-lg leading-relaxed mb-4">
              {tenant.venue_name} combines cutting-edge simulator technology with 4K visuals and tour-level accuracy.
              Perfect for practice, game improvement, or a quick round with friends.
            </p>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 text-accent font-display tracking-wide uppercase text-sm hover:gap-3 transition-all"
            >
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="relative rounded-2xl overflow-hidden shadow-xl aspect-[4/3]">
            <img src={simBayImage.url} alt="Urban Fairways indoor golf simulator bay in West End Brisbane" className="w-full h-full object-cover" loading="lazy" />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="bg-primary text-primary-foreground py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Why {tenant.venue_name}</p>
            <h2 className="font-display text-4xl sm:text-5xl leading-tight">
              Tour-level tech. Local prices. Zero excuses.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-primary-foreground/5 hover:bg-primary-foreground/10 transition-colors border border-primary-foreground/10 rounded-xl p-6"
              >
                <div className="w-12 h-12 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-display text-xl tracking-wide uppercase mb-2">{f.title}</h3>
                <p className="text-primary-foreground/75 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/membership-info"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              See Membership Plans <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* SWING LAB */}
      <section className="bg-muted py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <img
              src={swingLabBadge.url}
              alt={`Swing Lab at ${tenant.venue_name}`}
              className="h-28 sm:h-36 w-auto mx-auto mb-6 object-contain"
              loading="lazy"
            />
            <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Swing Lab</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
              Your Personal Driving Range Coach.
            </h2>
            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              Every range session becomes actionable data. Track your distances, dispersion, swing dynamics and progress over time — all included with your {tenant.venue_name} membership.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {swingLabFeatures.map((f) => (
              <div
                key={f.title}
                className="bg-card border border-border rounded-xl px-5 py-4 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base tracking-wide uppercase leading-snug">{f.title}</h3>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link
              to="/membership-info"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              Unlock Swing Lab <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* PRICING SNAPSHOT */}
      <section className="py-12 sm:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Pricing</p>
            <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight">
              Pay as you go, or save with a membership.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            <PriceCard tier="Practice Club" rate="$10/hr" price="$15" tag="Off-peak access" perks={["Mon–Fri 5:30am–4:00pm", "Sat–Sun 5:30am–10:00am", "2 guests", "Swing Lab access"]} joinHref={hubUrl(tenant, "/")} />
            <PriceCard tier="Birdie" rate="$10/hr" price="$29" tag="Suits Most" highlight perks={["Play anytime", "2 guests", "Swing Lab access", "Member events & comps", "Priority bookings"]} joinHref={hubUrl(tenant, "/")} />
            <PriceCard tier="Frontline" rate="$8/hr" price="$30" tag="Frontline & essential workers" perks={["Play anytime", "2 guests", "Swing Lab access", "Member events & comps", "TPI Assessment on joining", "Monthly 30min coaching session"]} joinHref={hubUrl(tenant, "/")} />
            <PriceCard tier="Eagle" rate="$8/hr" price="$39" tag="Best value per round" perks={["Play anytime", "2 guests", "Swing Lab access", "Member events & comps", "Priority bookings", "Monthly 30min coaching session"]} joinHref={hubUrl(tenant, "/")} />
          </div>
          <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto mt-8">
            <div className="bg-card border border-border rounded-2xl p-7 text-card-foreground hover:shadow-lg transition-all">
              <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">Off-Peak</p>
              <h3 className="font-display text-3xl uppercase tracking-wide mb-1">Casual</h3>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                  <Clock className="h-3.5 w-3.5" />
                  {offPeakLabel ?? "—"}/hr
                </span>
              </div>
              <p className="text-sm text-foreground/60 mb-2">Off-peak hours</p>
              <p className="text-sm text-foreground/60 mb-6">Per bay, up to 4 players</p>
              <a href={hubUrl(tenant, "/")} className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
                Book Now
              </a>
            </div>
            <div className="bg-card border border-border rounded-2xl p-7 text-card-foreground hover:shadow-lg transition-all">
              <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">Peak</p>
              <h3 className="font-display text-3xl uppercase tracking-wide mb-1">Casual</h3>
              <div className="mb-5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                  <Clock className="h-3.5 w-3.5" />
                  {peakLabel ?? "—"}/hr
                </span>
              </div>
              <p className="text-sm text-foreground/60 mb-2">Peak hours</p>
              <p className="text-sm text-foreground/60 mb-6">Per bay, up to 4 players</p>
              <a href={hubUrl(tenant, "/")} className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
                Book Now
              </a>
            </div>
          </div>
          {specials.length > 0 && (
            <div className="max-w-2xl mx-auto mt-6 grid gap-3">
              {specials.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4"
                >
                  <div>
                    <p className="font-display uppercase tracking-wide text-primary">{s.name}</p>
                    <p className="text-sm text-foreground/60">{s.duration_minutes} minutes of bay time</p>
                  </div>
                  <span className="font-display text-2xl text-accent">${s.price}</span>
                </div>
              ))}
            </div>
          )}

        </div>
      </section>

      {/* CTA STRIP */}
      <section className="relative py-14 sm:py-24 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${venueInterior})` }}
        />
        <div className="absolute inset-0 bg-primary/85" />
        <div className="relative container mx-auto px-4 text-center text-primary-foreground max-w-3xl">
          <h2 className="font-display text-4xl sm:text-6xl leading-tight mb-4">
            Become a Member Today.
          </h2>
          <p className="text-primary-foreground/85 text-lg mb-8">
            Join {tenant.venue_name} and get unlimited access to premium simulators, the {tenant.venue_name} League, and a great local community.
          </p>
          <a
            href={hubUrl(tenant, "/")}
            className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-8 py-4 rounded-md"
          >
            Join Now <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </MarketingLayout>
  );
};

const PriceCard = ({
  tier,
  rate,
  price,
  tag,
  perks,
  highlight,
  joinHref,
}: {
  tier: string;
  rate: string;
  price: string;
  tag: string;
  perks: string[];
  highlight?: boolean;
  joinHref: string;
}) => (
  <div
    className={`relative rounded-2xl p-7 border transition-all bg-card text-card-foreground hover:shadow-lg ${
      highlight ? "border-accent ring-2 ring-accent/20" : "border-border"
    }`}
  >
    {highlight && (
      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground text-xs font-display uppercase tracking-wider px-3 py-1 rounded-full">
        Most Popular
      </span>
    )}
    <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">{tag}</p>
    <h3 className="font-display text-3xl uppercase tracking-wide mb-1">{tier}</h3>
    <div className="mb-5">
      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
        <Clock className="h-3.5 w-3.5" />
        {rate}
      </span>
    </div>
    <div className="mb-6">
      <span className="font-display text-5xl">{price}</span>
      <span className="text-sm text-foreground/60"> /week</span>
    </div>
    <ul className="space-y-2 text-sm mb-6">
      {perks.map((p) => (
        <li key={p} className="flex gap-2">
          <Check className="h-4 w-4 mt-0.5 text-accent shrink-0" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
    <a
      href={joinHref}
      className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      Join
    </a>
  </div>
);

export default MarketingHome;
