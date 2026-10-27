-- IX9 — templates en/es do motor da plataforma (e-mail e WhatsApp).
-- pt-BR permanece nas migrations anteriores. Sem linha no locale pedido, o motor cai em pt-BR.
-- account.created e password_reset já estão em 351.

INSERT INTO public.platform_notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  ('platform.auth.login_link.issued', 'whatsapp', 'en', NULL,
   E'Hello,\n\n*{{platform.name}}* — access link for *{{tenant.name}}*.\n\n{{auth.login_link}}\n\nValid until: {{auth.magic_link_expires_at}}', 1, true),
  ('platform.auth.login_link.issued', 'whatsapp', 'es', NULL,
   E'Hola,\n\n*{{platform.name}}* — enlace de acceso para *{{tenant.name}}*.\n\n{{auth.login_link}}\n\nVálido hasta: {{auth.magic_link_expires_at}}', 1, true),

  ('platform.plan.activated', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nPlan *{{plan.name}}* is *active* for *{{tenant.name}}*.\n\nPanel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}', 1, true),
  ('platform.plan.activated', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nEl plan *{{plan.name}}* está *activo* para *{{tenant.name}}*.\n\nPanel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}', 1, true),

  ('platform.billing.charge.created', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nNew charge *{{billing.invoice_number}}* — *{{billing.amount}}*.\nDue: *{{billing.due_date}}*\n\nPay on the platform:\n{{billing.platform_invoice_url}}\n\nGateway link if needed: {{billing.payment_link}}\n\n{{platform.name}}', 1, true),
  ('platform.billing.charge.created', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nNuevo cobro *{{billing.invoice_number}}* — *{{billing.amount}}*.\nVencimiento: *{{billing.due_date}}*\n\nPagar en la plataforma:\n{{billing.platform_invoice_url}}\n\nEnlace del gateway si hace falta: {{billing.payment_link}}\n\n{{platform.name}}', 1, true),

  ('platform.billing.payment_confirmed', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nWe confirmed payment of invoice *{{billing.invoice_number}}* (*{{billing.amount}}*).\nPlan: *{{plan.name}}*\nAccount: *{{tenant.name}}*\n\nPanel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}', 1, true),
  ('platform.billing.payment_confirmed', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nConfirmamos el pago de la factura *{{billing.invoice_number}}* (*{{billing.amount}}*).\nPlan: *{{plan.name}}*\nCuenta: *{{tenant.name}}*\n\nPanel:\n{{auth.login_link}}\n\n— *{{platform.name}}*\n{{platform.support_link}}', 1, true),

  ('platform.trial.started', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nThe *free trial* of *{{platform.name}}* started for *{{tenant.name}}*.\n\nEnds: *{{trial.ends_at}}*\n\nPanel:\n{{auth.login_link}}\n\n{{platform.support_link}}', 1, true),
  ('platform.trial.started', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nLa *prueba gratis* de *{{platform.name}}* empezó para *{{tenant.name}}*.\n\nTermina: *{{trial.ends_at}}*\n\nPanel:\n{{auth.login_link}}\n\n{{platform.support_link}}', 1, true),

  ('platform.trial.ended', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nThe *free trial* of *{{tenant.name}}* ended (expected: *{{trial.ends_at}}*).\n\nTo continue, open the panel and choose a plan:\n{{auth.login_link}}\n\n{{platform.support_link}}\n\n— *{{platform.name}}*', 1, true),
  ('platform.trial.ended', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nLa *prueba gratis* de *{{tenant.name}}* terminó (previsto: *{{trial.ends_at}}*).\n\nPara continuar, entra al panel y elige un plan:\n{{auth.login_link}}\n\n{{platform.support_link}}\n\n— *{{platform.name}}*', 1, true),

  ('platform.trial.expiring', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\n*{{trial.days_left}}* days left on the free trial of *{{tenant.name}}* on *{{platform.name}}*.\n\nEnds: *{{trial.ends_at}}*\n\nPanel:\n{{auth.login_link}}\n\n{{platform.support_link}}', 1, true),
  ('platform.trial.expiring', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nQuedan *{{trial.days_left}}* días de la prueba gratis de *{{tenant.name}}* en *{{platform.name}}*.\n\nTermina: *{{trial.ends_at}}*\n\nPanel:\n{{auth.login_link}}\n\n{{platform.support_link}}', 1, true),

  ('platform.billing.charge.overdue', 'whatsapp', 'en', NULL,
   E'Hello, *{{tenant.admin_name}}*,\n\nInvoice *{{billing.invoice_number}}* (*{{billing.amount}}*) from *{{platform.name}}* is *overdue* (due *{{billing.due_date}}*).\n\nPay:\n{{billing.payment_link}}\n\nInvoice:\n{{billing.platform_invoice_url}}\n\n{{platform.support_link}}', 1, true),
  ('platform.billing.charge.overdue', 'whatsapp', 'es', NULL,
   E'Hola, *{{tenant.admin_name}}*,\n\nLa factura *{{billing.invoice_number}}* (*{{billing.amount}}*) de *{{platform.name}}* está *vencida* (vencimiento *{{billing.due_date}}*).\n\nPagar:\n{{billing.payment_link}}\n\nFactura:\n{{billing.platform_invoice_url}}\n\n{{platform.support_link}}', 1, true),

  ('platform.plan.activated', 'email', 'en', 'Your plan on {{platform.name}} is active',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>Plan <strong>{{plan.name}}</strong> is active for <strong>{{tenant.name}}</strong>.</p><p><a href="{{auth.login_link}}">Open the panel</a></p><p>Support: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.plan.activated', 'email', 'es', 'Tu plan en {{platform.name}} está activo',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>El plan <strong>{{plan.name}}</strong> está activo para <strong>{{tenant.name}}</strong>.</p><p><a href="{{auth.login_link}}">Entrar al panel</a></p><p>Soporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.billing.charge.created', 'email', 'en', 'Your {{platform.name}} invoice is ready',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>Invoice <strong>{{billing.invoice_number}}</strong> for <strong>{{billing.amount}}</strong> is ready.</p><p>Due: <strong>{{billing.due_date}}</strong></p><p><a href="{{billing.platform_invoice_url}}">View invoice</a></p><p><a href="{{billing.payment_link}}">Pay now</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.billing.charge.created', 'email', 'es', 'Tu factura de {{platform.name}} está disponible',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>La factura <strong>{{billing.invoice_number}}</strong> por <strong>{{billing.amount}}</strong> está disponible.</p><p>Vencimiento: <strong>{{billing.due_date}}</strong></p><p><a href="{{billing.platform_invoice_url}}">Ver factura</a></p><p><a href="{{billing.payment_link}}">Pagar ahora</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.billing.payment_confirmed', 'email', 'en', 'Payment confirmed — {{platform.name}}',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>We confirmed payment of invoice <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>).</p><p>Plan: <strong>{{plan.name}}</strong> | Account: <strong>{{tenant.name}}</strong></p><p><a href="{{auth.login_link}}">Open the panel</a></p><p>Support: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.billing.payment_confirmed', 'email', 'es', 'Pago confirmado — {{platform.name}}',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>Confirmamos el pago de la factura <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>).</p><p>Plan: <strong>{{plan.name}}</strong> | Cuenta: <strong>{{tenant.name}}</strong></p><p><a href="{{auth.login_link}}">Entrar al panel</a></p><p>Soporte: <a href="{{platform.support_link}}">{{platform.support_link}}</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.trial.started', 'email', 'en', 'Your free trial on {{platform.name}} started',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>The free trial of <strong>{{platform.name}}</strong> started for <strong>{{tenant.name}}</strong>.</p><p>Ends: <strong>{{trial.ends_at}}</strong></p><p><a href="{{auth.login_link}}">Open the panel</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.trial.started', 'email', 'es', 'Tu prueba gratis en {{platform.name}} empezó',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>La prueba gratis de <strong>{{platform.name}}</strong> empezó para <strong>{{tenant.name}}</strong>.</p><p>Termina: <strong>{{trial.ends_at}}</strong></p><p><a href="{{auth.login_link}}">Entrar al panel</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.trial.ended', 'email', 'en', 'Your trial on {{platform.name}} ended',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>The trial of <strong>{{tenant.name}}</strong> on <strong>{{platform.name}}</strong> ended (expected: <strong>{{trial.ends_at}}</strong>).</p><p><a href="{{auth.login_link}}">Choose a plan</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.trial.ended', 'email', 'es', 'Tu prueba en {{platform.name}} terminó',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>La prueba de <strong>{{tenant.name}}</strong> en <strong>{{platform.name}}</strong> terminó (previsto: <strong>{{trial.ends_at}}</strong>).</p><p><a href="{{auth.login_link}}">Elegir un plan</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.trial.expiring', 'email', 'en', 'Your {{platform.name}} trial ends in {{trial.days_left}} days',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p><strong>{{trial.days_left}}</strong> days left on the free trial of <strong>{{tenant.name}}</strong>.</p><p>Ends: <strong>{{trial.ends_at}}</strong></p><p><a href="{{auth.login_link}}">Open the panel</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.trial.expiring', 'email', 'es', 'Tu prueba en {{platform.name}} termina en {{trial.days_left}} días',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>Quedan <strong>{{trial.days_left}}</strong> días de la prueba gratis de <strong>{{tenant.name}}</strong>.</p><p>Termina: <strong>{{trial.ends_at}}</strong></p><p><a href="{{auth.login_link}}">Entrar al panel</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform.billing.charge.overdue', 'email', 'en', 'Overdue invoice — {{platform.name}}',
   E'<p>Hello, <strong>{{tenant.admin_name}}</strong>,</p><p>Invoice <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>) for <strong>{{tenant.name}}</strong> is overdue (due <strong>{{billing.due_date}}</strong>).</p><p><a href="{{billing.platform_invoice_url}}">View invoice</a></p><p><a href="{{billing.payment_link}}">Pay now</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform.billing.charge.overdue', 'email', 'es', 'Factura vencida — {{platform.name}}',
   E'<p>Hola, <strong>{{tenant.admin_name}}</strong>,</p><p>La factura <strong>{{billing.invoice_number}}</strong> (<strong>{{billing.amount}}</strong>) de <strong>{{tenant.name}}</strong> está vencida (vencimiento <strong>{{billing.due_date}}</strong>).</p><p><a href="{{billing.platform_invoice_url}}">Ver factura</a></p><p><a href="{{billing.payment_link}}">Pagar ahora</a></p><p>— {{platform.name}}</p>', 1, true),

  ('platform_ticket_created', 'whatsapp', 'en', NULL,
   E'Your ticket was received.\n\nProtocol: {{ticket.protocol}}\nSubject: {{ticket.subject}}\nStatus: {{ticket.status}}\n\nFollow up:\n{{ticket.link}}', 1, true),
  ('platform_ticket_created', 'whatsapp', 'es', NULL,
   E'Tu ticket fue recibido.\n\nProtocolo: {{ticket.protocol}}\nAsunto: {{ticket.subject}}\nEstado: {{ticket.status}}\n\nSeguimiento:\n{{ticket.link}}', 1, true),
  ('platform_ticket_reply', 'whatsapp', 'en', NULL,
   E'New reply on ticket {{ticket.protocol}}.\n\nMessage:\n"{{ticket.message_preview}}"\n\nFollow up:\n{{ticket.link}}', 1, true),
  ('platform_ticket_reply', 'whatsapp', 'es', NULL,
   E'Nueva respuesta en el ticket {{ticket.protocol}}.\n\nMensaje:\n"{{ticket.message_preview}}"\n\nSeguimiento:\n{{ticket.link}}', 1, true),
  ('platform_ticket_status_changed', 'whatsapp', 'en', NULL,
   E'Update on ticket {{ticket.protocol}}.\n\nStatus: {{ticket.status}}\nSubject: {{ticket.subject}}\n\nFollow up:\n{{ticket.link}}', 1, true),
  ('platform_ticket_status_changed', 'whatsapp', 'es', NULL,
   E'Actualización del ticket {{ticket.protocol}}.\n\nEstado: {{ticket.status}}\nAsunto: {{ticket.subject}}\n\nSeguimiento:\n{{ticket.link}}', 1, true),

  ('platform_ticket_created', 'email', 'en', 'Ticket received - {{ticket.protocol}}',
   E'<p>Hello, {{tenant.admin_name}}.</p><p>We received your support ticket.</p><p><strong>Protocol:</strong> {{ticket.protocol}}<br><strong>Subject:</strong> {{ticket.subject}}<br><strong>Status:</strong> {{ticket.status}}</p><p><a href="{{ticket.link}}">Open ticket</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform_ticket_created', 'email', 'es', 'Ticket recibido - {{ticket.protocol}}',
   E'<p>Hola, {{tenant.admin_name}}.</p><p>Recibimos tu ticket de soporte.</p><p><strong>Protocolo:</strong> {{ticket.protocol}}<br><strong>Asunto:</strong> {{ticket.subject}}<br><strong>Estado:</strong> {{ticket.status}}</p><p><a href="{{ticket.link}}">Abrir ticket</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform_ticket_reply', 'email', 'en', 'New reply on ticket {{ticket.protocol}}',
   E'<p>Hello, {{tenant.admin_name}}.</p><p>There is a new public reply on your ticket.</p><p><strong>Protocol:</strong> {{ticket.protocol}}<br><strong>Message:</strong> {{ticket.message_preview}}</p><p><a href="{{ticket.link}}">View reply</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform_ticket_reply', 'email', 'es', 'Nueva respuesta en el ticket {{ticket.protocol}}',
   E'<p>Hola, {{tenant.admin_name}}.</p><p>Hay una nueva respuesta pública en tu ticket.</p><p><strong>Protocolo:</strong> {{ticket.protocol}}<br><strong>Mensaje:</strong> {{ticket.message_preview}}</p><p><a href="{{ticket.link}}">Ver respuesta</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform_ticket_status_changed', 'email', 'en', 'Status updated - {{ticket.protocol}}',
   E'<p>Hello, {{tenant.admin_name}}.</p><p><strong>Protocol:</strong> {{ticket.protocol}}<br><strong>New status:</strong> {{ticket.status}}</p><p><a href="{{ticket.link}}">Open ticket</a></p><p>— {{platform.name}}</p>', 1, true),
  ('platform_ticket_status_changed', 'email', 'es', 'Estado actualizado - {{ticket.protocol}}',
   E'<p>Hola, {{tenant.admin_name}}.</p><p><strong>Protocolo:</strong> {{ticket.protocol}}<br><strong>Nuevo estado:</strong> {{ticket.status}}</p><p><a href="{{ticket.link}}">Abrir ticket</a></p><p>— {{platform.name}}</p>', 1, true)
ON CONFLICT (event_key, channel, locale) DO NOTHING;
