import Seo from "@/components/Seo";
import MarketingLayout from "@/components/marketing/MarketingLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTenant } from "@/config/tenant";

const getGroups = (venueName: string, email: string, phone: string) => [
  {
    section: `Visiting ${venueName}`,
    items: [
      { q: "What are your operating hours?", a: "Bays can be booked from 5:30am to 11:00pm, 7 days a week." },
      { q: "Do you have a reception?", a: `${venueName} is self check-in — each bay switches on and off with your booking. If you need a hand, email ${email} or call ${phone} any time.` },
      { q: "Are clubs and balls provided?", a: "Yes. Sets of clubs are freely available to use and balls are provided at no charge. You're welcome to bring your own balls as long as they're clean and free of scuffs or nicks." },
      { q: "Can I bring a friend?", a: "Yes. Members can bring up to 3 guests per session at no extra charge. We suggest allowing around an hour per person so everyone gets plenty of time." },
      { q: "What parking is available?", a: "There are 4 free spaces directly in front of the venue, plus 2-hour free parking across the street at Woolworths." },
      { q: "Is the space available for private hire or corporate bookings?", a: "Yes, we have a function room available. Get in touch with the team to arrange an inspection." },
    ],
  },
  {
    section: "Booking & Bays",
    items: [
      { q: "How do I book a bay?", a: "For casual play, hit the Book a Bay button. Members book sessions through the booking portal. Not a member yet? Choose a membership under Join Now, then book your session in the portal." },
      { q: "How does the bay work?", a: "When you book, you'll get a confirmation email with a one-time access code. Enter the code followed by # at the door. Your bay powers on shortly before your booking starts and shuts down just after it ends, so sessions flow smoothly from one to the next." },
      { q: "How long should I book for?", a: "For one person, an hour is usually enough for range practice or 18 holes. As a guide: 2 players around 2 hours, 3 players around 2.5–3 hours." },
      { q: "What if there's a problem, like a system crash?", a: `The bays are computer-controlled, so the occasional crash can happen. Message us on WhatsApp (${phone}) and we'll sort it as quickly as we can and add any lost time back to your session.` },
      { q: "What software powers the simulators?", a: "Our simulators run GSPro, with over 2,000 high-end courses, realistic ball physics and a full suite of game improvement features." },
    ],
  },
  {
    section: "Membership",
    items: [
      { q: "Do I need a membership to play?", a: "Not at all. Memberships give you the best value with perks like preferred booking hours, but you're always welcome to play pay-as-you-go." },
      { q: "How do I join?", a: "Click Join Now to sign up. You'll receive a welcome email with everything you need to get started." },
      { q: "How do I cancel?", a: `Members need to give 7 days' notice to cancel a membership — just email ${email}. The most recent weekly payment isn't refunded.` },
    ],
  },
  {
    section: "Coaching",
    items: [
      { q: "Can I invite a coach for private teaching?", a: "Yes, all coaches are welcome. You're free to arrange private lessons during your session." },
    ],
  },
];


const MarketingFAQs = () => {
  const { tenant } = useTenant();
  const groups = getGroups(tenant.venue_name, tenant.support_email, tenant.support_phone);
  return (
  <MarketingLayout>
    <Seo title={`FAQs | ${tenant.venue_name} Indoor Golf`} description={`Answers on booking, pricing, memberships, bay access, rental clubs, gift cards and the ${tenant.venue_name} League.`} path="/faqs" />
    <section className="bg-primary text-primary-foreground py-12 sm:py-20">
      <div className="container mx-auto px-4 max-w-3xl text-center">
        <p className="text-brand-accent-soft font-display font-bold tracking-[0.25em] uppercase text-sm mb-2">FAQs</p>
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
