-- Merge field billing.platform_invoice_url para notificações da plataforma (link próprio vs gateway).

UPDATE public.platform_notification_event_catalog
SET merge_fields = '["platform.name","tenant.name","tenant.admin_name","billing.amount","billing.due_date","billing.payment_link","billing.platform_invoice_url","billing.invoice_number"]'::jsonb,
    updated_at = now()
WHERE event_key = 'platform.billing.charge.created';

UPDATE public.platform_notification_template_system
SET body_template = E'Olá, *{{tenant.admin_name}}*,\n\nNova cobrança *{{billing.invoice_number}}* — *{{billing.amount}}*.\nVencimento: *{{billing.due_date}}*\n\nPagar na plataforma:\n{{billing.platform_invoice_url}}\n\nSe precisar do link direto do gateway: {{billing.payment_link}}\n\n{{platform.name}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'platform.billing.charge.created' AND channel = 'whatsapp' AND locale = 'pt-BR';
