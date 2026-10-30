-- Status "sent" (Enviado) + evento de notificação ao compartilhar OS com o cliente (link de visualização).

ALTER TABLE public.service_orders
  DROP CONSTRAINT IF EXISTS service_orders_status_check;

ALTER TABLE public.service_orders
  ADD CONSTRAINT service_orders_status_check CHECK (
    status IN (
      'draft',
      'scheduled',
      'in_progress',
      'sent',
      'awaiting_signature',
      'signed',
      'invoiced',
      'completed',
      'cancelled'
    )
  );

INSERT INTO public.notification_event_catalog (event_key, module, description, default_channel, merge_fields, is_active)
VALUES
  (
    'service_order.shared',
    'service_orders',
    'Ordem de serviço enviada ao cliente (link de visualização)',
    'email',
    '["tenant.name","client.name","service_order.number","service_order.public_view_link"]'::jsonb,
    true
  )
ON CONFLICT (event_key) DO NOTHING;

INSERT INTO public.notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES
  (
    'service_order.shared',
    'email',
    'pt-BR',
    'Ordem de Serviço Nº {{service_order.number}} — {{tenant.name}}',
    E'<p>Olá, {{client.name}}.</p><p>Segue a <strong>Ordem de Serviço Nº {{service_order.number}}</strong> para visualização.</p><p><a href="{{service_order.public_view_link}}">Abrir documento</a></p><p>{{tenant.name}}</p>',
    1,
    true
  ),
  (
    'service_order.shared',
    'whatsapp',
    'pt-BR',
    NULL,
    E'Olá, *{{client.name}}*.\n\nSegue a *Ordem de Serviço Nº {{service_order.number}}* para visualização.\n\n*Documento:*\n{{service_order.public_view_link}}\n\n{{tenant.name}}',
    1,
    true
  )
ON CONFLICT (event_key, channel, locale) DO NOTHING;
