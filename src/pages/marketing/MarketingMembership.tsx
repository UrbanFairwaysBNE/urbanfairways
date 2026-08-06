import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { ArrowRight, Check, Clock, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import pageHeader from "@/assets/page-header-city.jpg";
import { useTenant, hubUrl } from "@/config/tenant";
import { useMarketingPricing, type MarketingTier } from "@/hooks/useMarketingPricing";

const MarketingMembership = () => {
  const { tenant } = useTenant();
  const { tiers, restrictedTiers, peakLabel, offPeakLabel, offPeakLines, peakLines, specials } = useMarketingPricing();
  return (
  <MarketingLayout>
    <Seo title={`Golf Memberships | ${tenant.venue_name}`} description={`Compare ${tenant.venue_name} membership tiers, included simulator hours, member pricing and automated bay access.`} path="/membership-info" />
    <section className="relative h-[28vh] min-h-[220px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pageHeader})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-brand-accent-soft font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Membership</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
          Play More.<br />Save More.
        </h1>
      </div>
    </section>

    <section className="py-10 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-lg text-foreground/80 leading-relaxed">
          Pay a simple weekly fee to unlock your member hourly rate and play at a fraction of the casual price. Choose the membership that suits your lifestyle and the times you like to play. No lock-in contracts. Cancel any time.
        </p>
      </div>
    </section>

    <section className="pb-20">
      <div className="container mx-auto px-4 grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
        {tiers.map((t) => (
          <TierCard key={t.name} tier={t} joinHref={hubUrl(tenant, "/")} />
        ))}
      </div>
      <div className="container mx-auto px-4 mt-6 max-w-5xl">
        <div className="md:max-w-sm">
          <TierCard tier={frontlineTier} joinHref={hubUrl(tenant, "/")} />
        </div>
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
            <div className="text-sm text-foreground/60 mb-2 space-y-0.5">
              {offPeakLines.map((l) => <p key={l}>{l}</p>)}
            </div>
            <p className="text-sm text-foreground/60 mb-6">Per bay, up to 2 guests</p>
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
            <div className="text-sm text-foreground/60 mb-2 space-y-0.5">
              {peakLines.map((l) => <p key={l}>{l}</p>)}
            </div>
            <p className="text-sm text-foreground/60 mb-6">Per bay, up to 2 guests</p>
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

const TierCard = ({ tier: t, joinHref }: { tier: MarketingTier; joinHref: string }) => (
  <div
    className={`relative rounded-2xl p-6 border transition-all hover:shadow-lg ${
      t.highlight
        ? "border-accent ring-2 ring-accent/20 mt-6 md:mt-0 bg-card text-card-foreground"
        : t.subtle
          ? "border-dashed border-border bg-muted/40 text-foreground"
          : "border-border bg-card text-card-foreground"
    }`}
  >
    {t.highlight && t.badge && (
      <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap bg-accent text-accent-foreground text-xs font-display uppercase tracking-wider px-4 py-1.5 rounded-full shadow-sm">
        {t.badge}
      </span>
    )}
    {t.info && (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t.info}
              className="absolute top-4 right-4 text-foreground/40 hover:text-accent transition-colors"
            >
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] text-xs">{t.info}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
    <p className="text-xs font-bold uppercase tracking-wider mb-2 text-foreground/60">{t.tag}</p>
    <h3 className={`font-display text-2xl uppercase tracking-wide mb-1 ${t.subtle ? "text-foreground/80" : ""}`}>{t.name}</h3>
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
      href={joinHref}
      className={`block text-center font-display uppercase tracking-wide text-sm px-5 py-3 rounded-md transition-colors ${
        t.subtle
          ? "border border-primary/40 text-primary hover:bg-primary/5"
          : "bg-primary hover:bg-primary/90 text-primary-foreground"
      }`}
    >
      Join
    </a>
  </div>
);


export default MarketingMembership;
