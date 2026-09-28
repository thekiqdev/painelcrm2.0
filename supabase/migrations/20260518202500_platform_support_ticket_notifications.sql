-- Eventos e templates do suporte da plataforma para notificar o admin do tenant.
INSERT INTO public.platform_notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  (
    'platform_ticket_created',
    'platform_support',
    'Ticket de suporte da plataforma criado pelo tenant',
    'whatsapp',
    '["platform.name","tenant.name","tenant.admin_name","tenant.admin_email","tenant.admin_whatsapp","ticket.protocol","ticket.subject","ticket.status","ticket.link","ticket.message_preview"]'::jsonb,
    true
  ),
  (
    'platform_ticket_reply',
    'platform_support',
    'Resposta pública do suporte da plataforma para o tenant',
    'whatsapp',
    '["platform.name","tenant.name","tenant.admin_name","tenant.admin_email","tenant.admin_whatsapp","ticket.protocol","ticket.subject","ticket.status","ticket.link","ticket.message_preview"]'::jsonb,
    true
  ),
  (
    'platform_ticket_status_changed',
    'platform_support',
    'Mudança importante de status em ticket de suporte da plataforma',
    'whatsapp',
    '["platform.name","tenant.name","tenant.admin_name","tenant.admin_email","tenant.admin_whatsapp","ticket.protocol","ticket.subject","ticket.status","ticket.previous_status","ticket.link","ticket.message_preview"]'::jsonb,
    true
  )
ON CONFLICT (event_key) DO UPDATE
SET module = EXCLUDED.module,
    description = EXCLUDED.description,
    default_channel = EXCLUDED.default_channel,
    merge_fields = EXCLUDED.merge_fields,
    is_active = true,
    updated_at = now();

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  (
    'platform_ticket_created',
    'whatsapp',
    'pt-BR',
    NULL,
    E'✅ Seu ticket foi recebido com sucesso.\n\nProtocolo: {{ticket.protocol}}\nAssunto: {{ticket.subject}}\nStatus: {{ticket.status}}\n\nAcompanhe:\n{{ticket.link}}',
    1,
    true
  ),
  (
    'platform_ticket_reply',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Nova resposta no ticket {{ticket.protocol}}.\n\nMensagem:\n"{{ticket.message_preview}}"\n\nAcompanhe:\n{{ticket.link}}',
    1,
    true
  ),
  (
    'platform_ticket_status_changed',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Atualização no ticket {{ticket.protocol}}.\n\nStatus: {{ticket.status}}\nAssunto: {{ticket.subject}}\n\nAcompanhe:\n{{ticket.link}}',
    1,
    true
  ),
  (
    'platform_ticket_created',
    'email',
    'pt-BR',
    'Ticket recebido - {{ticket.protocol}}',
    E'<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px"><div style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#ffffff"><p style="margin:0 0 8px;color:#6b7280;font-size:13px">{{platform.name}}</p><h1 style="margin:0 0 16px;font-size:22px;color:#111827">Seu ticket foi recebido</h1><p>Olá, {{tenant.admin_name}}.</p><p>Recebemos seu chamado de suporte da plataforma.</p><div style="background:#f9fafb;border-radius:12px;padding:16px;margin:18px 0"><p style="margin:0 0 6px"><strong>Protocolo:</strong> {{ticket.protocol}}</p><p style="margin:0 0 6px"><strong>Assunto:</strong> {{ticket.subject}}</p><p style="margin:0"><strong>Status:</strong> {{ticket.status}}</p></div><p><a href="{{ticket.link}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:600">Acessar ticket</a></p><p style="color:#6b7280;font-size:13px;margin-top:20px">Você também pode acompanhar este atendimento pelo painel.</p></div></div>',
    1,
    true
  ),
  (
    'platform_ticket_reply',
    'email',
    'pt-BR',
    'Nova resposta no ticket {{ticket.protocol}}',
    E'<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px"><div style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#ffffff"><p style="margin:0 0 8px;color:#6b7280;font-size:13px">{{platform.name}}</p><h1 style="margin:0 0 16px;font-size:22px;color:#111827">Nova resposta do suporte</h1><p>Olá, {{tenant.admin_name}}.</p><p>Há uma nova resposta pública no seu ticket.</p><div style="background:#f9fafb;border-radius:12px;padding:16px;margin:18px 0"><p style="margin:0 0 6px"><strong>Protocolo:</strong> {{ticket.protocol}}</p><p style="margin:0 0 6px"><strong>Assunto:</strong> {{ticket.subject}}</p><p style="margin:0"><strong>Mensagem:</strong> {{ticket.message_preview}}</p></div><p><a href="{{ticket.link}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:600">Ver resposta</a></p></div></div>',
    1,
    true
  ),
  (
    'platform_ticket_status_changed',
    'email',
    'pt-BR',
    'Status atualizado - {{ticket.protocol}}',
    E'<div style="font-family:Inter,Arial,sans-serif;line-height:1.5;color:#111827;max-width:640px;margin:0 auto;padding:24px"><div style="border:1px solid #e5e7eb;border-radius:16px;padding:24px;background:#ffffff"><p style="margin:0 0 8px;color:#6b7280;font-size:13px">{{platform.name}}</p><h1 style="margin:0 0 16px;font-size:22px;color:#111827">Status do ticket atualizado</h1><p>Olá, {{tenant.admin_name}}.</p><div style="background:#f9fafb;border-radius:12px;padding:16px;margin:18px 0"><p style="margin:0 0 6px"><strong>Protocolo:</strong> {{ticket.protocol}}</p><p style="margin:0 0 6px"><strong>Assunto:</strong> {{ticket.subject}}</p><p style="margin:0"><strong>Novo status:</strong> {{ticket.status}}</p></div><p><a href="{{ticket.link}}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:10px;padding:12px 18px;font-weight:600">Acessar ticket</a></p></div></div>',
    1,
    true
  )
ON CONFLICT (event_key, channel, locale) DO UPDATE
SET subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    version = platform_notification_template_system.version + 1,
    is_active = true,
    updated_at = now();
