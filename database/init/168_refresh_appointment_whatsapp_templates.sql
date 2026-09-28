-- Atualiza textos padrão WhatsApp (convite e lembrete de agenda) — idempotente para ambientes que já tinham 167 aplicado.

UPDATE public.notification_template_system
SET
  body_template = E'Olá, {{nome}}! Tudo certo?\n\nSeu compromisso foi agendado com sucesso. ✅\n\n📌 {{titulo}}\n📅 Data: {{data}}\n🕒 Horário: {{hora}}\n👤 Responsável: {{responsavel}}\n\n{{meet_link}}\n\nAté lá!',
  version = version + 1,
  updated_at = now()
WHERE event_key = 'appointment.invited'
  AND channel = 'whatsapp'
  AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET
  body_template = E'Olá, {{nome}}! Passando para lembrar do seu compromisso. ⏰\n\n📌 {{titulo}}\n🕒 Hoje às {{hora}}\n\n{{meet_link}}\n\nNos vemos em breve!',
  version = version + 1,
  updated_at = now()
WHERE event_key = 'appointment.reminder'
  AND channel = 'whatsapp'
  AND locale = 'pt-BR';
