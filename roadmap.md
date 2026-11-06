# Switchover preparation
- [x] Remove overlapping shutdown requests and give different-customer back-to-back changeovers exclusive launch/settings ownership; 43 regression tests passed and preview opens without page errors. Release/install and real Windows booking verification remain under Windows delivery below.
- [x] Add durable GSPro/ProTee process identities, PID-targeted shutdown, shared launch protection, and controller restart evidence using existing reporting; source tests passed and seven-bay current status verified signed-in on desktop/phone. Windows execution and installer delivery remain blocked below.
- [x] Correct Windows shutdown-check quoting that leaves Launch Apps blocked despite closed simulators; Bay 7 logs confirmed cmd.exe splitting the quoted pipe. Source repaired; 20 tests and syntax check passed. Installer delivery and real-PC confirmation remain blocked under Windows release delivery below.
- [x] Resolve ambiguous shutdown warnings when the same shutdown immediately reports closure; 13 tests passed, six SQL matching cases passed, and Bay 2 checked green signed-in. Unresolved and confirmed-running failures remain visible.
- [x] Correct contradictory shutdown reporting and independently verify visible/named processes; 23 tests and 3 live classifier checks passed. Today’s Bay 4/6 events now read as unverified, not confirmed close failures; signed-in warning checked. Windows changes await release and real-PC verification as below.
- [x] Add complimentary membership assignment to the Customers three-dot menu; admin-only function deployed, four rule tests passed, signed-in assignment saved/read back, paid checkout blocked, and admin test account restored.
- [x] Harden Bay Controller shutdown: correct ProTee executable/window targeting, tree-kill, bounded retries, booking rechecks; nine tests passed and browser simulation confirmed forced shutdown after three attempts.
- [ ] Windows release delivery and real-PC shutdown verification: blocked on updated sources reaching the controller release repository and a Windows installer reaching a bay PC; no GitHub connection available here. This checkout's release target is urbanfairways, while project memory names UF-Bay-Controller, so the correct release destination must be reconciled before delivery.
- [x] Show lesson customers on booking tiles and attribute lesson UF Lab exports to their accounts; seven tests passed, both deployed ingestion paths verified with a confirmed lesson and test CSVs removed, customer tile checked signed-in.
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