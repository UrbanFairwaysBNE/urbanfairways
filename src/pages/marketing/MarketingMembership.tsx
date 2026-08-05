import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, Check, Clock, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import venueInterior from "@/assets/venue-interior.jpg";
import { useTenant, hubUrl } from "@/config/tenant";
import { useCasualRates } from "@/hooks/useCasualRates";

interface Tier {
  name: string;
  price: string;
  rate: string;
  tag: string;
  perks: string[];
  highlight?: boolean;
  subtle?: boolean;
  info?: string;
}

const tiers: Tier[] = [
  {
    name: "Practice Club",
    price: "$15",
    rate: "$10/hr",
    tag: "Off-peak access",
    perks: [
      "Mon–Fri 5:30am–4:00pm",
      "Sat–Sun 5:30am–10:00am",
      "2 guests",
      "Swing Lab access",
    ],
  },
  {
    name: "Birdie",
    price: "$29",
    rate: "$10/hr",
    tag: "Suits Most",
    highlight: true,
    perks: [
      "Play anytime",
      "2 guests",
      "Swing Lab access",
      "Member events",
      "Member competitions",
      "Priority bookings",
    ],
  },
  {
    name: "Eagle",
    price: "$39",
    rate: "$8/hr",
    tag: "Best value per round",
    perks: [
      "Play anytime",
      "2 guests",
      "Swing Lab access",
      "Member events",
      "Member competitions",
      "Priority bookings",
      "Monthly 30min coaching session (does not carry over)",
    ],
  },
];

const frontlineTier: Tier = {
  name: "Frontline",
  price: "$30",
  rate: "$8/hr",
  tag: "Frontline & essential workers",
  subtle: true,
  info: "This membership is available to Emergency Services, Defence & Nurses",
  perks: [
    "Play anytime",
    "2 guests",
    "Swing Lab access",
    "Member events",
    "Member competitions",
    "Priority bookings",
    "TPI Assessment on joining",
    "Monthly 30min coaching session (does not carry over)",
  ],
};


const MarketingMembership = () => {
  const { tenant } = useTenant();
  const { peakLabel, offPeakLabel, specials } = useCasualRates();
  return (
  <MarketingLayout>
    <Seo title={`Golf Memberships | ${tenant.venue_name}`} description={`Compare ${tenant.venue_name} membership tiers, included simulator hours, member pricing and automated bay access.`} path="/membership-info" />
    <section className="relative h-[28vh] min-h-[220px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Membership</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
          Play More.<br />Save More.
        </h1>
      </div>
    </section>

    <section className="py-10 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-lg text-foreground/80 leading-relaxed">
          Pay a simple weekly fee to unlock your member hourly rate. Book anytime and play at a fraction of the casual price. No lock-in contracts. Cancel any time.
        </p>
      </div>
    </section>

    <section className="pb-20">
      <div className="container mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
        {tiers.map((t) => (
          <div
            key={t.name}
            className={`relative rounded-2xl p-6 border transition-all bg-card text-card-foreground hover:shadow-lg ${
              t.highlight ? "border-accent ring-2 ring-accent/20 mt-6 md:mt-0" : "border-border"
            }`}
          >
            {t.highlight && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-accent text-accent-foreground text-xs font-display uppercase tracking-wider px-4 py-1.5 rounded-full shadow-sm">
                Most Popular
              </span>
            )}
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">{t.tag}</p>
            <h3 className="font-display text-2xl uppercase tracking-wide mb-1">{t.name}</h3>
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                <Clock className="h-3.5 w-3.5" />
                {t.rate}
              </span>
            </div>
            <div className="mb-6">
              <span className="font-display text-5xl">{t.price}</span>
              <span className="text-sm text-foreground/60"> /week</span>
            </div>
            <ul className="space-y-3 text-sm mb-7">
              {t.perks.map((p) => (
                <li key={p} className="flex gap-2">
                  <Check className="h-4 w-4 mt-0.5 text-accent shrink-0" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <a
              href={hubUrl(tenant, "/")}
              className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              Join
            </a>
          </div>
        ))}
      </div>
    </section>

    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-10">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Pay As You Go</p>
          <h2 className="font-display text-4xl sm:text-5xl text-primary leading-tight mb-4">
            Not ready to commit? Just pay to play.
          </h2>
          <p className="text-foreground/80 text-lg max-w-2xl mx-auto">
            We welcome Pay As You Go sessions at {tenant.venue_name}, same premium golf, no commitment, same easy booking and access platform as members. Bay pricing covers up to 4 players.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <div className="bg-card border border-border rounded-2xl p-8 text-card-foreground hover:shadow-lg transition-all text-left">
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">Off-Peak</p>
            <h3 className="font-display text-3xl uppercase tracking-wide mb-1 text-primary">Casual</h3>
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                <Clock className="h-3.5 w-3.5" />
                {offPeakLabel ?? "—"}/hr
              </span>
            </div>
            <p className="text-sm text-foreground/60 mb-2">Off-peak hours</p>
            <p className="text-sm text-foreground/60 mb-6">Per bay, small groups welcome</p>
            <a href={hubUrl(tenant, "/")} className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
              Book Now
            </a>
          </div>
          <div className="bg-card border border-border rounded-2xl p-8 text-card-foreground hover:shadow-lg transition-all text-left">
            <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">Peak</p>
            <h3 className="font-display text-3xl uppercase tracking-wide mb-1 text-primary">Casual</h3>
            <div className="mb-5">
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold bg-accent/10 text-accent border border-accent/20">
                <Clock className="h-3.5 w-3.5" />
                {peakLabel ?? "—"}/hr
              </span>
            </div>
            <p className="text-sm text-foreground/60 mb-2">Peak hours</p>
            <p className="text-sm text-foreground/60 mb-6">Per bay, small groups welcome</p>
            <a href={hubUrl(tenant, "/")} className="block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors bg-accent hover:bg-accent/90 text-accent-foreground">
              Book Now
            </a>
          </div>
        </div>
        {specials.length > 0 && (
          <div className="max-w-3xl mx-auto mt-6 grid gap-3">
            {specials.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-accent/30 bg-accent/5 px-5 py-4"
              >
                <div className="text-left">
                  <p className="font-display uppercase tracking-wide text-primary">{s.name}</p>
                  <p className="text-sm text-foreground/60">{s.duration_minutes} minutes of bay time</p>
                </div>
                <span className="font-display text-2xl text-accent">${s.price}</span>
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-10">
          <a
            href={hubUrl(tenant, "/")}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-display tracking-wide uppercase px-8 py-4 rounded-md"
          >
            Join Now <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </section>
  </MarketingLayout>
  );
};

export default MarketingMembership;
