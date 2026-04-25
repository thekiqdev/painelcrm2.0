-- Motor da PLATAFORMA: eventos de trial + revisão de merge fields/templates (cadastro, pagamento, plano).

INSERT INTO public.platform_notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  ('platform.trial.started', 'platform_auth', 'Início do teste grátis (tenant)', 'whatsapp',
   '["platform.name","platform.support_link","tenant.name","tenant.admin_name","trial.ends_at","auth.login_link"]'::jsonb, true),
  ('platform.trial.ended', 'platform_auth', 'Fim do teste grátis (trial expirado pelo job)', 'whatsapp',
   '["platform.name","platform.support_link","tenant.name","tenant.admin_name","trial.ends_at","auth.login_link"]'::jsonb, true)
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('platform.trial.started', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*,\n\nO *teste grátis* da *{{platform.name}}* começou para *{{tenant.name}}*.\n\nTérmino previsto: *{{trial.ends_at}}*\n\nPainel:\n{{auth.login_link}}\n\n{{platform.support_link}}',
   1, true),
  ('platform.trial.ended', 'whatsapp', 'pt-BR', NULL,
   E'Olá, *{{tenant.admin_name}}*,\n\nO *teste grátis* de *{{tenant.name}}* terminou (previsão: *{{trial.ends_at}}*).\n\nPara continuar, aceda ao painel e escolha um plano:\n{{auth.login_link}}\n\n{{platform.support_link}}\n\n— *{{platform.name}}*',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;

UPDATE public.platform_notification_event_catalog
SET merge_fields = '["platform.name","platform.support_link","tenant.name","tenant.admin_name","tenant.admin_email","plan.name","billing.amount","billing.invoice_number","auth.login_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'platform.billing.payment_confirmed';

UPDATE public.platform_notification_event_catalog
SET merge_fields = '["platform.name","platform.support_link","tenant.name","tenant.admin_name","plan.name","auth.login_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'platform.plan.activated';

UPDATE public.platform_notification_template_system
SET body_template = E'Olá, *{{tenant.admin_name}}*!\n\nA conta *{{tenant.name}}* foi criada na *{{platform.name}}*.\n\nEntre no painel:\n{{auth.login_link}}\n\nSuporte: {{platform.support_link}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'platform.account.created' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.platform_notification_template_system
SET body_template = E'Olá, *{{tenant.admin_name}}*,\n\nConfirmámos o pagamento da fatura *{{billing.invoice_number}}* (*{{billing.amount}}*).\nPlano: *{{plan.name}}*\nConta: *{{tenant.name}}*\n\nPainel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'platform.billing.payment_confirmed' AND channel = 'whatsapp' AND locale = 'pt-BR';

UPDATE public.platform_notification_template_system
SET body_template = E'Olá, *{{tenant.admin_name}}*,\n\nO plano *{{plan.name}}* está *ativo* para *{{tenant.name}}*.\n\nPainel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}',
    version = version + 1,
    updated_at = now()
WHERE event_key = 'platform.plan.activated' AND channel = 'whatsapp' AND locale = 'pt-BR';
