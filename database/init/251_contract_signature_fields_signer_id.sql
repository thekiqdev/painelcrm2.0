-- Vincula campos PDF ao signatário específico (multi-assinantes).

ALTER TABLE public.contract_signature_fields
  ADD COLUMN IF NOT EXISTS contract_signer_id UUID NULL
    REFERENCES public.contract_signers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_signature_fields_signer
  ON public.contract_signature_fields (contract_id, contract_signer_id)
  WHERE contract_signer_id IS NOT NULL;

COMMENT ON COLUMN public.contract_signature_fields.contract_signer_id IS
  'Signatário dono do campo (assinatura/nome/data). Mantém signer_type para compatibilidade.';

-- Template e-mail transacional (mesmos merge fields do WhatsApp).
INSERT INTO public.notification_template_system (event_key, channel, locale, subject_template, body_template, version, is_active)
VALUES (
  'contract.sent',
  'email',
  'pt-BR',
  'Convite para assinar: {{contract.title}} — {{tenant.name}}',
  E'<p>Olá <strong>{{signer.name}}</strong>,</p>
<p>A empresa <strong>{{tenant.name}}</strong> enviou o contrato <strong>«{{contract.title}}»</strong> para a sua assinatura eletrónica.</p>
<p><a href="{{contract.sign_link}}">Abrir e assinar o contrato</a></p>
<p>Visualização do documento (somente leitura):<br><a href="{{contract.public_view_link}}">{{contract.public_view_link}}</a></p>
<p>Cliente: {{client.name}}</p>
<p>— {{tenant.name}}</p>',
  1,
  true
)
ON CONFLICT (event_key, channel, locale) DO NOTHING;
