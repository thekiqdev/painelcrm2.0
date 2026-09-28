-- Fase 3.5 — evento do motor para mensagem pós-compromisso.

INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES (
  'appointment.completed',
  'agenda',
  'Resumo pós-compromisso ao cliente (WhatsApp)',
  'whatsapp',
  '["nome","titulo","responsavel","resumo","proximo_followup_data","proximo_followup_hora"]'::jsonb,
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
  'appointment.completed',
  'whatsapp',
  'pt-BR',
  NULL,
  E'Olá {{nome}}! Obrigado pela reunião.\n\nResumo:\n{{resumo}}\n\n{{proximo_followup_data}}\n{{proximo_followup_hora}}',
  1,
  true
)
ON CONFLICT (event_key, channel, locale) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  version = notification_template_system.version + 1,
  is_active = EXCLUDED.is_active,
  updated_at = now();
