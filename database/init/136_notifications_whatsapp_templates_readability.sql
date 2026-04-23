-- Legibilidade WhatsApp: templates sistema com blocos curtos, *negrito* e links em linha própria.

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\n*Proposta:* {{proposal.title}}\n*Valor:* {{proposal.total}}\n\n*Link da proposta:*\n{{proposal.public_link}}\n\nDúvidas, responda a esta mensagem.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.sent' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nConfirmamos o aceite da proposta *«{{proposal.title}}»*.\n\nObrigado pela confiança.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.accepted' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nRecebemos o seu retorno sobre *«{{proposal.title}}»*.\n\nEstamos à disposição.\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'proposal.rejected' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{signer.name}}*.\n\nConvite para assinar *«{{contract.title}}»*.\n\n*Assinatura:*\n{{contract.sign_link}}\n\n*Documento (somente leitura):*\n{{contract.public_view_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'contract.sent' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nO contrato *«{{contract.title}}»* está assinado.\n\n*Documento:*\n{{contract.public_view_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'contract.signed' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nCriámos a fatura *{{invoice.number}}*.\n\n*Valor:* {{invoice.total}}\n*Vencimento:* {{invoice.due_date}}\n\n*Consulte ou pague aqui:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.created' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\n*Lembrete de vencimento*\n\nFatura *{{invoice.number}}*\n*Valor:* {{invoice.total}}\n*Data:* {{invoice.due_date}}\n\n*Link da fatura:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.due_soon' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nA fatura *{{invoice.number}}* está em atraso.\n\n*Valor:* {{invoice.total}}\n*Vencimento:* {{invoice.due_date}}\n\n*Regularizar ou consultar:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.overdue' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.notification_template_system
SET body_template = E'Olá, *{{client.name}}*.\n\nPagamento confirmado — fatura *{{invoice.number}}* (*{{invoice.total}}*).\n\n*Recibo / detalhe:*\n{{invoice.public_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'invoice.paid' AND channel = 'whatsapp' AND locale = 'pt-BR';
