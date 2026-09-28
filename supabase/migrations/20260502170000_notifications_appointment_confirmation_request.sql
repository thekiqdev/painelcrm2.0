-- Agenda Fase 4.5: solicitação de confirmação de presença via WhatsApp
-- Espelha database/init/177_notifications_appointment_confirmation_request.sql

INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES (
  'appointment.confirmation_request',
  'agenda',
  'Envia uma mensagem ao cliente solicitando confirmação de presença no compromisso.',
  'whatsapp',
  '["nome","titulo","data","hora","responsavel","meet_link","local","confirmation_link"]'::jsonb,
  true
)
ON CONFLICT (event_key) DO UPDATE SET
  module = EXCLUDED.module,
  description = EXCLUDED.description,
  default_channel = EXCLUDED.default_channel,
  merge_fields = EXCLUDED.merge_fields,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO public.notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES (
  'appointment.confirmation_request',
  'whatsapp',
  'pt-BR',
  NULL,
  E'Olá {{nome}}! Tudo bem?\n\nPassando para confirmar seu compromisso:\n\n{{titulo}}\nData: {{data}}\nHorário: {{hora}}\nResponsável: {{responsavel}}\n\n{{meet_link}}\n\nConfirme sua presença aqui:\n{{confirmation_link}}',
  1,
  true
)
ON CONFLICT (event_key, channel, locale) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  version = notification_template_system.version + 1,
  is_active = EXCLUDED.is_active,
  updated_at = now();

