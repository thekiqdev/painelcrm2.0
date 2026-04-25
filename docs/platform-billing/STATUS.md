# Estado — Cobrança SaaS da plataforma

**Última atualização:** 2026-04-24

## Fase atual

**Fases A e B — implementação inicial concluída** (Super Admin + página pública + APIs + merge field). Próximo passo operacional: validação em ambiente com dados reais e gateway.

## Andamento

- [x] README da frente
- [x] Fase A: API + UI Super Admin (`/superadmin/platform-billings`)
- [x] Fase B: token dedicado + APIs públicas + `/saas-pay/:token` + `billing.platform_invoice_url`
- [x] Wiring: menu, rotas `App.tsx`
- [x] Builds: backend `tsc` + frontend Vite

## Concluído

- Investigação prévia: `INVESTIGACAO_FATURA_UNICA_PLATAFORMA.md`
- Migrações `144` (coluna token) e `145` (merge fields / template notificação)
- Listagem global somente leitura com filtros e indicadores de link plataforma vs fallback gateway
- Página pública de cobrança reutilizando serviços de pagamento SaaS sem checkout comercial como experiência principal

## Pendente (fora do escopo desta frente ou follow-up)

- Validação ponta a ponta em produção/staging com webhooks Asaas e notificação `platform.billing.charge.created`
- Ajustes finos de rate limit por ambiente
- Opcional: expiração / revogação de token público; paginação cursor-based na listagem Super Admin

## Próxima etapa segura

1. Aplicar migrações **`144_tenant_billing_platform_public_pay_token.sql`** e **`145_platform_notification_billing_platform_invoice_url.sql`** na base alvo.
2. Confirmar **`FRONTEND_URL`** no ambiente (links absolutos e merge field).
3. Disparar evento de cobrança de teste e validar: e-mail/template com `billing.platform_invoice_url` e fallback `billing.payment_link`.
4. Abrir `/saas-pay/{token}` gerado e exercitar PIX/boleto/cartão conforme política do tenant.
