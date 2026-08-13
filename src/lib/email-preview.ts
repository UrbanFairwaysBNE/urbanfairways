import { supabase } from "@/integrations/supabase/client";
import { fetchTenantSettings, TENANT_DEFAULTS, type TenantSettings } from "@/config/tenant";

/**
 * Client-side mirror of `supabase/functions/_shared/email-wrapper.ts`.
 *
 * Template rows in `email_templates` store BODY CONTENT ONLY — the branded
 * header, footer and shell are added at send time. Previews in the admin panel
 * must apply the same wrapper, otherwise a saved template looks like plain
 * unstyled HTML (browser default serif) even though the delivered email is
 * fully branded.
 */

const tenantAddress = (t: TenantSettings) =>
  [t.address_line, t.suburb, t.state, t.postcode].filter(Boolean).join(", ");

export function applyTenantTokens(html: string, tenant: TenantSettings): string {
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

export interface EmailLayoutHtml {
  header_html: string;
  footer_html: string;
}

export function buildPreviewEmail(
  heading: string,
  bodyContent: string,
  layout: EmailLayoutHtml,
  tenant: TenantSettings,
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Manrope:wght@400;600&display=swap");
    img { max-width:100% !important; height:auto !important; }
    table { max-width:100% !important; }
    td, th, p, div, li, a { word-break:break-word; overflow-wrap:break-word; font-family:Manrope, Arial, sans-serif; }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#F5F3EF;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#F5F3EF;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          ${layout.header_html}
          <tr>
            <td style="background-color:#F5F3EF; padding:26px 22px; border-left:1px solid rgba(47,49,52,0.12); border-right:1px solid rgba(47,49,52,0.12);">
              ${
                heading
                  ? `<h1 style="margin:0 0 14px; font-family:Archivo, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#2F3134; text-align:center;">${heading}</h1>`
                  : ""
              }
              ${bodyContent}
            </td>
          </tr>
          ${layout.footer_html}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Fetches the saved global header/footer with tenant tokens substituted. */
export async function fetchPreviewLayout(): Promise<{ layout: EmailLayoutHtml; tenant: TenantSettings }> {
  const [tenantResult, layoutResult] = await Promise.all([
    fetchTenantSettings().catch(() => TENANT_DEFAULTS),
    supabase.from("email_layout").select("header_html, footer_html").eq("id", "global").maybeSingle(),
  ]);

  const tenant = tenantResult || TENANT_DEFAULTS;
  const row = layoutResult.data;

  return {
    tenant,
    layout: {
      header_html: applyTenantTokens(row?.header_html || "", tenant),
      footer_html: applyTenantTokens(row?.footer_html || "", tenant),
    },
  };
}

/** Convenience: wrap a stored template body in the live branded shell. */
export async function renderTemplatePreview(heading: string, bodyContent: string): Promise<string> {
  const { layout, tenant } = await fetchPreviewLayout();
  return buildPreviewEmail(heading, bodyContent, layout, tenant);
}
