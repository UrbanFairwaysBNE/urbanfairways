import { bookingUrl, type TenantSettings } from "@/config/tenant";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return entities[character] ?? character;
});

export function getSwitchoverNotices(tenant: TenantSettings) {
  const ahead = `Hi {first_name},

We’re moving ${tenant.venue_name} to our new app and booking system on Tuesday 20 October 2026.

Your customer account will be migrated for you, but ALL existing memberships will be cancelled as part of the switchover. Your current membership will not transfer automatically.

Once the new system is live, you’ll need to sign up to your chosen new membership tier to continue as a member.

Every current member will automatically receive account credit equal to one week of their current membership tier. You can use this credit towards future sessions. This is to offset paying twice in the same week if you rejoin straight away.

On launch day, we’ll email you a secure link to set your password and access your migrated account. You won’t need to create another account. There’s nothing you need to do yet.

Thanks for your patience as we make the move.
The ${tenant.venue_name} team`;

  const launch = `Hi {first_name},

The new ${tenant.venue_name} app and booking system is now live.

We’ve created your account using your existing customer details. Use the secure password setup link in this email to set your password, then sign in with this email address. Please don’t create a second account.

All previous memberships have been cancelled and have not transferred to the new system. If you’d like to continue as a member, sign up to your chosen new membership tier after signing in.

If you were a current member at the switchover, account credit equal to one week of your previous tier has been added for future sessions. This offsets overlapping weekly payments if you rejoin immediately.

You can access the app at ${bookingUrl(tenant, "/app")}.

Need help? Contact us at ${tenant.support_email}.
The ${tenant.venue_name} team`;

  return [
    { id: "heads-up", title: "Before launch · Account change notice", subject: `${tenant.venue_name}: important account and membership changes`, text: ahead },
    { id: "launch-day", title: "Launch day · Password setup notice", subject: `${tenant.venue_name}: set your password for the new app`, text: launch },
  ].map((notice) => ({
    ...notice,
    html: notice.text.split("\n\n").map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`).join("\n"),
  }));
}