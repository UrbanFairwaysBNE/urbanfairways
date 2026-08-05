import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useTenant, hubUrl } from "@/config/tenant";
import pageHeader from "@/assets/page-header-city.jpg";
import ufLabBadge from "@/assets/uf-lab-circle-dark.png";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Crosshair,
  Gauge,
  Target,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: Target,
    title: "One-tap shot export",
    body: "Set your club as you go, then hit Export to CSV in GSPro at the end of your range session. That's your only job — we take care of the rest.",
  },
  {
    icon: BarChart3,
    title: "Per-club gapping",
    body: "See true carry and total distance averages for every club in the bag, so you know exactly what you hit from 137 metres.",
  },
  {
    icon: Crosshair,
    title: "Dispersion analysis",
    body: "Visual scatter plots show your shot pattern per club — where you actually miss, not where you think you miss.",
  },
  {
    icon: Activity,
    title: "Swing dynamics",
    body: "Club path, face angle, attack angle and spin, tracked shot by shot to explain the shape you're producing.",
  },
  {
    icon: TrendingUp,
    title: "Progress tracking",
    body: "Rolling 30, 90 and 180 day views so improvement is measured, not guessed.",
  },
  {
    icon: Gauge,
    title: "Benchmarking",
    body: "Compare against tour and amateur benchmarks with focus cues on the one or two numbers worth working on.",
  },
];

const steps = [
  { n: "01", title: "Start a range session", body: "Load the GSPro driving range and select the correct club in the bottom left as you work through the bag." },
  { n: "02", title: "Hit Export", body: "When you're done, click the clipboard icon in the top left and choose Export to CSV. That's the only step on you." },
  { n: "03", title: "We do the rest", body: "Your session is processed and sent through to UF Lab in the Urban Fairways app, broken down club by club." },
];

const MarketingUFLab = () => {
  const { tenant } = useTenant();

  return (
    <MarketingLayout>
      <Seo
        title={`UF Lab | Golf Performance Data at ${tenant.venue_name}`}
        description={`UF Lab turns every range session at ${tenant.venue_name} into actionable data — club gapping, dispersion, swing dynamics and long-term progress tracking, included with membership.`}
        path="/uf-lab"
      />

      <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pageHeader})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-brand-accent-soft font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Improve with real data</p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">UF Lab</h1>
        </div>
      </section>

      <section className="py-12 sm:py-20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto">
            <img
              src={ufLabBadge}
              alt={`UF Lab at ${tenant.venue_name}`}
              className="h-28 sm:h-36 w-auto mx-auto mb-6 object-contain"
            />
            <h2 className="font-display text-3xl sm:text-5xl text-primary leading-tight">
              Your Personal Driving Range Coach.
            </h2>
            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              Every range session becomes actionable data. Track your distances, dispersion, swing dynamics and
              progress over time — all included with your {tenant.venue_name} membership.
            </p>
          </div>
        </div>
      </section>

      <section className="bg-muted py-12 sm:py-20">
        <div className="container mx-auto px-4">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3 text-center">What you get</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight text-center mb-12">
            Data that actually changes how you practice
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {features.map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-xl p-6 shadow-sm">
                <div className="w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-base tracking-wide uppercase leading-snug mb-2">{f.title}</h3>
                <p className="text-sm text-foreground/70 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-12 sm:py-20">
        <div className="container mx-auto px-4 max-w-4xl">
          <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3">How it works</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-10">
            Nothing extra to do
          </h2>
          <div className="grid sm:grid-cols-3 gap-6">
            {steps.map((s) => (
              <div key={s.n} className="border-l-2 border-accent/40 pl-5">
                <p className="font-display text-accent text-2xl mb-2">{s.n}</p>
                <h3 className="font-display uppercase tracking-wide text-primary mb-2">{s.title}</h3>
                <p className="text-sm text-foreground/70 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-primary py-14 sm:py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="font-display text-3xl sm:text-4xl text-primary-foreground leading-tight mb-4">
            Unlock UF Lab
          </h2>
          <p className="text-primary-foreground/75 mb-8 leading-relaxed">
            UF Lab is included with every {tenant.venue_name} membership. Join a tier, hit the range, and let the
            data do the rest.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/membership-info"
              className="inline-flex items-center gap-2 bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              View Memberships <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href={hubUrl(tenant, "/")}
              className="inline-flex items-center gap-2 border border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 font-display tracking-wide uppercase px-7 py-3.5 rounded-md"
            >
              Open The App
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingUFLab;
