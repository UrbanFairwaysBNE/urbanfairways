import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useTenant } from "@/config/tenant";
import pageHeader from "@/assets/page-header-city.jpg";
import samPhoto from "@/assets/sam-tpi-coach.jpg.asset.json";
import { Activity, HeartPulse, Move, Target } from "lucide-react";

const pillars = [
  { icon: Move, title: "Mobility", body: "How freely your joints move through the positions the golf swing asks for." },
  { icon: Activity, title: "Stability", body: "Your ability to control that movement under speed and load." },
  { icon: HeartPulse, title: "Biomechanics", body: "How your body sequences power from the ground up." },
  { icon: Target, title: "Swing analysis", body: "Detailed video and launch data tied back to how you actually move." },
];

const MarketingTPI = () => {
  const { tenant } = useTenant();

  return (
    <MarketingLayout>
      <Seo
        title={`TPI Assessment Screening | ${tenant.venue_name}`}
        description={`TPI (Titleist Performance Institute) assessment screening at ${tenant.venue_name}, West End. Mobility, stability and biomechanics screening to build a swing that works with your body.`}
        path="/tpi-assessment"
      />

      <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pageHeader})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-brand-accent-soft font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Improve with real data</p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">TPI Assessment</h1>
        </div>
      </section>

      <section className="py-12 sm:py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">Meet your coach</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-6">
            TPI Assessment Screening
          </h2>

          <figure className="float-none sm:float-left sm:mr-6 mb-5 w-[150px] sm:w-[180px] mx-auto sm:mx-0">
            <img
              src={samPhoto.url}
              alt="Sam Brooks, TPI certified golf coach at Urban Fairways"
              loading="lazy"
              className="w-full rounded-md object-cover aspect-[3/4] shadow-md"
            />
            <figcaption className="mt-2 text-center sm:text-left">
              <p className="font-display text-primary text-sm tracking-wide uppercase">Sam Brooks</p>
              <p className="text-xs text-foreground/60">TPI Certified Coach</p>
            </figcaption>
          </figure>

          <div className="space-y-4 text-foreground/80 leading-relaxed">
            <p>
              I'm a dedicated golf coach specializing in a results-driven blend of TPI (Titleist Performance
              Institute) methods, traditional coaching principles, and advanced swing analysis.
            </p>
            <p>
              My approach goes beyond simply fixing your swing — I focus on how your body moves, identifying
              physical limitations and movement patterns that directly impact performance.
            </p>
            <p>
              Using TPI screening, I assess mobility, stability, and biomechanics to build a swing that works with
              your body, not against it. Combined with proven traditional coaching techniques and detailed video
              analysis, I help golfers of all levels develop more efficient, consistent, and powerful swings.
            </p>
            <p>
              Whether you're looking to improve accuracy, increase distance all whilst playing pain free golf, my
              coaching is tailored to your individual needs, goals, and physical capabilities.
            </p>
            <p>The result is a smarter, more sustainable path to better golf.</p>
            <p className="font-display text-primary text-xl tracking-wide uppercase">
              Train with purpose. Move better. Play better.
            </p>
          </div>
          <div className="clear-both" />
        </div>
      </section>



      <section className="py-12 sm:py-20 bg-secondary/40">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-8">
            What the screening looks at
          </h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {pillars.map((p) => (
              <div key={p.title} className="bg-card border border-border rounded-xl p-6">
                <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg tracking-wide uppercase text-primary mb-2">{p.title}</h3>
                <p className="text-foreground/80 text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-6 py-3 rounded-md transition-colors"
            >
              Book a TPI screening
            </Link>
            <Link
              to="/coaching"
              className="inline-block border border-primary/20 hover:border-accent text-primary font-display tracking-wide text-sm uppercase px-6 py-3 rounded-md transition-colors"
            >
              See all coaching
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingTPI;
