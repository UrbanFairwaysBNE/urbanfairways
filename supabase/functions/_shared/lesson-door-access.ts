import type { NotifyLanguage } from "./i18n.ts";

/** Access is required for active lessons even when an edited template omits its tag. */
export function withLessonDoorAccess(
  content: string,
  doorCode: string,
  channel: "email" | "sms",
  notificationType: string,
  language: NotifyLanguage = "en",
): string {
  if (notificationType === "cancellation" || !content.trim() || !doorCode.trim()) return content;
  if (content.includes(doorCode)) return content;
  const label = language === "zh" ? "门禁密码" : "Door access code";
  return channel === "sms"
    ? `${content.trim()} ${label}: ${doorCode}`
    : `${content}<p><strong>${label}:</strong> ${doorCode}</p>`;
}