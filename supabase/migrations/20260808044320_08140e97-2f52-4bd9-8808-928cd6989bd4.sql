DO $mig$
DECLARE
  p text := '<p style="margin:0 0 18px; font-family:Montserrat, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1C1F24;">%s</p>';
  pc text := '<p style="margin:0 0 18px; font-family:Montserrat, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1C1F24; text-align:center;">%s</p>';
  card text := '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #5F6F52;"><tr><td style="padding:20px; font-family:Montserrat, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1C1F24;"><div style="font-family:Montserrat, Arial, sans-serif; font-weight:700; font-size:18px; color:#1C1F24; margin:0 0 10px;">%s</div>%s</td></tr></table>';
  dark text := '<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1C1F24; border-radius:12px; margin:18px 0;"><tr><td style="padding:20px; font-family:Montserrat, Arial, sans-serif; font-size:15px; line-height:1.6; color:#F4F1EB; text-align:center;">%s</td></tr></table>';
  btn text := '<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;"><tr><td bgcolor="#5F6F52" style="border-radius:12px;"><a href="%s" style="display:inline-block; padding:14px 24px; font-family:Montserrat, Arial, sans-serif; font-weight:700; font-size:16px; color:#FFFFFF; text-decoration:none;">%s</a></td></tr></table>';
  app text := 'https://urbanfairways.com.au/app';
BEGIN
  INSERT INTO public.marketing_templates (name, description, category, subject, html_content, is_active) VALUES
  ('Event Announcement','Promote an upcoming event, night or comp at the venue.','promotion','{event_name} at Urban Fairways',
    format(p,'Hi {first_name},')
    || format(p,'We''ve got something on at Urban Fairways and we''d love to see you there.')
    || format(card,'{event_name}','<div><strong>When:</strong> {event_date} at {event_time}</div><div><strong>Where:</strong> Urban Fairways, 10 Ferry Rd, West End</div><div><strong>Cost:</strong> {event_price}</div>')
    || format(p,'Add a short paragraph here about what the night involves, the format, and what''s included. Keep it punchy — two or three sentences is plenty.')
    || format(dark,'Spots are limited and bays fill quickly.')
    || format(btn, app || '/booking','Book Your Spot')
    || format(pc,'See you in the bays.'), true),
  ('Special Promotion','Limited-time offer or discount on bay hire, packs or memberships.','promotion','Limited time: {offer_name}',
    format(p,'Hi {first_name},')
    || format(p,'For a limited time we''re running a special at Urban Fairways.')
    || format(dark,'<div style="font-family:Montserrat, Arial, sans-serif; font-weight:700; font-size:22px; margin:0 0 8px;">{offer_name}</div><div style="font-size:15px;">{offer_details}</div>')
    || format(card,'How it works','<div style="margin:4px 0;">1. Book your session online or in the app</div><div style="margin:4px 0;">2. Offer applies at checkout</div><div style="margin:4px 0;">3. Turn up and play</div>')
    || format(p,'Offer ends <strong>{offer_end_date}</strong>. Terms apply.')
    || format(btn, app || '/booking','Claim the Offer'), true),
  ('Venue Update','General news or operational update for all customers.','newsletter','An update from Urban Fairways',
    format(p,'Hi {first_name},')
    || format(p,'A quick update from the team at Urban Fairways.')
    || format(card,'{update_title}','<div>{update_details}</div>')
    || format(p,'Replace the block above with the detail of your update — new tech, changes to hours, a new coach, facility works, whatever it is.')
    || format(p,'Thanks as always for your support.')
    || format(btn,'https://urbanfairways.com.au','Visit the Website'), true),
  ('Monthly Newsletter','Recap of the month: league results, what''s coming, tips.','newsletter','Urban Fairways — {month} wrap',
    format(p,'Hi {first_name},')
    || format(p,'Here''s what happened at Urban Fairways this month, and what''s coming next.')
    || format(card,'On the leaderboard','<div>Recap the UF League and any comps here — winners, standout rounds, current monthly standings.</div>')
    || format(card,'Coming up','<div>List events, comps or promotions in the month ahead.</div>')
    || format(card,'Tip of the month','<div>A short coaching or practice tip from the team.</div>')
    || format(btn, app || '/league','See the Leaderboard'), true),
  ('Membership Promotion','Encourage casual customers to move onto a membership.','retention','Play more, pay less at Urban Fairways',
    format(p,'Hi {first_name},')
    || format(p,'If you''re playing regularly, a membership will almost always work out cheaper than casual rates.')
    || format(card,'Why members love it','<div style="margin:4px 0;">• Discounted hourly rates, peak and off-peak</div><div style="margin:4px 0;">• Access to the Urban Fairways League</div><div style="margin:4px 0;">• Simple weekly billing, cancel any time</div><div style="margin:4px 0;">• 24/7 access to all 7 bays</div>')
    || format(p,'Choose the tier that suits how often you play — you can switch or cancel whenever you like.')
    || format(btn, app || '/membership','View Memberships'), true),
  ('We Miss You','Win-back email for customers who haven''t booked in a while.','retention','Your bay is waiting, {first_name}',
    format(p,'Hi {first_name},')
    || format(p,'It''s been a while since your last session at Urban Fairways — the bays have missed you.')
    || format(card,'What''s new','<div>Mention anything that''s changed since they were last in: new courses, updated tech, new comps or coaching options.</div>')
    || format(dark,'7 bays. Open 5:30am to 11pm, every day.')
    || format(btn, app || '/booking','Book a Session')
    || format(pc,'Hope to see you soon.'), true);
END
$mig$;