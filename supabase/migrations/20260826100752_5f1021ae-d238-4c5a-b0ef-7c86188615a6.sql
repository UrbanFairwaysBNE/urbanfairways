ALTER TABLE public.email_templates
  ADD COLUMN IF NOT EXISTS subject_zh text,
  ADD COLUMN IF NOT EXISTS html_content_zh text;

ALTER TABLE public.sms_templates
  ADD COLUMN IF NOT EXISTS message_zh text;