import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import EmbedCompete from "@/pages/EmbedCompete";
import venueInterior from "@/assets/venue-interior.jpg";
import { useTenant } from "@/config/tenant";

const MarketingCompete = () => {
  const { tenant } = useTenant();
  return (
  <MarketingLayout>
    <Seo title={`Competitions & Leaderboards | ${tenant.venue_name}`} description={`See live leaderboards for the ${tenant.venue_name} League and other local simulator golf competitions.`} path="/compete-info" />
    <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Welcome</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">Compete</h1>
      </div>
    </section>
    <EmbedCompete hideHero />
  </MarketingLayout>
  );
};

export default MarketingCompete;
