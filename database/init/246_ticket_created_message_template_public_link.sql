-- Padroniza o template de WhatsApp de ticket criado para usar sempre o link público recebido em {{ticket_link}}.
UPDATE public.message_templates
SET body = E'✅ Seu ticket foi criado com sucesso.\n\nProtocolo: {{ticket_number}}\n\nAcompanhe seu atendimento:\n{{ticket_link}}',
    updated_at = now()
WHERE resource_type = 'tickets'
  AND action = 'created'
  AND is_predefined = true;
