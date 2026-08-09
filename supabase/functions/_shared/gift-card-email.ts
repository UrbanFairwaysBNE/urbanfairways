// Shared loader for the admin-editable gift card email templates.
// Templates live in `email_templates` (body-only HTML) and are wrapped by the
// global header/footer via renderBrandedEmail, exactly like every other
// customer-facing email.

export interface GiftTemplateResult {
  subject: string | null;
  body: string;
  /** false when the admin has switched the template off */
  active: boolean;
  /** true when a stored template was found */
  found: boolean;
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function replaceTags(html: string, tags: Record<string, string>): string {
  let out = html;
  for (const [tag, value] of Object.entries(tags)) {
    out = out.split(tag).join(value ?? "");
  }
  return out;
}

/** Standard quoted personal-message block used across gift card emails. */
export function personalMessageBlock(message: string | null, senderName: string): string {
  if (!message) return "";
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #5F6F52;">
      <tr>
        <td style="padding:18px 22px; font-family:Manrope, Arial, sans-serif; font-size:15px; line-height:1.6; color:#2F3134; font-style:italic;">
          "${escapeHtml(message)}"
          <div style="margin-top:10px; font-style:normal; font-size:13px; color:#2F3134; opacity:0.7;">— ${escapeHtml(senderName)}</div>
        </td>
      </tr>
    </table>`;
}

export async function loadGiftTemplate(
  supabase: any,
  templateKey: string,
  tags: Record<string, string>,
): Promise<GiftTemplateResult | null> {
  const { data, error } = await supabase
    .from("email_templates")
    .select("subject, html_content, is_active")
    .eq("template_key", templateKey)
    .maybeSingle();

  if (error) {
    console.error(`[gift-card-email] Failed to load template ${templateKey}:`, error.message);
    return null;
  }
  if (!data || !data.html_content?.trim()) return null;

  return {
    subject: data.subject ? replaceTags(data.subject, tags) : null,
    body: replaceTags(data.html_content, tags),
    active: data.is_active !== false,
    found: true,
  };
}
