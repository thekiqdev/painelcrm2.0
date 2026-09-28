-- Ver supabase/migrations/20260511160000_platform_notifications_email_channel.sql

ALTER TABLE public.platform_notification_event_catalog
  DROP CONSTRAINT IF EXISTS platform_notification_event_catalog_default_channel_check;
ALTER TABLE public.platform_notification_event_catalog
  ADD CONSTRAINT platform_notification_event_catalog_default_channel_check
  CHECK (default_channel IN ('whatsapp', 'email'));

ALTER TABLE public.platform_notification_template_system
  DROP CONSTRAINT IF EXISTS platform_notification_template_system_channel_check;
ALTER TABLE public.platform_notification_template_system
  ADD CONSTRAINT platform_notification_template_system_channel_check
  CHECK (channel IN ('whatsapp', 'email'));

ALTER TABLE public.platform_notification_template_overrides
  DROP CONSTRAINT IF EXISTS platform_notification_template_overrides_channel_check;
ALTER TABLE public.platform_notification_template_overrides
  ADD CONSTRAINT platform_notification_template_overrides_channel_check
  CHECK (channel IN ('whatsapp', 'email'));

ALTER TABLE public.platform_notification_deliveries
  DROP CONSTRAINT IF EXISTS platform_notification_deliveries_channel_check;
ALTER TABLE public.platform_notification_deliveries
  ADD CONSTRAINT platform_notification_deliveries_channel_check
  CHECK (channel IN ('whatsapp', 'email'));

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  (
    'platform.account.created',
    'email',
    'pt-BR',
    'Bem-vindo(a) à {{platform.name}}',
    E'<p>Olá, <strong>{{tenant.admin_name}}</strong>,</p>
<p>A conta <strong>{{tenant.name}}</strong> foi criada na <strong>{{platform.name}}</strong>.</p>
<p><a href="{{auth.login_link}}">Aceder ao painel</a></p>
<p>Suporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  )
ON CONFLICT (event_key, channel, locale) DO NOTHING;
