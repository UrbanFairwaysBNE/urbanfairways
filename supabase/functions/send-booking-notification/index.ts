import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";
import { getTenant, tenantHubUrl, tenantBookingUrl, tenantAddress } from "../_shared/tenant.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  booking_id: string;
  notification_type: "confirmation" | "cancellation" | "reschedule";
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-BOOKING-NOTIFICATION] ${step}${detailsStr}`);
};

const completeNotificationLog = async (
  logId: string | null,
  status: "sent" | "failed",
  result: {
    email_sent?: boolean;
    sms_sent?: boolean;
    gate_sms_sent?: boolean;
    error?: string | null;
    response?: Record<string, unknown> | null;
  } = {},
) => {
  if (!logId) return;

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    await supabaseClient.rpc("complete_booking_notification", {
      _log_id: logId,
      _status: status,
      _email_sent: result.email_sent ?? false,
      _sms_sent: result.sms_sent ?? false,
      _gate_sms_sent: result.gate_sms_sent ?? false,
      _last_error: result.error ?? null,
      _last_response: result.response ?? null,
    });
  } catch (e: any) {
    logStep("Failed to update notification log", { error: e.message });
  }
};

// Format phone number for SMS Broadcast (Australian format)
const formatPhoneForSMS = (phone: string | null): string | null => {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Convert to international format without + (614xxxxxxxx)
  if (cleaned.startsWith('0')) {
    cleaned = '61' + cleaned.slice(1);
  } else if (cleaned.startsWith('+61')) {
    cleaned = cleaned.slice(1);
  } else if (!cleaned.startsWith('61') && cleaned.length === 9) {
    // Assume Australian mobile missing leading 0
    cleaned = '61' + cleaned;
  }
  
  // Validate length (should be 11 digits for Australian mobile)
  if (cleaned.length !== 11 || !cleaned.startsWith('614')) {
    logStep("Invalid phone number format", { original: phone, cleaned });
    return null;
  }
  
  return cleaned;
};

/**
 * Build an RFC 5545 calendar invite for a lesson.
 * Brisbane is AEST (UTC+10) year-round, so local times convert by subtracting 10h.
 */
const buildLessonIcs = (opts: {
  uid: string;
  date: string;       // YYYY-MM-DD (Brisbane)
  startTime: string;  // HH:MM (Brisbane)
  endTime: string;    // HH:MM (Brisbane)
  summary: string;
  description: string;
  location: string;
  organiserEmail: string;
  organiserName: string;
}): string => {
  const toUtcStamp = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    const local = new Date(`${opts.date}T00:00:00Z`);
    local.setUTCHours(h - 10, m, 0, 0); // Brisbane -> UTC
    return local.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Urban Fairways//Lesson//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
    `DTSTART:${toUtcStamp(opts.startTime)}`,
    `DTEND:${toUtcStamp(opts.endTime)}`,
    `SUMMARY:${esc(opts.summary)}`,
    `DESCRIPTION:${esc(opts.description)}`,
    `LOCATION:${esc(opts.location)}`,
    `ORGANIZER;CN=${esc(opts.organiserName)}:mailto:${opts.organiserEmail}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
};

// Send SMS via SMS Broadcast API
const sendSMS = async (phone: string, message: string, senderName = "Notification"): Promise<{ success: boolean; response?: string; error?: string }> => {
  const username = Deno.env.get("SMS_BROADCAST_USERNAME");
  const password = Deno.env.get("SMS_BROADCAST_PASSWORD");
  
  if (!username || !password) {
    logStep("SMS Broadcast credentials not configured");
    return { success: false, error: "SMS credentials not configured" };
  }
  
  const formattedPhone = formatPhoneForSMS(phone);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number" };
  }
  
  try {
    const params = new URLSearchParams({
      username,
      password,
      to: formattedPhone,
      from: senderName,
      message: message,
    });
    
    const response = await fetch(`https://api.smsbroadcast.com.au/api-adv.php?${params.toString()}`, {
      method: "GET",
    });
    
    const responseText = await response.text();
    logStep("SMS Broadcast response", { response: responseText });
    
    // Parse response - format is "OK:614xxxxxxxx:reference" or "ERROR:message"
    if (responseText.startsWith("OK:")) {
      return { success: true, response: responseText };
    } else {
      return { success: false, error: responseText };
    }
  } catch (error: any) {
    logStep("SMS send error", { error: error.message });
    return { success: false, error: error.message };
  }
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};


