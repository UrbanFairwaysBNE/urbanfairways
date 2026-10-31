# Switchover preparation
- [ ] Show lesson customers on booking tiles and attribute lesson UF Lab exports to their accounts; test both rules.
- [x] Verify email-footer unsubscribe and add a manual marketing unsubscribe action in customer profiles; tested signed-out email links, one-click POST, persisted admin opt-out, and blocked sends without sending customer emails.
- [x] Review SEO foundations and add a generated sitemap for public website pages with a robots.txt reference; verify the preview serves valid XML. Live availability requires the next publish.
- [x] Allow 1.5-hour bookings in the live database; verify the booking row type preserves 1.5 and retain a read-only SQL regression test.
- [x] Include the lesson's door code in customer and coach confirmation/reschedule emails and SMS; deployed sender and passed 11 regression tests. No customer test messages sent.
- [x] Hide 2-Man Ambrose from the website and verify the Wednesday competition popup is disabled (live comp_enabled=false; booking prompt checks that flag).
- [x] Permanently exempt all 966 current customers from First Session Free and exclude exempt accounts from the marketing eligibility count.
- [x] Disable First Session Free schedule, templates and award endpoint; reverse 174 $40 credits ($6,960) with an auditable entry per original credit; preserve all 18 migration credits ($915).
- [x] Add a separate Switchover tab with the account-change notice and launch-day instructions.
- [x] Verify the notice preview and existing customer-import link.
- [x] Document remaining operational prerequisites; do not cancel memberships, issue credits or send emails in this task.

# Reviewed customer migration
- [x] Merge Sam's reviewed names, preserving blank surnames and excluding in-house exceptions from credit.
- [x] Import customer accounts without sending launch emails or activating memberships.
- [x] Apply and reconcile one-week migration credits without duplicates; verify customer records and account editing.

# Switchover notices and timetable blocks
- [x] Use the customer first-name tag in both switchover greetings.
- [x] Add up-to-10-hour blocks and editing for existing blocks; verified create, edit readback, and test-block removal in the signed-in admin timetable.
- [ ] Send and test notices: blocked pending a dedicated bulk email service; Lovable app emails cannot send to customer lists.