import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Globe, CalendarDays, Zap, Trophy } from "lucide-react";
import venueInterior from "@/assets/venue-interior.jpg";
import pageHeader from "@/assets/page-header-city.jpg";
import { useTenant } from "@/config/tenant";
import { WeeklyLeagueBoard } from "@/components/compete/CompeteBoards";


const features = [
  { icon: Globe, title: "Web Portal Access", body: "See every stat, every shot, every round on the go with our SGT web portal." },
  { icon: CalendarDays, title: "Weekly Rounds", body: "Play your weekly competition rounds whenever suits you." },
  { icon: Zap, title: "Seamless Play", body: "Book any bay and instantly access your own tournament rounds." },
  { icon: Trophy, title: "Prizes & Giveaways", body: "Win big, or small, with locally supported prizes and giveaways." },
];

const getFaqs = (venueName: string) => [
  {
    section: "General Information",
    items: [
      { q: `What is the ${venueName} League?`, a: `The ${venueName} League (UF League) is a members-only simulator golf league run through the Simulator Golf Tour (SGT). You play handicapped tournament rounds in your own time, with live leaderboards, weekly winners, monthly standings and prizes.` },
      { q: "How much does it cost to join?", a: `Access to the UF League is included with eligible memberships. Higher tiers include full access, and entry-level members can still join our local weekly comp.` },
      { q: "Is it the same as the Wednesday 2-Man Ambrose?", a: "No. The Ambrose is a separate in-person team comp scored on the night. The UF League is the ongoing online tour with its own handicaps and standings." },
    ],
  },
  {
    section: "Registration & Setup",
    items: [
      { q: "How do I join?", a: `Sign up in the ${venueName} app — open the League tile on your dashboard and complete the short registration form. You choose an SGT username and password and tell us your typical 18-hole score.` },
      { q: "What happens after I register?", a: "Our team reviews your registration and sets your starting handicap. Once that's approved you're automatically added to the active tours and entered into the open tournaments — no further setup needed." },
      { q: "How do I load my rounds in the bay?", a: "In GSPRO, go to Players and click Guest 1, then enter your SGT User and UID exactly as they appear in My Account (case sensitive). Press Save & Exit, then click Tournaments and your league rounds will appear. After the first time, you'll be logged in automatically each session." },
      { q: "What if I want to cancel?", a: "Just email us and we'll cancel your membership within 24 working hours. Your most recent weekly payment will not be refunded." },
    ],
  },
  {
    section: "Gameplay & Rules",
    items: [
      { q: "How many rounds do I play each week?", a: "Two full 18-hole rounds per week. They can be played on different days and can be resumed later if you need to stop." },
      { q: "When does each week run?", a: "Tournament weeks start Sunday and close Monday morning (Brisbane time). Within that window you can play whenever suits you." },
      { q: "What courses will I play?", a: "We select the best courses each week. Some tours are themed — for example an Aussie tour featuring only Australian courses." },
      { q: "What if I don't finish a round?", a: "If you have to stop, quit while you're on the tee box of a hole. Quitting midway through a hole can cause scoring bugs. Only complete 18-hole rounds count toward handicaps and standings." },
      { q: "What if I hit an accidental shot or get a strange misread?", a: `Although scores can be edited, to ensure fair play all scores are final. We recommend getting comfortable with GSPRO and sim usage before competing in the UF League.` },
    ],
  },
  {
    section: "Handicaps",
    items: [
      { q: "How do I get a handicap?", a: "Your starting handicap is set by our team when you register, based on your typical scoring. There's no qualifying round to complete." },
      { q: "When does my handicap become official?", a: "Your onboarding handicap is locked for your first 6 rounds (around 3 weeks). After that your UF handicap recalculates weekly from the best 3 of your last 6 rounds." },
      { q: "Why am I shown as (E) on the leaderboard?", a: "You're provisional until you've completed 3 full 18-hole rounds. You still play and appear on the leaderboard, but you can't win a prize until you hold a true UF handicap." },
      { q: "When do I start earning points?", a: "Monthly points accrue from your 4th completed round onwards, once your true handicap is set." },
    ],
  },
  {
    section: "Scoring & Standings",
    items: [
      { q: "How is scoring tracked?", a: "Scoring is fully automated through GSPRO and SGT. Your results show at the end of the round and appear online almost immediately." },
      { q: "Where can we see the leaderboard?", a: `Live leaderboards are on this page and in the app, and they're also on the ${venueName} TV in the venue.` },
      { q: "How do monthly standings work?", a: "Each tournament week awards points on a descending scale to the field, grouped by calendar month. Provisional players are excluded from prize positions." },
      { q: "What if I miss a week?", a: "You won't score points for that week, but standings are cumulative so one missed week won't ruin your month." },
      { q: "Are there prizes?", a: "Yes. Weekly winners receive venue credit, and there's a monthly tour champion prize alongside rotating giveaways from local businesses." },
    ],
  },
];

