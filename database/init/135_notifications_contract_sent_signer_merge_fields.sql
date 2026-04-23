-- contract.sent: merge fields por signatário + texto orientado ao participante.

UPDATE public.notification_event_catalog
SET merge_fields = '["tenant.name","client.name","contract.title","contract.sign_link","contract.public_view_link","signer.name","signer.email","signer.whatsapp"]'::jsonb,
    updated_at = now()
WHERE event_key = 'contract.sent';

UPDATE public.notification_template_system
SET body_template = E'Olá {{signer.name}},\n\nConvite para assinar o contrato «{{contract.title}}».\n\nAbra o link para assinar:\n{{contract.sign_link}}\n\nCliente (cadastro CRM): {{client.name}}\n\nVisualização do documento (somente leitura):\n{{contract.public_view_link}}\n\n{{tenant.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'contract.sent' AND channel = 'whatsapp' AND locale = 'pt-BR';
