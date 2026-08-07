// Shared branded email wrapper used by all customer-facing transactional emails.
// The HTML <header> and <footer> sections are stored in the `email_layout` table
// so they can be edited from the admin panel and reused across every email
// template. Individual template bodies should contain body content ONLY.

import type { TenantConfig } from "./tenant.ts";
import { getTenant, tenantAddress } from "./tenant.ts";

export interface EmailCta {
  text: string;
  url: string;
}

export interface EmailLayout {
  header_html: string;
  footer_html: string;
}

const NEUTRAL_TENANT: TenantConfig = {
  venue_name: "Your Venue",
  legal_entity: "",
  abn: "",
  booking_domain: "example.com",
  hub_domain: "hub.example.com",
  support_phone: "",
  support_email: "info@example.com",
  sender_email: "noreply@example.com",
  admin_alert_email: "admin@example.com",
  address_line: "",
  suburb: "",
  state: "",
  postcode: "",
  timezone: "Australia/Brisbane",
  socials: {},
};

// --- Defaults (used as fallback if the DB lookup fails or when called in
// a context without a Supabase client). Keep in sync with the initial rows
// seeded by the email_layout migration. ---
export function defaultHeaderHtml(tenant: TenantConfig = NEUTRAL_TENANT): string {
  return `<tr>
  <td align="center" style="background-color:#2E3032; padding:22px; border-radius:16px 16px 0 0;">
    <img
      src="https://urbanfairways.lovable.app/__l5e/assets-v1/95842b02-e160-42b4-a144-568773f3de07/uf-email-logo.png"
      width="260"
      alt="${tenant.venue_name}"
      style="display:block; width:260px; max-width:80%; height:auto; border:0;"
    />
  </td>
</tr>`;
}

export function defaultFooterHtml(tenant: TenantConfig = NEUTRAL_TENANT): string {
  const address = tenantAddress(tenant);
  const socials = tenant.socials || {};

  const socialLinks: string[] = [];
  if (socials.instagram) {
    socialLinks.push(
      `<a href="${socials.instagram}" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" /></a>`,
    );
  }
  if (socials.facebook) {
    socialLinks.push(
      `<a href="${socials.facebook}" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" /></a>`,
    );
  }

  const socialsRow = socialLinks.length
    ? `<tr><td align="center" style="padding-bottom:14px;">${socialLinks.join("")}</td></tr>`
    : "";

  const addressRow = address
    ? `<div><a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}" style="color:#FFFFFF; text-decoration:underline;">${address}</a></div>`
    : "";

  const phoneRow = tenant.support_phone
    ? `<div><a href="tel:${tenant.support_phone.replace(/[^+\d]/g, "")}" style="color:#FFFFFF; text-decoration:underline;">${tenant.support_phone}</a></div>`
    : "";

  const domainRow = tenant.booking_domain
    ? `<div><a href="https://${tenant.booking_domain}" style="color:#FFFFFF; text-decoration:underline;">${tenant.booking_domain}</a></div>`
    : "";

  return `<tr>
  <td style="background-color:#2E3032; padding:22px; border-radius:0 0 16px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${socialsRow}
      <tr>
        <td align="center" style="font-family:Manrope, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
          ${addressRow}
          ${phoneRow}
          ${domainRow}
          <div style="margin-top:10px; font-size:12px; opacity:0.75;">© ${tenant.venue_name}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

// Backwards-compatible constants (neutral placeholders — prefer the
// defaultHeaderHtml/defaultFooterHtml functions with a real tenant).
export const DEFAULT_HEADER_HTML = defaultHeaderHtml();
export const DEFAULT_FOOTER_HTML = defaultFooterHtml();

// Sync builder — accepts optional layout override. When no override is
// supplied (or DB lookup wasn't performed) the defaults above are used.
export function buildEmailTemplate(
  heading: string,
  bodyContent: string,
  ctaButton?: EmailCta,
  layout?: Partial<EmailLayout>,
  tenant: TenantConfig = NEUTRAL_TENANT,
): string {
  const header = layout?.header_html || defaultHeaderHtml(tenant);
  const footer = layout?.footer_html || defaultFooterHtml(tenant);

  const buttonHtml = ctaButton
    ? `
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#B5772A" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  `
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${tenant.venue_name} Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
    img { max-width:100% !important; height:auto !important; }
    table { max-width:100% !important; }
    td, th, p, div, li, a { word-break:break-word; overflow-wrap:break-word; }
    @media only screen and (max-width:620px) {
      .uf-shell { width:100% !important; }
      h1 { font-size:26px !important; line-height:1.2 !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F3EF;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" class="uf-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          ${header}
          <tr>
            <td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
              <h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          ${footer}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Fetches the current email layout from the DB, falling back to defaults on
// any error. Accepts any Supabase client that exposes `.from().select()`.
// Substitutes tenant merge values into stored layout HTML so the seeded
// header/footer stay venue-agnostic in the database.
export function applyTenantTokens(html: string, tenant: TenantConfig): string {
  const values: Record<string, string> = {
    venue_name: tenant.venue_name || "",
    legal_entity: tenant.legal_entity || "",
    address: tenantAddress(tenant),
    support_phone: tenant.support_phone || "",
    support_email: tenant.support_email || "",
    booking_domain: tenant.booking_domain || "",
    hub_domain: tenant.hub_domain || "",
  };
  return html.replace(
    /\{\{\s*(venue_name|legal_entity|address|support_phone|support_email|booking_domain|hub_domain)\s*\}\}/g,
    (_m, key: string) => values[key] ?? "",
  );
}

export async function fetchEmailLayout(
  supabase: any,
  tenant: TenantConfig = NEUTRAL_TENANT,
): Promise<EmailLayout> {
  try {
    const { data } = await supabase
      .from("email_layout")
      .select("header_html, footer_html")
      .eq("id", "global")
      .maybeSingle();

    return {
      header_html: data?.header_html
        ? applyTenantTokens(data.header_html, tenant)
        : defaultHeaderHtml(tenant),
      footer_html: data?.footer_html
        ? applyTenantTokens(data.footer_html, tenant)
        : defaultFooterHtml(tenant),
    };
  } catch (_err) {
    return {
      header_html: defaultHeaderHtml(tenant),
      footer_html: defaultFooterHtml(tenant),
    };
  }
}


// Convenience async helper: fetches the layout then renders the template.
// This is the recommended entry point for all send-* edge functions so that
// admin edits to the layout apply everywhere automatically.
export async function renderBrandedEmail(
  supabase: any,
  heading: string,
  bodyContent: string,
  ctaButton?: EmailCta,
  tenant: TenantConfig = NEUTRAL_TENANT,
): Promise<string> {
  const layout = await fetchEmailLayout(supabase, tenant);
  return buildEmailTemplate(heading, bodyContent, ctaButton, layout, tenant);
}