const MarketingLeague = () => {
  const { tenant } = useTenant();
  const faqs = getFaqs(tenant.venue_name);
  return (
  <MarketingLayout>
    <Seo title={`The ${tenant.venue_name} League | Weekly Sim Golf`} description={`Play the ${tenant.venue_name} League each week: handicapped simulator tournaments, live leaderboards, monthly winners and prizes.`} path="/league-info" />
    <section className="relative h-[19vh] min-h-[130px] flex items-end overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${pageHeader})` }} />
      <div className="absolute inset-0 bg-gradient-to-t from-primary via-primary/80 to-primary/40" />
      <div className="relative container mx-auto px-4 pb-8">
        <p className="text-accent font-display font-bold tracking-[0.25em] uppercase text-xs mb-1.5">Members Only</p>
        <h1 className="font-display text-3xl sm:text-5xl text-primary-foreground leading-none">
          Welcome to the<br /><span className="text-accent">{tenant.venue_name} League</span>
        </h1>
      </div>
    </section>

    <section className="py-12 sm:py-16">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-lg text-foreground/80 leading-relaxed">
          The {tenant.venue_name} League is the ultimate place to be for golfers looking to show off their skills. A perk of
          eligible membership tiers, it creates a great community and healthy competition. It's competitive, social, and the
          best way to get more out of every swing.
        </p>
      </div>
    </section>

    <section className="pb-12 sm:pb-16">
      <div className="container mx-auto px-4 max-w-5xl">
        <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3 text-center">This week</p>
        <h2 className="font-display text-3xl sm:text-4xl text-primary text-center leading-tight mb-8">
          Live weekly leaderboard.
        </h2>
        <WeeklyLeagueBoard />
      </div>
    </section>


    <section className="bg-primary text-primary-foreground py-12 sm:py-20">
      <div className="container mx-auto px-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl">
        {features.map((f) => (
          <div key={f.title} className="bg-primary-foreground/5 border border-primary-foreground/10 rounded-xl p-6">
            <div className="w-11 h-11 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-4">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="font-display text-lg tracking-wide uppercase mb-2">{f.title}</h3>
            <p className="text-primary-foreground/75 text-sm leading-relaxed">{f.body}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        <p className="text-accent font-display font-bold tracking-[0.2em] uppercase text-sm mb-3 text-center">How does it work?</p>
        <h2 className="font-display text-4xl sm:text-5xl text-primary text-center leading-tight mb-12">
          Everything you need to know.
        </h2>

        {faqs.map((group) => (
          <div key={group.section} className="mb-10">
            <h3 className="font-display font-bold text-sm uppercase tracking-[0.2em] text-accent mb-4">{group.section}</h3>
            <Accordion type="single" collapsible className="space-y-2">
              {group.items.map((item, i) => (
                <AccordionItem
                  key={i}
                  value={`${group.section}-${i}`}
                  className="bg-card border border-border rounded-lg px-5"
                >
                  <AccordionTrigger className="font-display tracking-wide text-left hover:no-underline">
                    {item.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-foreground/75 leading-relaxed">
                    {item.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </section>
  </MarketingLayout>
  );
};

export default MarketingLeague;
