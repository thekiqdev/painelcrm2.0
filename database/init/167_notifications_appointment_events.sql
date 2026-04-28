-- Agenda Fase 3.3 — eventos do motor de notificações (convite e lembrete WhatsApp ao cliente)

INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  (
    'appointment.invited',
    'agenda',
    'Convite de compromisso ao cliente (WhatsApp)',
    'whatsapp',
    '["nome","titulo","data","hora","responsavel","meet_link"]'::jsonb,
    true
  ),
  (
    'appointment.reminder',
    'agenda',
    'Lembrete de compromisso ao cliente (WhatsApp)',
    'whatsapp',
    '["nome","titulo","hora","meet_link"]'::jsonb,
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
VALUES
  (
    'appointment.invited',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Olá, {{nome}}! Tudo certo?\n\nSeu compromisso foi agendado com sucesso. ✅\n\n📌 {{titulo}}\n📅 Data: {{data}}\n🕒 Horário: {{hora}}\n👤 Responsável: {{responsavel}}\n\n{{meet_link}}\n\nAté lá!',
    1,
    true
  ),
  (
    'appointment.reminder',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Olá, {{nome}}! Passando para lembrar do seu compromisso. ⏰\n\n📌 {{titulo}}\n🕒 Hoje às {{hora}}\n\n{{meet_link}}\n\nNos vemos em breve!',
    1,
    true
  )
ON CONFLICT (event_key, channel, locale) DO UPDATE SET
  body_template = EXCLUDED.body_template,
  version = notification_template_system.version + 1,
  is_active = EXCLUDED.is_active,
  updated_at = now();
