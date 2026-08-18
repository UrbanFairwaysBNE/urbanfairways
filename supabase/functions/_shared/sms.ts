// Shared SMS sender.
//
// Supports two providers, auto-detected from project secrets:
//   1. Sinch SMS API (preferred — SMS Broadcast accounts are migrating to Sinch)
//      SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, optional SINCH_REGION (default "au"),
//      optional SINCH_FROM (sender ID / number override)
//   2. Legacy SMS Broadcast API
//      SMS_BROADCAST_USERNAME, SMS_BROADCAST_PASSWORD
//
// Australian mobile numbers only (614xxxxxxxx).

export type SmsResult = {
  success: boolean;
  response?: string;
  error?: string;
  phone?: string | null;
  provider?: "sinch" | "sms_broadcast" | null;
};

const log = (s: string, d?: unknown) =>
  console.log(`[SMS] ${s}${d !== undefined ? " " + JSON.stringify(d) : ""}`);

/** Normalise to international format without a leading + (614xxxxxxxx). */
export const formatPhoneForSMS = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  let c = String(phone).replace(/\D/g, "");
  if (c.startsWith("0")) c = "61" + c.slice(1);
  else if (!c.startsWith("61") && c.length === 9) c = "61" + c;
  if (c.length !== 11 || !c.startsWith("614")) {
    log("Invalid phone number format", { original: phone, cleaned: c });
    return null;
  }
  return c;
};

export const smsProvider = (): "sinch" | "sms_broadcast" | null => {
  if (Deno.env.get("SINCH_SERVICE_PLAN_ID") && Deno.env.get("SINCH_API_TOKEN")) return "sinch";
  if (Deno.env.get("SMS_BROADCAST_USERNAME") && Deno.env.get("SMS_BROADCAST_PASSWORD")) {
    return "sms_broadcast";
  }
  return null;
};

/**
 * Alphanumeric sender IDs are limited to 11 characters (carrier rule, enforced by
 * both SMS Broadcast and Sinch). Override with the SMS_SENDER_ID secret; otherwise
 * strip spaces/punctuation from the venue name and truncate.
 */
export const normaliseSenderId = (name: string): string => {
  const override = Deno.env.get("SMS_SENDER_ID");
  const raw = (override || name || "Notify").replace(/[^A-Za-z0-9]/g, "");
  return (raw || "Notify").slice(0, 11);
};

const sendViaSinch = async (to: string, message: string, from: string): Promise<SmsResult> => {
  const servicePlanId = Deno.env.get("SINCH_SERVICE_PLAN_ID")!;
  const token = Deno.env.get("SINCH_API_TOKEN")!;
  const region = (Deno.env.get("SINCH_REGION") || "au").toLowerCase();
  const sender = Deno.env.get("SINCH_FROM") || from;


  const url = `https://${region}.sms.api.sinch.com/xms/v1/${servicePlanId}/batches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: sender, to: [to], body: message }),
  });

  const text = await res.text();
  if (!res.ok) {
    log(`Sinch request failed [${res.status}]`, text);
    return { success: false, error: `[${res.status}] ${text}`, phone: to, provider: "sinch" };
  }
  log("Sinch accepted batch", text.slice(0, 300));
  return { success: true, response: text, phone: to, provider: "sinch" };
};

const sendViaSmsBroadcast = async (to: string, message: string, _from: string): Promise<SmsResult> => {
  const params = new URLSearchParams({
    username: Deno.env.get("SMS_BROADCAST_USERNAME")!,
    password: Deno.env.get("SMS_BROADCAST_PASSWORD")!,
    to,
    message,
  });

  // SMS Broadcast can accept an API request and later reject an unapproved
  // alphanumeric source address at carrier delivery. Only send `from` when a
  // dedicated numeric source/virtual mobile number has been configured;
  // otherwise let SMS Broadcast select its supported shared source.
  const dedicatedSource = Deno.env.get("SMS_BROADCAST_FROM")?.replace(/\D/g, "");
  if (dedicatedSource) params.set("from", dedicatedSource);

  const res = await fetch(`https://api.smsbroadcast.com.au/api-adv.php?${params.toString()}`);
  const text = await res.text();
  log("SMS Broadcast response", text);
  return text.startsWith("OK:")
    ? { success: true, response: text, phone: to, provider: "sms_broadcast" }
    : { success: false, error: text, phone: to, provider: "sms_broadcast" };
};

export const sendSMS = async (
  phone: string | null | undefined,
  message: string,
  senderName = "Notification",
): Promise<SmsResult> => {
  const provider = smsProvider();
  if (!provider) {
    log("SMS credentials not configured");
    return { success: false, error: "SMS credentials not configured", provider: null };
  }

  const to = formatPhoneForSMS(phone);
  if (!to) return { success: false, error: "Invalid phone number", provider };

  const sender = normaliseSenderId(senderName);

  try {
    return provider === "sinch"
      ? await sendViaSinch(to, message, sender)
      : await sendViaSmsBroadcast(to, message, sender);

  } catch (e) {
    const err = (e as Error).message;
    log("SMS send error", { error: err });
    return { success: false, error: err, phone: to, provider };
  }
};
