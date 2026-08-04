import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTenant } from "@/config/tenant";

const getGroups = (venueName: string) => [
  {
    section: `Visiting ${venueName}`,
    items: [
      { q: "Do I need to be a member?", a: "No, visitors are always welcome. Just book a bay online and turn up. Pay-as-you-go rates are $30/hr off-peak and $35/hr peak, per bay for up to 4 players." },
      { q: "When are we open?", a: "Members have access from 5am - 11pm via the automated bays. Staffed hours vary, check the banner at the top of the site or call us." },
      { q: "How many people can fit in a bay?", a: "Each bay comfortably fits up to 4 players. You can play stroke play, scramble, closest-to-pin and more, all on the same booking." },
      { q: "Do you provide clubs?", a: "Yes, we have rental clubs available at the centre. Just let us know when you book." },
      { q: "Is there a bar on site?", a: `Yes, the ${venueName} Bar is open during staffed hours serving a range of drinks. Grab a cold one while you play or wind down after your round.` },
    ],
  },
  {
    section: "Booking & Payment",
    items: [
      { q: "How do I book?", a: `Bookings are made through The ${venueName} Hub. Choose your bay, your time, and pay online, done in under a minute.` },
      { q: "Can I cancel or reschedule?", a: "Yes, bookings can be cancelled or rescheduled from inside The Hub up until the booking starts." },
      { q: "Do you offer gift cards?", a: "Yes, gift cards are available on our Gift Cards page and can be redeemed for any booking or membership." },
    ],
  },
  {
    section: "Membership",
    items: [
      { q: "What memberships are available?", a: "We offer three weekly plans: Weekday ($15), Birdie ($27) and Eagle ($35). All include discounted bay rates and no lock-in contracts." },
      { q: "Can I cancel any time?", a: "Yes, all memberships can be cancelled at any time. We don't refund the most recent weekly payment." },
      { q: "What's the difference between Birdie and Eagle?", a: "Eagle members get a lower hourly rate ($8 vs $10) and priority booking. Both tiers include access to the League." },
      { q: "Can Weekday members join competitions?", a: "Yes, Weekday members can join our Wednesday local comp. The full League season is a perk reserved for Birdie and Eagle members." },
    ],
  },
  {
    section: `${venueName} League`,
    items: [
      { q: "What is the League?", a: "A members-only golf sim league with weekly tournament rounds, leaderboards, competitions and prizes. Access is included with Birdie and Eagle memberships." },
      { q: "How do I play?", a: "Once you've created an SGT account, your name is synced to every bay. Hit ONLINE MATCH, choose your name, and play your weekly rounds whenever suits you." },
      { q: "Are there prizes?", a: "Yes, we work with local businesses and run a monthly medal prize alongside ad-hoc giveaways." },
    ],
  },
];

const MarketingFAQs = () => {
  const { tenant } = useTenant();
  const groups = getGroups(tenant.venue_name);
  return (
  <MarketingLayout>
    <Seo title={`FAQs | ${tenant.venue_name} Indoor Golf`} description={`Answers on booking, pricing, memberships, bay access, rental clubs, gift cards and the ${tenant.venue_name} League at our Redland Bay centre.`} path="/faqs" />
    <section className="bg-primary text-primary-foreground py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-accent font-display tracking-[0.25em] uppercase text-sm mb-2">FAQs</p>
        <h1 className="font-display text-5xl sm:text-6xl leading-none mb-4">Questions, Answered.</h1>
        <p className="text-primary-foreground/80 text-lg">
          Everything you need to know about {tenant.venue_name}, visiting, booking, memberships and the league.
        </p>
      </div>
    </section>

    <section className="py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl">
        {groups.map((group) => (
          <div key={group.section} className="mb-10">
            <h3 className="font-display text-sm uppercase tracking-[0.2em] text-accent mb-4">{group.section}</h3>
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

        <div className="bg-card border border-border rounded-2xl p-8 text-center mt-12">
          <h3 className="font-display text-2xl text-primary mb-3">Still have a question?</h3>
          <p className="text-foreground/70 mb-5">Drop us a line, we usually reply within the hour.</p>
          <a
            href={`mailto:${tenant.support_email}`}
            className="inline-block bg-accent hover:bg-accent/90 text-accent-foreground font-display tracking-wide uppercase px-6 py-3 rounded-md"
          >
            Email Us
          </a>
        </div>
      </div>
    </section>
  </MarketingLayout>
  );
};

export default MarketingFAQs;
