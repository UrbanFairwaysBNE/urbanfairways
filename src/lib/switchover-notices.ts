import { bookingUrl, type TenantSettings } from "@/config/tenant";

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => {
  const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return entities[character] ?? character;
});

/**
 * Branded call-to-action button, matching the style used by
 * `supabase/functions/_shared/email-wrapper.ts` (accent fill, rounded,
 * display font) so notice emails look like every other transactional email.
 */
const ctaButton = (url: string, label: string) => `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
  <tr>
    <td bgcolor="#5F6F52" style="border-radius:12px;">
      <a href="${url}"
         style="display:inline-block; padding:14px 24px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>`;

const paragraphs = (parts: string[]) =>
  parts.map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br />")}</p>`).join("\n");

const steps = (items: string[]) =>
  `<ol style="margin:18px 0 0; padding-left:22px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.7; color:#2F3134;">${items
    .map((item) => `<li style="margin-bottom:6px;">${escapeHtml(item)}</li>`)
    .join("")}</ol>`;

export function getSwitchoverNotices(tenant: TenantSettings) {
  const ahead = `Hi {first_name},

We’re moving ${tenant.venue_name} to our new app and booking system on Tuesday 20 October 2026.

Your customer account will be migrated for you, but ALL existing memberships will be cancelled as part of the switchover. Your current membership will not transfer automatically.

Once the new system is live, you’ll need to sign up to your chosen new membership tier to continue as a member.

Every current member will automatically receive account credit equal to one week of their current membership tier. You can use this credit towards future sessions. This is to offset paying twice in the same week if you rejoin straight away.

On launch day, we’ll email you a secure link to set your password and access your migrated account. You won’t need to create another account. There’s nothing you need to do yet.

Thanks for your patience as we make the move.
The ${tenant.venue_name} team`;

  const forgotUrl = bookingUrl(tenant, "/app?forgot=true");

  const launch = `Hi {first_name},

The new ${tenant.venue_name} app and booking system is now live.

We’ve already created your account using your existing customer details, so please don’t create a second account.

To get started, set your password:
1. Go to ${forgotUrl}
2. Enter this email address and tap "Send Reset Link"
3. Open the email we send you and choose your new password
4. Sign in with this email address and your new password

All previous memberships have been cancelled and have not transferred to the new system. If you’d like to continue as a member, sign up to your chosen new membership tier after signing in.

If you were a current member at the switchover, account credit equal to one week of your previous tier has been added for future sessions. This offsets overlapping weekly payments if you rejoin immediately.

Need help? Contact us at ${tenant.support_email}.
The ${tenant.venue_name} team`;

  // Same copy as `launch`, but the forgot-password address becomes a button
  // instead of a raw link, so customers only have to tap one thing.
  const launchHtml = [
    paragraphs([
      "Hi {first_name},",
      `The new ${tenant.venue_name} app and booking system is now live.`,
      "We’ve already created your account using your existing customer details, so please don’t create a second account.",
      "To get started, set your password using the button below:",
    ]),
    ctaButton(forgotUrl, "Set your password"),
    steps([
      'Enter this email address and tap "Send Reset Link"',
      "Open the email we send you and choose your new password",
      "Sign in with this email address and your new password",
    ]),
    paragraphs([
      "All previous memberships have been cancelled and have not transferred to the new system. If you’d like to continue as a member, sign up to your chosen new membership tier after signing in.",
      "If you were a current member at the switchover, account credit equal to one week of your previous tier has been added for future sessions. This offsets overlapping weekly payments if you rejoin immediately.",
      `Need help? Contact us at ${tenant.support_email}.\nThe ${tenant.venue_name} team`,
    ]),
  ].join("\n");

  return [
    {
      id: "heads-up",
      title: "Before launch · Account change notice",
      subject: `${tenant.venue_name}: important account and membership changes`,
      text: ahead,
      html: paragraphs(ahead.split("\n\n")),
    },
    {
      id: "launch-day",
      title: "Launch day · Set your password notice",
      subject: `${tenant.venue_name}: set your password for the new app`,
      text: launch,
      html: launchHtml,
    },
  ];
}
