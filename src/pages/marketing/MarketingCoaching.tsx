import { Link } from "react-router-dom";
import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { useTenant } from "@/config/tenant";
import venueInterior from "@/assets/venue-interior.jpg";
import { Check, Clock, DollarSign, MapPin, Users } from "lucide-react";

const EnquiryButton = ({ label = "Enquiry" }: { label?: string }) => (
  <Link
    to="/contact"
    className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-6 py-3 rounded-md transition-colors"
  >
    {label}
  </Link>
);

const Tick = ({ children }: { children: React.ReactNode }) => (
  <li className="flex gap-3 text-foreground/80 leading-relaxed">
    <Check className="h-5 w-5 text-accent shrink-0 mt-0.5" />
    <span>{children}</span>
  </li>
);

const MarketingCoaching = () => {
  const { tenant } = useTenant();

  return (
    <MarketingLayout>
      <Seo
        title={`Golf Coaching & Lessons | ${tenant.venue_name}`}
        description="TPI assessment screening, PGA Pro 1-on-1 lessons, ladies beginner classes and a junior after school golf program at Urban Fairways, West End."
        path="/coaching"
      />

      <section className="relative h-[17vh] min-h-[110px] flex items-end overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${venueInterior})` }} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/70 to-primary/30" />
        <div className="relative container mx-auto px-4 pb-8">
          <p className="text-accent font-display tracking-[0.25em] uppercase text-xs mb-1.5">Improve your game</p>
          <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">Coaching</h1>
        </div>
      </section>

      {/* TPI teaser */}
      <section className="py-12 sm:py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Sam Brooks</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-4">
            TPI Assessment Screening
          </h2>
          <p className="text-foreground/80 leading-relaxed max-w-3xl mb-6">
            Mobility, stability and biomechanics screening to build a swing that works with your body, not against it.
          </p>
          <Link
            to="/tpi-assessment"
            className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide text-sm uppercase px-6 py-3 rounded-md transition-colors"
          >
            Learn about TPI
          </Link>
        </div>
      </section>


      {/* PGA Pro 1-on-1 */}
      <section className="py-12 sm:py-20 bg-secondary/40">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Private Coaching</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-4">
            PGA Pro 1-on-1 Golf Lessons
          </h2>
          <p className="font-display text-2xl text-accent mb-6">$135 / hour</p>
          <ul className="space-y-3 mb-6 max-w-3xl">
            <Tick>Perfect for beginners building a solid foundation</Tick>
            <Tick>Tailored training for players looking to sharpen their skills</Tick>
            <Tick>Flexible scheduling to fit your lifestyle</Tick>
          </ul>
          <div className="space-y-3 text-foreground/80 leading-relaxed max-w-3xl">
            <p>
              If you feel your swing is not working the way you want and you don't know how to fix it — let our PGA
              Pro guide you in a 1-on-1 session.
            </p>
            <p>
              Whether you're just starting out or aiming to take your game to the next level, we'll help you get
              there.
            </p>
            <p className="font-semibold text-primary">
              Book your private session today and train the PGA way!
            </p>
          </div>
          <div className="mt-8">
            <EnquiryButton />
          </div>
        </div>
      </section>

      {/* Ladies beginner group classes */}
      <section className="py-12 sm:py-20">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Coming Soon</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-6">
            Ladies Beginner Group Classes
          </h2>

          <div className="grid sm:grid-cols-2 gap-6 mb-8">
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3 text-accent">
                <Clock className="h-5 w-5" />
                <span className="font-display tracking-[0.15em] uppercase text-xs">When</span>
              </div>
              <p className="text-foreground/80">Wednesday evenings – 6:00pm – 7:30pm</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3 text-accent">
                <DollarSign className="h-5 w-5" />
                <span className="font-display tracking-[0.15em] uppercase text-xs">Price</span>
              </div>
              <p className="text-foreground/80">$299 per 6 weeks</p>
            </div>
          </div>

          <h3 className="font-display text-xl tracking-wide uppercase text-primary mb-4">What you get</h3>
          <ul className="space-y-3 mb-8 max-w-3xl">
            <Tick>90 minutes per session</Tick>
            <Tick>Small class (max 8 students, 2 per bay) – more practice, more attention</Tick>
            <Tick>For ages 10+</Tick>
            <Tick>No experience needed</Tick>
            <Tick>Clubs provided</Tick>
          </ul>

          <h3 className="font-display text-xl tracking-wide uppercase text-primary mb-4">Great for</h3>
          <ul className="space-y-3 mb-8 max-w-3xl">
            <Tick>Golf for beginners</Tick>
            <Tick>Family &amp; kids (parent-child practice)</Tick>
            <Tick>Ladies who want to build a strong golf foundation</Tick>
          </ul>

          <p className="flex items-center gap-2 text-primary font-semibold mb-8">
            <MapPin className="h-5 w-5 text-accent" />
            Limited spots – book now and start your golf journey!
          </p>
          <EnquiryButton />
        </div>
      </section>

      {/* Junior program */}
      <section className="py-12 sm:py-20 bg-secondary/40">
        <div className="container mx-auto px-4 max-w-5xl">
          <p className="text-accent font-display tracking-[0.2em] uppercase text-sm mb-3">Juniors</p>
          <h2 className="font-display text-3xl sm:text-4xl text-primary leading-tight mb-6">
            {tenant.venue_name} Junior After School Golf Program
          </h2>

          <div className="grid sm:grid-cols-3 gap-6 mb-8">
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3 text-accent">
                <Clock className="h-5 w-5" />
                <span className="font-display tracking-[0.15em] uppercase text-xs">Time</span>
              </div>
              <p className="text-foreground/80">Tuesday afternoon 3:30 – 4:30pm</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3 text-accent">
                <Users className="h-5 w-5" />
                <span className="font-display tracking-[0.15em] uppercase text-xs">Who</span>
              </div>
              <p className="text-foreground/80">Students only</p>
            </div>
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-3 text-accent">
                <DollarSign className="h-5 w-5" />
                <span className="font-display tracking-[0.15em] uppercase text-xs">Weekly fee</span>
              </div>
              <p className="text-foreground/80">$60</p>
            </div>
          </div>

          <h3 className="font-display text-xl tracking-wide uppercase text-primary mb-4">Why parents love it</h3>
          <ul className="space-y-3 mb-8 max-w-3xl">
            <Tick>Safe, structured environment after school</Tick>
            <Tick>Kids can do homework, practice golf, or join training</Tick>
            <Tick>Less screen time, more active learning</Tick>
            <Tick>Access to golf learning videos</Tick>
            <Tick>
              Remote coaching – send swing videos and receive PGA Pro feedback within 24 working hours
            </Tick>
          </ul>

          <div className="space-y-3 text-foreground/80 leading-relaxed max-w-3xl mb-8">
            <p>Cancel anytime (no refund for the current week or missed sessions, as this is already our lowest price).</p>
            <p>Perfect for busy parents – while you work, your child stays safe, productive, and active.</p>
            <p className="font-semibold text-primary">
              Join the {tenant.venue_name} Junior Program today and give your child the best after-school balance of
              study and sport!
            </p>
          </div>
          <EnquiryButton />
        </div>
      </section>
    </MarketingLayout>
  );
};

export default MarketingCoaching;
