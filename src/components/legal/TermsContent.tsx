import { useTenant } from "@/config/tenant";

/**
 * Single source of truth for the Terms and Conditions body.
 * Used by the sign-up dialog and the re-consent gate so the two can never drift.
 */
export function TermsContent() {
  const { tenant } = useTenant();
  const legalName = tenant.legal_entity || tenant.venue_name;
  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p className="font-semibold text-foreground">
        {legalName}, Terms and Conditions
      </p>
      <p>
        These Terms and Conditions ("Terms") govern the use of all facilities, equipment, and services provided by {legalName} ("{tenant.venue_name}", "we", "us", or "our"). By signing up for a membership, booking a session, or otherwise accessing the premises, you ("Customer", "you", or "your") agree to be bound by these Terms.
      </p>

      <div>
        <h3 className="font-semibold text-foreground">1. General Use of Facilities</h3>
        <p>1.1. {tenant.venue_name} provides indoor golf simulation services in a safe, clean, and welcoming environment.</p>
        <p>1.2. All customers must follow the instructions provided on signage, in-app messages, and/or by staff to ensure safe and appropriate use of the facility.</p>
        <p>1.3. Customers must not interfere with or modify any equipment or software systems.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">2. Health, Safety and Assumption of Risk</h3>
        <p>2.1. Customers are fully responsible for their own health and safety while on the premises.</p>
        <p>2.2. The use of real golf clubs and balls indoors is inherently dangerous and carries a risk of serious injury, including from swinging clubs, ricocheting balls, slips, trips and falls.</p>
        <p>2.3. {tenant.venue_name} takes all reasonable steps to provide a safe playing environment, but it is your responsibility to play safely, to swing only within your bay, and to maintain a safe distance from other players and equipment, particularly when beginners or children are present.</p>
        <p>2.4. You must warm up appropriately and only participate to the extent of your own physical ability, fitness and health. You confirm you are medically fit to participate and will stop immediately if you feel unwell or experience pain.</p>
        <p>2.5. You are responsible for the safety and conduct of every guest in your group, and for ensuring they understand and follow these Terms.</p>
        <p>2.6. All use of the facilities, equipment and services is entirely at your own risk. You voluntarily assume all risks of personal injury, illness, death, or loss of or damage to property arising from your use of the facility.</p>
        <p>2.7. To the maximum extent permitted by law, {tenant.venue_name}, its owners, staff and contractors are not liable for any personal injury, illness, death, loss or damage suffered by you or your guests, except where caused by our negligence or where liability cannot lawfully be excluded. Nothing in these Terms excludes, restricts or modifies any rights you have under the Australian Consumer Law.</p>
        <p>2.8. Personal property is brought onto the premises at your own risk. {tenant.venue_name} is not responsible for lost, stolen or damaged personal items.</p>
        <p>2.9. You must report any accident, injury, hazard or equipment fault to {tenant.venue_name} as soon as possible using the contact number displayed in the bay.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">3. Damage and Liability</h3>
        <p>3.1. You are liable for any damage you or your guests cause to any equipment, furniture, or fittings within the {tenant.venue_name} premises.</p>
        <p>3.2. Intentional or reckless damage may result in repair or replacement costs being invoiced to you.</p>
        <p>3.3. We reserve the right to recover all associated costs and pursue legal action if necessary.</p>
        <p>3.4. You indemnify {tenant.venue_name} against any claim, loss, cost or expense arising from your use of the facility, or from the acts or omissions of you or your guests, other than to the extent caused by our negligence.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">4. Alcohol Policy</h3>
        <p>4.1. Responsible alcohol consumption is mandatory.</p>
        <p>4.2. Anyone seen abusing alcohol or appearing intoxicated will be removed from the premises immediately and banned permanently.</p>
        <p>4.3. Alcohol service is only available to those with a valid Gold Bay booking during staffed hours (Fridays to Sundays, 2:00pm, 10:00pm).</p>
        <p>4.4. The bar is not open to the public, and cannot be accessed without a valid, active booking.</p>
        <p>4.5. BYO alcohol is strictly prohibited. Any individual caught bringing alcohol onto the premises will face an immediate and permanent ban.</p>
        <p>4.6. Alcohol may not be consumed or accessed outside of designated staffed hours.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">5. Booking, Access, and Session Rules</h3>
        <p>5.1. Your door access code will only be valid 10 minutes before your scheduled session.</p>
        <p>5.2. Early access is not permitted to ensure parking availability and operational flow.</p>
        <p>5.3. You and your entire group must vacate the premises promptly once your booking ends.</p>
        <p>5.4. Customers staying beyond their booked time may be issued a warning or banned.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">6. Guest Policy</h3>
        <p>6.1. Each bay booking allows a maximum of 3 people total (1 member + 2 guests).</p>
        <p>6.2. This operates on a trust system. Exceeding this limit will result in a warning and may lead to a ban.</p>
        <p>6.3. Memberships may not be shared. Sharing your membership or access code with another person is strictly prohibited and will result in disciplinary action including bans.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">7. Premises Access Hours</h3>
        <p>7.1. The facility is only accessible between 5:00am and 11:00pm daily.</p>
        <p>7.2. Remaining on the premises outside these hours may trigger a security alert and police may be contacted.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">8. Use of Equipment</h3>
        <p>8.1. Free golf club hire is available on a first-come, first-served basis.</p>
        <p>8.2. You agree to take care of hired equipment, return it after use, and keep it clean.</p>
        <p>8.3. Only clean, undamaged golf balls and clubs are to be used.</p>
        <p>8.4. Any customer using nicked, scuffed, or dirty balls/clubs that cause screen damage will be liable for replacement costs and may be banned.</p>
        <p>8.5. PCs and simulation equipment may only be used for their intended purpose, golf simulation. Any unauthorized use will result in an immediate and permanent ban.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">9. Children and Supervision</h3>
        <p>9.1. All minors must be supervised by an adult at all times.</p>
        <p>9.2. The supervising adult is fully responsible for the safety and conduct of the minor(s).</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">10. Behaviour and Conduct</h3>
        <p>10.1. {tenant.venue_name} maintains a zero-tolerance policy for abusive, aggressive, or inappropriate behaviour.</p>
        <p>10.2. We reserve the right to refuse service, terminate memberships, or ban individuals who violate these Terms.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">11. Cancellations and Refunds</h3>
        <p>11.1. All bookings are non-refundable unless otherwise stated.</p>
        <p>11.2. Reschedules may be allowed if requested at least 24 hours prior to your booking, subject to availability.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">12. Privacy Policy</h3>
        <p>12.1. By using {tenant.venue_name}, you agree to our collection and use of personal data as outlined in our Privacy Policy.</p>
        <p>12.2. Security cameras are in use throughout the facility for safety and monitoring purposes.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">13. Recording, Filming and Media Consent</h3>
        <p>13.1. Bays may be video and/or audio recorded, and gameplay, shot data and screen content may be captured, including automatically during league rounds, competitions and events.</p>
        <p>13.2. By using the facility, you consent to being photographed, filmed and recorded while on the premises, and to {tenant.venue_name} capturing your gameplay and performance data.</p>
        <p>13.3. You grant {tenant.venue_name} a non-exclusive, royalty-free, perpetual licence to use, edit and publish this footage, images and data (including your name, username, scores and handicap) for promotional, marketing, social media, leaderboard, broadcast and internal training purposes, without payment or further notice to you.</p>
        <p>13.4. You are responsible for making every guest in your group aware of this clause before they play.</p>
        <p>13.5. If you do not wish to appear in publicly shared content, you may opt out at any time by contacting {tenant.venue_name}, and we will use reasonable efforts to avoid publishing new content featuring you and to remove existing published content where practicable.</p>
        <p>13.6. Customers may film their own sessions for personal use, but must not film or publish footage of other customers without their consent.</p>
      </div>

      <div>
        <h3 className="font-semibold text-foreground">14. Amendments to Terms</h3>
        <p>14.1. {tenant.venue_name} reserves the right to amend these Terms at any time.</p>
        <p>14.2. Updated terms will be posted on our website and it is the customer's responsibility to review them periodically.</p>
      </div>

      <p className="font-semibold text-foreground pt-4">
        By signing up to {tenant.venue_name}, you acknowledge that you have read, understood, and agreed to abide by these Terms and Conditions. Failure to comply may result in the suspension or termination of your access to the facility.
      </p>
    </div>
  );
}
