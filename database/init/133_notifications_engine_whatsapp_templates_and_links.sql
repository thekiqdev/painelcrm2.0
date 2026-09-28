-- Revisão MVP WhatsApp: merge fields (links), templates multilinha mais claros.
-- Idempotente: atualiza catálogo + templates sistema pt-BR/WhatsApp.

-- Catálogo: novos merge fields para links
UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","proposal.title","proposal.total","proposal.public_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'proposal.sent';

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","proposal.title"]'::jsonb,
    updated_at = now()
WHERE event_key IN ('proposal.accepted', 'proposal.rejected');

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","contract.title","contract.sign_link","contract.public_view_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'contract.sent';

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","contract.title","contract.public_view_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'contract.signed';

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","invoice.number","invoice.total","invoice.due_date","invoice.public_link"]'::jsonb,
    updated_at = now()
WHERE event_key IN ('invoice.created', 'invoice.due_soon', 'invoice.overdue');

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","invoice.number","invoice.total","invoice.public_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'invoice.paid';

-- Templates sistema (corpo WhatsApp): parágrafos claros + links quando aplicável
UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nSegue o link para consultar a nossa proposta:\n{{proposal.public_link}}\n\n• Título: {{proposal.title}}\n• Valor: {{proposal.total}}\n\nQualquer dúvida, estamos à disposição.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.sent' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nConfirmamos o aceite da proposta:\n«{{proposal.title}}»\n\nObrigado pela confiança.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.accepted' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nRegistámos o retorno sobre a proposta «{{proposal.title}}».\nSe precisar de algo, responda a esta mensagem ou contacte-nos.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.rejected' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nO contrato «{{contract.title}}» está pronto para assinatura.\n\nAssine aqui:\n{{contract.sign_link}}\n\nVisualização (somente leitura), se precisar:\n{{contract.public_view_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'contract.sent' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nConfirmamos: o contrato «{{contract.title}}» foi assinado.\n\nDocumento / visualização:\n{{contract.public_view_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'contract.signed' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nCriámos a fatura {{invoice.number}} no valor de {{invoice.total}}.\nVencimento: {{invoice.due_date}}\n\nConsulte ou pague aqui:\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.created' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nLembrete: a fatura {{invoice.number}} ({{invoice.total}}) vence em {{invoice.due_date}}.\n\nLink da fatura:\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.due_soon' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nA fatura {{invoice.number}} no valor de {{invoice.total}} está vencida ({{invoice.due_date}}).\n\nRegularize ou consulte aqui:\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.overdue' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá {{client.name}},\n\nConfirmamos o pagamento da fatura {{invoice.number}} ({{invoice.total}}).\n\nRecibo / detalhe:\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.paid' AND channel = 'whatsapp' AND locale = 'pt-BR';
