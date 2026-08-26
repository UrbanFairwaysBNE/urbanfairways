// Recipient-language helpers for notifications.
//
// Rule: English is the safe default. A recipient only ever receives Chinese
// content when their profile explicitly says `preferred_language = 'zh'` AND a
// non-empty Chinese variant exists on the template. Anything else falls back to
// the English column, so an English-defaulted customer can never receive
// Chinese copy.

export type NotifyLanguage = "en" | "zh";

export function normaliseLanguage(value: unknown): NotifyLanguage {
  return value === "zh" ? "zh" : "en";
}

/** Reads the recipient's saved language preference. Defaults to English. */
export async function getRecipientLanguage(
  supabase: { from: (t: string) => any },
  userId: string | null | undefined,
): Promise<NotifyLanguage> {
  if (!userId) return "en";
  try {
    const { data } = await supabase
      .from("profiles")
      .select("preferred_language")
      .eq("user_id", userId)
      .maybeSingle();
    return normaliseLanguage(data?.preferred_language);
  } catch {
    return "en";
  }
}

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

/**
 * Returns an email template row with subject/html_content swapped for their
 * Chinese variants when the recipient is Chinese and the variants exist.
 */
export function localiseEmailTemplate<T extends Record<string, any> | null | undefined>(
  template: T,
  lang: NotifyLanguage,
): T {
  if (!template || lang !== "zh") return template;
  return {
    ...template,
    subject: nonEmpty(template.subject_zh) ? template.subject_zh : template.subject,
    html_content: nonEmpty(template.html_content_zh)
      ? template.html_content_zh
      : template.html_content,
  } as T;
}

/** Picks the SMS body for the recipient's language, falling back to English. */
export function localiseSmsMessage(
  template: Record<string, any> | null | undefined,
  lang: NotifyLanguage,
): string | null {
  if (!template) return null;
  if (lang === "zh" && nonEmpty(template.message_zh)) return template.message_zh as string;
  return nonEmpty(template.message) ? (template.message as string) : null;
}
