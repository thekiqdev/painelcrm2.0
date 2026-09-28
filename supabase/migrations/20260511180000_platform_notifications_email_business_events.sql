-- E-mail transacional + eventos platform.trial.expiring e platform.billing.charge.overdue

INSERT INTO public.platform_notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  (
    'platform.trial.expiring',
    'platform_auth',
    'Aviso de trial a vencer (3 dias)',
    'whatsapp',
    '["platform.name","platform.support_link","tenant.name","tenant.admin_name","tenant.admin_email","trial.ends_at","trial.days_left","auth.login_link"]'::jsonb,
    true
  ),
  (
    'platform.billing.charge.overdue',
    'platform_billing',
    'Fatura SaaS vencida',
    'whatsapp',
    '["platform.name","platform.support_link","tenant.name","tenant.admin_name","billing.invoice_number","billing.amount","billing.due_date","billing.platform_invoice_url","billing.payment_link"]'::jsonb,
    true
  )
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  (
    'platform.trial.started',
    'email',
    'pt-BR',
    'Seu teste gratuito no {{platform.name}} começou',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>O teste gratuito da <strong>{{platform.name}}</strong> começou para <strong>{{tenant.name}}</strong>.</p>
<p>Término previsto: <strong>{{trial.ends_at}}</strong></p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.trial.ended',
    'email',
    'pt-BR',
    'Seu período de teste no {{platform.name}} terminou',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>O período de teste de <strong>{{tenant.name}}</strong> na <strong>{{platform.name}}</strong> terminou (previsão: <strong>{{trial.ends_at}}</strong>).</p>
<p>Para continuar, aceda ao painel e escolha um plano:</p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.billing.charge.created',
    'email',
    'pt-BR',
    'Sua fatura do {{platform.name}} está disponível',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>A fatura <strong>{{billing.invoice_number}}</strong> no valor de <strong>{{billing.amount}}</strong> está disponível.</p>
<p>Vencimento: <strong>{{billing.due_date}}</strong></p>
<p><a href="{{billing.platform_invoice_url}}">Ver fatura</a></p>
<p><a href="{{billing.payment_link}}">Pagar agora</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.billing.payment_confirmed',
    'email',
    'pt-BR',
    'Pagamento confirmado — {{platform.name}}',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>Confirmámos o pagamento da fatura <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>).</p>
<p>Plano: <strong>{{plan.name}}</strong> | Conta: <strong>{{tenant.name}}</strong></p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.plan.activated',
    'email',
    'pt-BR',
    'Seu plano no {{platform.name}} foi ativado',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>O plano <strong>{{plan.name}}</strong> está ativo para <strong>{{tenant.name}}</strong>.</p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.trial.expiring',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Olá, *{{tenant.admin_name}}*,\n\nFaltam *{{trial.days_left}}* dias para o fim do teste grátis de *{{tenant.name}}* na *{{platform.name}}*.\n\nTérmino previsto: *{{trial.ends_at}}*\n\nPainel:\n{{auth.login_link}}\n\n{{platform.support_link}}',
    1,
    true
  ),
  (
    'platform.trial.expiring',
    'email',
    'pt-BR',
    'Seu teste no {{platform.name}} termina em {{trial.days_left}} dias',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>Faltam <strong>{{trial.days_left}}</strong> dias para o fim do teste gratuito de <strong>{{tenant.name}}</strong> na <strong>{{platform.name}}</strong>.</p>
<p>Término previsto: <strong>{{trial.ends_at}}</strong></p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.billing.charge.overdue',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Olá, *{{tenant.admin_name}}*,\n\nA fatura *{{billing.invoice_number}}* (*{{billing.amount}}*) da *{{platform.name}}* está *vencida* (vencimento: *{{billing.due_date}}*).\n\nPagar:\n{{billing.payment_link}}\n\nFatura:\n{{billing.platform_invoice_url}}\n\n{{platform.support_link}}',
    1,
    true
  ),
  (
    'platform.billing.charge.overdue',
    'email',
    'pt-BR',
    'Fatura vencida — {{platform.name}}',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>A fatura <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>) de <strong>{{tenant.name}}</strong> está vencida (vencimento: <strong>{{billing.due_date}}</strong>).</p>
<p><a href="{{billing.platform_invoice_url}}">Ver fatura</a></p>
<p><a href="{{billing.payment_link}}">Pagar agora</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  )
ON CONFLICT (event_key, channel, locale) DO NOTHING;

UPDATE public.platform_notification_event_catalog
SET merge_fields = '["platform.name","tenant.name","tenant.admin_name","billing.amount","billing.due_date","billing.payment_link","billing.invoice_number","billing.platform_invoice_url"]'::jsonb,
    updated_at = now()
WHERE event_key = 'platform.billing.charge.created';

UPDATE public.platform_notification_event_catalog
SET merge_fields = '["platform.name","platform.support_link","tenant.name","tenant.admin_name","plan.name","auth.login_link"]'::jsonb,
    updated_at = now()
WHERE event_key = 'platform.plan.activated';
