-- IX6 — templates en/es de boas-vindas (WhatsApp + e-mail) e código de senha (WhatsApp).
-- pt-BR permanece nas migrations 139, 147 e 228. Sem linha no locale pedido, o motor cai em pt-BR.

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('platform.account.created', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*.\n\n*Welcome to {{platform.name}}!*\n\nAccount: *{{tenant.name}}*\n\nOpen the panel:\n{{auth.login_link}}\n\n{{platform.support_link}}',
   1, true),
  ('platform.account.created', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*.\n\n*¡Bienvenido/a a {{platform.name}}!*\n\nCuenta: *{{tenant.name}}*\n\nEntra al panel:\n{{auth.login_link}}\n\n{{platform.support_link}}',
   1, true),
  (
    'platform.account.created',
    'email',
    'en',
    'Welcome to {{platform.name}}',
    E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p>
<p>The account <strong>{{tenant.name}}</strong> was created on <strong>{{platform.name}}</strong>.</p>
<p><a href="{{auth.login_link}}">Open the panel</a></p>
<p>Support: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  (
    'platform.account.created',
    'email',
    'es',
    'Bienvenido/a a {{platform.name}}',
    E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p>
<p>La cuenta <strong>{{tenant.name}}</strong> se creó en <strong>{{platform.name}}</strong>.</p>
<p><a href="{{auth.login_link}}">Entrar al panel</a></p>
<p>Soporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p>
<p>— {{platform.name}}</p>',
    1,
    true
  ),
  ('platform.auth.password_reset_code_issued', 'whatsapp', 'en', NULL,
   E'Hello, *{{user.name}}*.\n\n*{{platform.name}}* — code to reset your password:\n\n*{{auth.reset_code}}*\n\nValid for *{{auth.code_expires_in_minutes}}* minutes. Do not share this code.\n\nIf this was not you, ignore this message.\n\n{{platform.support_link}}',
   1, true),
  ('platform.auth.password_reset_code_issued', 'whatsapp', 'es', NULL,
   E'Hola, *{{user.name}}*.\n\n*{{platform.name}}* — código para restablecer tu contraseña:\n\n*{{auth.reset_code}}*\n\nVálido durante *{{auth.code_expires_in_minutes}}* minutos. No compartas este código.\n\nSi no fuiste tú, ignora este mensaje.\n\n{{platform.support_link}}',
   1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;