serve(async (req) => {
  const tenant = await getTenant();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let notificationLogId: string | null = null;

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { booking_id, notification_type }: NotificationRequest = await req.json();
    logStep("Request received", { booking_id, notification_type });

    if (!booking_id || !notification_type) {
      throw new Error("Missing booking_id or notification_type");
    }

    if (notification_type === "confirmation") {
      const { data: claim, error: claimError } = await supabaseClient.rpc(
        "claim_booking_notification",
        {
          _booking_id: booking_id,
          _notification_type: notification_type,
        },
      );

      if (claimError) {
        logStep("Notification claim failed", { error: claimError.message });
        throw new Error("Failed to claim booking notification");
      }

      notificationLogId = (claim as any)?.log_id ?? null;
      if (!(claim as any)?.should_send) {
        logStep("Confirmation notification already handled", claim);
        return new Response(
          JSON.stringify({
            success: true,
            email_sent: !!(claim as any)?.email_sent,
            sms_sent: !!(claim as any)?.sms_sent,
            gate_sms_sent: !!(claim as any)?.gate_sms_sent,
            skipped: true,
            reason: (claim as any)?.reason || "already_handled",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      logStep("Confirmation notification claimed", claim);
    }

    // Fetch booking details with bay info
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select(`
        *,
        bays (name, bay_number)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Failed to fetch booking: ${bookingError?.message}`);
    }
    logStep("Booking fetched", { booking_id: booking.id, user_id: booking.user_id });

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", booking.user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`Failed to fetch profile: ${profileError?.message}`);
    }
    logStep("Profile fetched", { email: profile.email, phone: profile.phone });

    // Coach lessons: the session belongs to a client as well as the booking coach
    const isLesson = (booking as any).booking_type === "lesson" && !!(booking as any).client_user_id;
    let lessonClient: any = null;
    if (isLesson) {
      const { data: clientProfile } = await supabaseClient
        .from("profiles")
        .select("first_name, last_name, email, phone")
        .eq("user_id", (booking as any).client_user_id)
        .maybeSingle();
      lessonClient = clientProfile ?? null;
      logStep("Lesson client fetched", { hasClient: !!lessonClient });
    }

    // Determine whether the booking start falls inside a staffed window.
    // Used for the {staffed_status} merge tag in all booking emails/SMS,
    // and to swap in the first-time-unstaffed confirmation template.
    let insideStaffed = true;
    try {
      const bookingDay = new Date(`${booking.booking_date}T00:00:00`).getDay(); // 0=Sun
      const { data: staffed } = await supabaseClient
        .from("staffed_hours")
        .select("start_time, end_time, is_staffed")
        .eq("day_of_week", bookingDay);
      const start = booking.start_time as string; // HH:MM:SS
      insideStaffed = (staffed || []).some(
        (s: any) => s.is_staffed && s.start_time <= start && start < s.end_time,
      );
      logStep("Staffed window check", { bookingDay, start, insideStaffed });
    } catch (e: any) {
      logStep("Staffed detection failed (defaulting to staffed)", { error: e.message });
    }
    const staffedStatus = insideStaffed ? "Staffed hours" : "Unstaffed hours";

    let isFirstTimeUnstaffed = false;
    if (notification_type === "confirmation" && !insideStaffed) {
      try {
        const { count: priorConfirmed } = await supabaseClient
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", booking.user_id)
          .eq("status", "confirmed")
          .neq("id", booking.id);
        isFirstTimeUnstaffed = (priorConfirmed ?? 0) === 0;
        logStep("First-time unstaffed check", { priorConfirmed, isFirstTimeUnstaffed });
      } catch (e: any) {
        logStep("First-time detection failed", { error: e.message });
      }
    }

    // Fetch custom email template.
    // First-time bookings during unstaffed hours use their own dedicated template
    // that admins edit directly in the Notifications settings.
    const templateKey =
      notification_type === "confirmation"
        ? (isFirstTimeUnstaffed ? "booking_confirmation_first_unstaffed" : "booking_confirmation")
        : "booking_cancellation";
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", templateKey)
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { templateKey, hasCustomHtml: !!emailTemplate?.html_content, isActive: emailTemplate?.is_active });
    }


    // Check if template is disabled - skip sending if so
    if (emailTemplate && emailTemplate.is_active === false) {
      logStep("Template is disabled, skipping email notification");
      await completeNotificationLog(notificationLogId, "sent", {
        email_sent: false,
        sms_sent: false,
        gate_sms_sent: false,
        response: { message: `${notification_type} notification skipped - template disabled` },
      });
      return new Response(
        JSON.stringify({ 
          success: true, 
          email_sent: false,
          sms_sent: false,
          message: `${notification_type} notification skipped - template disabled` 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Format booking details
    const bookingDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const shortDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const startTime = booking.start_time.slice(0, 5);
    const endTime = booking.end_time.slice(0, 5);
    const bayNumber = booking.bays?.bay_number || "?";
    const bayName = booking.bays?.name || `Bay ${bayNumber}`;
    
    // Format time for display (12-hour format)
    const formatTime12hr = (time24: string) => {
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };
    const startTime12hr = formatTime12hr(startTime);
    const endTime12hr = formatTime12hr(endTime);
    
    // Check if booking needs boom gate access (5-6am or 5pm onwards)
    const startHour = parseInt(booking.start_time.split(':')[0], 10);
    const needsBoomGate = (startHour >= 5 && startHour < 7) || startHour >= 17;

    // Resolve the door code for this booking.
    // Per-booking mode issues a unique temporary code; everything else falls
    // back to the shared fixed code.
    let doorCode = "7675#";
    const { data: doorSettings } = await supabaseClient
      .from("door_access_settings")
      .select("mode, fixed_code, append_hash")
      .eq("id", "global")
      .maybeSingle();

    if (doorSettings) {
      doorCode = (doorSettings as any).fixed_code || doorCode;
    } else {
      const { data: sysSettings } = await supabaseClient
        .from("system_settings")
        .select("door_code")
        .eq("id", "global")
        .maybeSingle();
      doorCode = (sysSettings as any)?.door_code || doorCode;
    }

    const doorMode = (doorSettings as any)?.mode;
    const perBookingMode = doorMode === "per_booking" || doorMode === "unstaffed_only";

    if (perBookingMode && notification_type !== "cancellation") {
      try {
        await supabaseClient.functions.invoke("door-code-manager", {
          body: { action: "issue", booking_id: booking.id },
        });
        const { data: issued } = await supabaseClient
          .from("door_codes")
          .select("code")
          .eq("booking_id", booking.id)
          .in("status", ["pending", "active"])
          .maybeSingle();
        if ((issued as any)?.code) {
          doorCode = (doorSettings as any)?.append_hash
            ? `${(issued as any).code}#`
            : (issued as any).code;
        }
      } catch (e) {
        console.error("[NOTIFY] Door code issue failed, using fallback:", e);
      }
    } else if (doorMode === "daily" && notification_type !== "cancellation") {
      // Daily rotating code — resolve the code for THIS booking's door-day, not
      // today's. Door days run 04:00 → 04:00 Brisbane, so a session starting
      // before 4am belongs to the previous day. Codes are pre-generated ~4
      // months ahead, and daily_get creates the row on demand if it's beyond.
      try {
        const startMs = Date.parse(`${booking.booking_date}T${booking.start_time}+10:00`);
        const doorDay = new Date(startMs + 10 * 3600 * 1000 - 4 * 3600 * 1000)
          .toISOString()
          .slice(0, 10);
        const { data: daily } = await supabaseClient.functions.invoke("door-code-manager", {
          body: { action: "daily_get", day: doorDay },
        });
        if ((daily as any)?.code) {
          doorCode = (doorSettings as any)?.append_hash
            ? `${(daily as any).code}#`
            : (daily as any).code;
        }
      } catch (e) {
        console.error("[NOTIFY] Daily door code lookup failed, using fallback:", e);
      }
    }



    // SMS-specific short date / 24h times (used by cancellation template)
    const formattedSmsDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Template replacement tags (shared by email + SMS)
    const templateTags: Record<string, string> = {
      '{first_name}': profile.first_name || '',
      '{last_name}': profile.last_name || '',
      '{email}': profile.email || '',
      '{booking_date}': bookingDate,
      '{booking_time}': startTime12hr,
      '{end_time}': endTime12hr,
      '{duration}': booking.duration_hours.toString(),
      '{bay_number}': bayNumber.toString(),
      '{bay_name}': bayName,
      '{player_count}': booking.player_count.toString(),
      '{total_price}': `$${booking.total_price.toFixed(2)}`,
      '{door_code}': doorCode,
      '{short_date}': formattedSmsDate,
      '{start_time_24}': startTime,
      '{end_time_24}': endTime,
      '{staffed_status}': staffedStatus,
      '{refund_amount}': '', // Will be populated if refund occurred
    };

    // Helper to render an SMS template from the sms_templates table.
    // Returns null when the template is missing or disabled (skip send).
    const renderSmsTemplate = async (templateKey: string): Promise<string | null> => {
      const { data: tpl } = await supabaseClient
        .from("sms_templates")
        .select("message, is_active")
        .eq("template_key", templateKey)
        .maybeSingle();
      if (!tpl || !(tpl as any).is_active || !(tpl as any).message) return null;
      let out = (tpl as any).message as string;
      for (const [tag, value] of Object.entries(templateTags)) {
        out = out.split(tag).join(value);
      }
      return out;
    };

    // Email content based on notification type
    let subject: string;
    let htmlContent: string;
    let smsMessage: string;




    if (notification_type === "confirmation" || notification_type === "reschedule") {
      // Use custom subject if available
      const isReschedule = notification_type === "reschedule";
      subject = isReschedule 
        ? `Booking Rescheduled - ${tenant.venue_name}`
        : (emailTemplate?.subject || `Booking Confirmed - ${tenant.venue_name}`);
      
      // Main booking SMS — pulled from editable sms_templates table
      const smsKey = isReschedule
        ? "booking_reschedule"
        : (isFirstTimeUnstaffed ? "booking_confirmation_first_unstaffed" : "booking_confirmation");

      smsMessage = (await renderSmsTemplate(smsKey)) ?? "";
      const headingText = isReschedule ? "Booking Rescheduled!" : "Booking Confirmed!";

      // Check if custom template exists (only for confirmation, not reschedule)
      if (!isReschedule && emailTemplate?.html_content) {
        const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
        htmlContent = await renderBrandedEmail(supabaseClient, headingText, bodyContent, {
          text: "View My Bookings",
          url: tenantHubUrl(tenant, "/my-bookings")
        });
        logStep("Using custom email template with wrapper", { templateKey });

      } else {
        const introText = isReschedule 
          ? `Hi ${profile.first_name}, your golf simulator booking has been successfully rescheduled!`
          : `Hi ${profile.first_name}, your golf simulator booking has been confirmed!`;
        
        const bodyContent = `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                ${introText}
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #5F6F52;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134;">
                    <p style="margin:5px 0;"><strong>Date:</strong> ${bookingDate}</p>
                    <p style="margin:5px 0;"><strong>Time:</strong> ${startTime12hr} - ${endTime12hr}</p>
                    <p style="margin:5px 0;"><strong>Duration:</strong> ${booking.duration_hours} hour${booking.duration_hours > 1 ? "s" : ""}</p>
                    <p style="margin:5px 0;"><strong>Bay:</strong> ${bayName}</p>
                    <p style="margin:5px 0;"><strong>Status:</strong> ${staffedStatus}</p>
                    <p style="margin:5px 0;"><strong>Players:</strong> ${booking.player_count}</p>
                    <p style="margin:5px 0;"><strong>Total:</strong> $${booking.total_price.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#2F3134; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#F5F3EF; text-align:center;">
                    <p style="margin:0 0 10px 0;"><strong>Door Access Code:</strong> ${doorCode}</p>
                    ${needsBoomGate ? `
                    <p style="margin:0; font-size:14px;">
                      <strong>IMPORTANT:</strong> You will require Boom gate access for your booking time.<br/>
                      <a href="${tenantBookingUrl(tenant, "/gate-access")}" style="color:#5F6F52;">Request gate access here</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>


              
              <p style="margin:18px 0 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                We look forward to seeing you at ${tenant.venue_name}!
              </p>
        `;
        
        htmlContent = await renderBrandedEmail(supabaseClient, headingText, bodyContent, {
          text: "View My Bookings",
          url: tenantHubUrl(tenant, "/my-bookings")
        });
      }
    } else if (notification_type === "cancellation") {
      // Cancellation
      subject = emailTemplate?.subject || `Booking Cancelled - ${tenant.venue_name}`;
      smsMessage = (await renderSmsTemplate("booking_cancellation")) ?? "";
      
      let bodyContent: string;
      if (emailTemplate?.html_content) {
        bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
        logStep("Using custom email template with wrapper");
      } else {
        bodyContent = `
              <p style="margin:0 0 18px; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                Hi ${profile.first_name}, your booking has been cancelled.
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #666666;">
                <tr>
                  <td style="padding:20px; font-family:Manrope, Arial, sans-serif; font-size:15px; color:#2F3134;">
                    <p style="margin:5px 0;"><strong>Date:</strong> ${bookingDate}</p>
                    <p style="margin:5px 0;"><strong>Time:</strong> ${startTime12hr} - ${endTime12hr}</p>
                    <p style="margin:5px 0;"><strong>Bay:</strong> ${bayName}</p>
                    <p style="margin:5px 0;"><strong>Status:</strong> ${staffedStatus}</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                If you didn't request this cancellation or need assistance, please contact us.
              </p>
              
              <p style="margin:0; font-family:Manrope, Arial, sans-serif; font-size:16px; line-height:1.6; color:#2F3134; text-align:center;">
                We hope to see you again soon at ${tenant.venue_name}!
              </p>
        `;
      }
      htmlContent = await renderBrandedEmail(supabaseClient, "Booking Cancelled", bodyContent, {
        text: "Book Again",
        url: tenantBookingUrl(tenant, "/booking")
      });
    } else {
      throw new Error(`Unknown notification type: ${notification_type}`);
    }

    // Apply tag replacement to subject if custom
    if (emailTemplate?.subject) {
      subject = replaceTemplateTags(subject, templateTags);
    }

    // Lesson calendar invite (attached to both coach and client emails)
    const coachName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Your coach";
    const clientFullName = lessonClient
      ? `${lessonClient.first_name ?? ""} ${lessonClient.last_name ?? ""}`.trim() || "your client"
      : "";
    let lessonIcs: string | null = null;
    if (isLesson && notification_type !== "cancellation") {
      lessonIcs = buildLessonIcs({
        uid: `lesson-${booking.id}@${tenant.venue_name.replace(/\s+/g, "").toLowerCase()}`,
        date: booking.booking_date,
        startTime,
        endTime,
        summary: `Golf lesson with ${coachName} — ${tenant.venue_name}`,
        description: `${bayName} · ${startTime12hr} - ${endTime12hr}`,
        location: tenantAddress(tenant) || tenant.venue_name,
        organiserEmail: tenant.sender_email,
        organiserName: tenant.venue_name,
      });
    }

    const icsAttachment = lessonIcs
      ? [{ filename: "lesson.ics", content: btoa(lessonIcs) }]
      : undefined;

    // Send email
    const emailResponse = await resend.emails.send({
      from: `${tenant.venue_name} <${tenant.sender_email}>`,
      to: [profile.email],
      subject: isLesson ? `${subject} (lesson with ${clientFullName})` : subject,
      html: htmlContent,
      ...(icsAttachment ? { attachments: icsAttachment } : {}),
    });

    logStep("Email sent successfully", { emailResponse });

    // Send admin alert if this customer has the booking flag enabled
    if (notification_type === "confirmation" && (profile as any).booking_flag_enabled === true) {
      try {
        logStep("Flagged customer booked - sending admin alert", { email: profile.email });

        const { data: alertTpl } = await supabaseClient
          .from("email_templates")
          .select("subject, html_content, is_active")
          .eq("template_key", "watched_customer_alert")
          .maybeSingle();

        if (alertTpl && (alertTpl as any).is_active === false) {
          logStep("Watched customer alert template disabled, skipping");
        } else {
          const alertTagsExt = {
            ...templateTags,
            '{phone}': profile.phone || 'Not provided',
            '{membership_tier}': profile.membership_tier || 'Casual',
          };
          const alertSubject = replaceTemplateTags(
            (alertTpl as any)?.subject || `⚠️ Watched Customer Booking: {first_name} {last_name}`,
            alertTagsExt,
          );
          const alertBody = replaceTemplateTags(
            (alertTpl as any)?.html_content ||
              `<p style="font-family:Manrope, Arial, sans-serif; color:#2F3134; text-align:center;"><strong>{first_name} {last_name}</strong> ({email}) has just made a new booking.</p>`,
            alertTagsExt,
          );

          await resend.emails.send({
            from: `${tenant.venue_name} <${tenant.sender_email}>`,
            to: [tenant.admin_alert_email],
            subject: alertSubject,
            html: await renderBrandedEmail(supabaseClient, "Watched Customer Alert", alertBody),
          });
          logStep("Admin alert sent for flagged customer");
        }
      } catch (alertError: any) {
        logStep("Failed to send admin alert (non-blocking)", { error: alertError.message });
      }
    }


    // ── Lesson: notify the client as well as the coach ──
    if (isLesson && lessonClient?.email) {
      try {
        const heading =
          notification_type === "cancellation"
            ? "Lesson Cancelled"
            : notification_type === "reschedule"
              ? "Lesson Rescheduled"
              : "Lesson Confirmed";

        const clientBody = `
          <p style="margin:0 0 16px 0;">Hi ${lessonClient.first_name || "there"},</p>
          <p style="margin:0 0 16px 0;">
            ${
              notification_type === "cancellation"
                ? `Your golf lesson with ${coachName} has been cancelled.`
                : `Your golf lesson with ${coachName} is ${notification_type === "reschedule" ? "now" : "booked"} for:`
            }
          </p>
          <p style="margin:0 0 16px 0; font-size:16px;">
            <strong>${bookingDate}</strong><br />
            ${startTime12hr} – ${endTime12hr}<br />
            ${bayName}
          </p>
          ${
            notification_type === "cancellation"
              ? ""
              : `<p style="margin:0 0 16px 0;">Your coach has booked and paid for the bay — just arrive a few minutes early.</p>`
          }
        `;

        const clientHtml = await renderBrandedEmail(supabaseClient, heading, clientBody, {
          text: "View at " + tenant.venue_name,
          url: tenantBookingUrl(tenant, "/my-bookings"),
        });

        await resend.emails.send({
          from: `${tenant.venue_name} <${tenant.sender_email}>`,
          to: [lessonClient.email],
          subject: `${heading} - ${shortDate} ${startTime12hr}`,
          html: clientHtml,
          ...(icsAttachment ? { attachments: icsAttachment } : {}),
        });
        logStep("Lesson client email sent", { to: lessonClient.email });

        if (lessonClient.phone) {
          const clientSms =
            notification_type === "cancellation"
              ? `${tenant.venue_name}: your lesson with ${coachName} on ${shortDate} at ${startTime12hr} has been cancelled.`
              : `${tenant.venue_name}: lesson with ${coachName} ${shortDate} ${startTime12hr}-${endTime12hr}, ${bayName}. See you there!`;
          const clientSmsResult = await sendSMS(lessonClient.phone, clientSms, tenant.venue_name);
          logStep("Lesson client SMS result", clientSmsResult);
        }
      } catch (lessonErr: any) {
        logStep("Lesson client notification failed (non-blocking)", { error: lessonErr.message });
      }
    }

    // Send SMS for confirmations and reschedules (not cancellations)
    let smsResult: { success: boolean; response?: string; error?: string } = { success: false, error: "SMS not sent" };
    let gateSmsResult: { success: boolean; response?: string; error?: string } | null = null;
    
    if ((notification_type === "confirmation" || notification_type === "reschedule") && profile.phone) {
      // Send main booking SMS (skip silently if template was disabled in admin)
      if (smsMessage && smsMessage.trim().length > 0) {
        smsResult = await sendSMS(profile.phone, smsMessage, tenant.venue_name);
        logStep("SMS send result", smsResult);
      } else {
        logStep("SMS template disabled or empty, skipping main SMS");
        smsResult = { success: false, error: "SMS template disabled" };
      }

      // Send second SMS for boom gate access if needed (only at dark hours)
      if (needsBoomGate && smsResult.success) {
        const gateMessage = await renderSmsTemplate("boom_gate_access");
        if (gateMessage && gateMessage.trim().length > 0) {
          gateSmsResult = await sendSMS(profile.phone, gateMessage, tenant.venue_name);
          logStep("Gate SMS send result", gateSmsResult);
        } else {
          logStep("Boom gate SMS template disabled, skipping");
        }
      }

    } else if (notification_type === "cancellation" && profile.phone && smsMessage && smsMessage.trim().length > 0) {
      smsResult = await sendSMS(profile.phone, smsMessage, tenant.venue_name);
      logStep("Cancellation SMS send result", smsResult);
    } else if (notification_type === "cancellation") {
      logStep("Cancellation SMS skipped (template disabled or no phone)");
    } else {
      logStep("No phone number, skipping SMS");
    }

    const responsePayload = { 
        success: true, 
        email_sent: true,
        sms_sent: smsResult.success,
        sms_error: smsResult.error || null,
        gate_sms_sent: gateSmsResult?.success || false,
        gate_sms_error: gateSmsResult?.error || null,
        message: `${notification_type} notification sent successfully` 
      };

    await completeNotificationLog(notificationLogId, "sent", {
      email_sent: true,
      sms_sent: smsResult.success,
      gate_sms_sent: gateSmsResult?.success || false,
      response: responsePayload,
    });

    return new Response(
      JSON.stringify(responsePayload),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    await completeNotificationLog(notificationLogId, "failed", {
      error: error.message,
      response: { success: false, error: error.message },
    });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
