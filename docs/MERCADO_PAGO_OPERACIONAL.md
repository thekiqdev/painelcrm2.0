# Mercado Pago — Operação em produção (pós–Fase 4)

Este guia descreve como ativar, configurar e diagnosticar a integração **Mercado Pago** no PainelCRM após a Fase 4 (webhook, checkout em fatura híbrida com Asaas).

---

## 1. Ativar em produção

1. **Feature flag**  
   Defina `MERCADO_PAGO_GATEWAY_ENABLED=true` no ambiente do **backend** (API). Sem isso, rotas de integração e webhook retornam 404 / integração invisível.

2. **OAuth do tenant**  
   Cada tenant conecta a conta Mercado Pago pelo fluxo OAuth no app (já existente). Garanta `MERCADO_PAGO_OAUTH_ENVIRONMENT=production` alinhado à aplicação cadastrada no painel do MP (ou `sandbox` só em homologação).

3. **URL pública da API**  
   O checkout grava `notification_url` na preferência. O backend usa, por padrão:  
   `PUBLIC_API_URL` (ou `API_PUBLIC_URL`) + `/api/integrations/mercado-pago/webhook`  
   A URL **deve ser HTTPS** acessível da internet (Mercado Pago chama de fora).

4. **URL do app (redirect do cliente)**  
   `FRONTEND_URL`, `PUBLIC_APP_URL` ou `VITE_APP_URL` — usadas nos `back_urls` do Checkout Pro (`/pay/:token?mp_return=approved|pending|failure`). Devem apontar para o frontend onde a página pública de fatura está hospedada.

---

## 2. Variáveis de ambiente obrigatórias / relevantes

| Variável | Uso |
|----------|-----|
| `MERCADO_PAGO_GATEWAY_ENABLED` | `true` para habilitar gateway MP no sistema. |
| `PUBLIC_API_URL` ou `API_PUBLIC_URL` | Base pública da API; monta `notification_url` se `MERCADO_PAGO_NOTIFICATION_URL` não for definida. |
| `MERCADO_PAGO_NOTIFICATION_URL` | **Opcional.** URL completa do webhook se não quiser usar o default (`PUBLIC_API_URL/.../webhook`). |
| `FRONTEND_URL` / `PUBLIC_APP_URL` / `VITE_APP_URL` | Base do frontend para redirects pós-checkout e mensagens na página pública. |
| `MERCADO_PAGO_OAUTH_ENVIRONMENT` | `production` ou `sandbox`. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | **Recomendado em produção.** Segredo exibido no painel MP (Suas integrações → Webhooks). Habilita validação **HMAC-SHA256** do header `x-signature`. Sem esta variável, o servidor aceita notificações sem validar assinatura — modo compatível, com **log de alerta** por requisição. |
| `MERCADO_PAGO_WEBHOOK_TS_TOLERANCE_MS` | Opcional. Margem (ms) entre o `ts` do header e o relógio do servidor para mitigar replay fora da janela. Default **600000** (10 min). Use `0` para desativar a checagem de tempo. |

Credenciais OAuth da **aplicação** Mercado Pago (client id/secret do MP Developers) ficam nas variáveis já usadas pelo fluxo OAuth do projeto — não duplicar aqui na doc sem conferir o código de `mercadoPagoIntegration`.

---

## 3. `notification_url` (webhook)

- Montagem automática: ver `getMercadoPagoPreferenceNotificationUrl()` em `packages/backend/src/config/mercadoPagoGatewayEnv.ts`.
- Path suportado: `POST /api/integrations/mercado-pago/webhook`  
  Alias legado: `POST /api/webhooks/mercado-pago` (mesmo handler).
- O Mercado Pago envia notificações para essa URL; o servidor resolve o tenant pelo `user_id` / collector e valida o pagamento com **GET autenticado** na API MP (`/v1/payments/:id`).

---

## 4. Testar o webhook

1. **Em sandbox**  
   Use conta/app sandbox MP, `MERCADO_PAGO_OAUTH_ENVIRONMENT=sandbox`, geração de checkout na fatura e pagamento de teste.

2. **Verificação manual**  
   - Após pagar, confira logs `[mercado_pago.webhook]` (sem tokens).  
   - Confira evento em `payment_events` (`gateway = mercado_pago`, idempotência por `event_id`).  
   - Confira timeline do cliente (quando aplicável): `mercado_pago_webhook_received`, quitação e `invoice_paid`.

3. **Retorno do cliente**  
   O checkout redireciona para `/pay/:token?mp_return=...`. A UI mostra aviso para aguardar confirmação automática.

---

## 5. Diagnosticar eventos “ignorados” ou sem efeito

| Sintoma | O que verificar |
|---------|------------------|
| HTTP 404 no webhook | `MERCADO_PAGO_GATEWAY_ENABLED` não está `true`. |
| Sem tenant | Webhook sem `user_id` ou collector não casando com `credentials.mercado_pago_user_id` do tenant. |
| Pagamento não atualiza fatura | `payment_id` ausente no payload; ou GET `/payments/:id` falhou (token OAuth revogado); ou `external_reference` / metadata não batem com a fatura. |
| HTTP **401** `invalid_signature` | `MERCADO_PAGO_WEBHOOK_SECRET` configurado e `x-signature` ausente, inválida ou `ts` fora da tolerância. |
| HTTP **400** `invalid_payment_id` | `payment_id` com formato inválido (não numérico). |
| Evento duplicado | Comportamento esperado: mesmo `event_id` não reaplica mudança (idempotência). |
| Fatura Asaas + MP | Cobrança principal permanece Asaas; quitação via MP preenche `paid_by_gateway` e metadata MP sem apagar referência Asaas. |

Nunca habilitar log de corpo bruto com tokens no terminal em produção.

---

## 6. Timeline e auditoria (billing / timeline)

Eventos relevantes (sem dados sensíveis):

- `mercado_pago_checkout_created` — preferência/checkout gerado para a fatura.  
- `mercado_pago_webhook_received` — notificação recebida e aceita para processamento (inclui `request_id` quando o MP envia `x-request-id`).  
- `mercado_pago_invoice_settled` / fluxo de quitação — alinhado ao pagamento aprovado e fatura `paid`.

---

## 7. Fase 6 — Hardening do webhook (`x-signature`)

Implementação alinhada à [documentação oficial](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks):

1. **Header `x-signature`** — formato `ts=…,v1=…`; HMAC-SHA256 em hexadecimal com o segredo do Webhook.  
2. **Manifest** — `id:{data.id};request-id:{x-request-id};ts:{ts};` — se `x-request-id` não existir, o trecho `request-id` é omitido (regra MP). O `data.id` segue prioridade: query `data.id` → corpo JSON `data.id` → modo legado `topic=payment` + `id`.  
3. **`payment_id`** — após parse, só prossegue se for string só com dígitos (tamanho limitado).  
4. **Ordem de processamento** — validação de assinatura **antes** de `INSERT` em `payment_events` (idempotência não “gasta” slot em request rejeitada).  
5. **`x-request-id`** — propagado em logs estruturados e em billing/timeline **sem** dados sensíveis.

**Modo compatível:** sem `MERCADO_PAGO_WEBHOOK_SECRET`, a assinatura **não** é validada; cada POST gera um **warn** `signature_validation_skipped` para lembrar de configurar o segredo em produção.

**Respostas HTTP:** `200` processado ou ignorado com segurança; `401` assinatura obrigatória e inválida/ausente quando o segredo está configurado; `400` `payment_id` inválido; `500` erro interno após aceitar a assinatura.

### Riscos e limitações

| Item | Detalhe |
|------|---------|
| Modo sem segredo | Qualquer cliente HTTP pode POST no endpoint; ainda há GET autenticado MP + checagem de collector, porém **sem** garantia de origem MP no POST. |
| Relógio | `ts` fora da tolerância gera 401; ajuste `MERCADO_PAGO_WEBHOOK_TS_TOLERANCE_MS` se NTP estiver muito defasado. |
| QR Code | MP documenta que algumas notificações QR não usam o mesmo esquema de assinatura — se aplicável ao seu produto, valide no suporte MP. |
| Rate limit / IP allowlist | Não implementados neste repositório; podem ser camadas externas (API gateway, WAF). |

### Backlog opcional

- Rate limiting dedicado ao path do webhook.  
- Allowlist de IPs Mercado Pago (lista pode mudar — manter com cautela).

---

## 8. Checklist de testes (preencher em produção controlada)

Marque após executar no ambiente real ou sandbox equivalente.

| # | Caso | OK | Observação |
|---|------|----|------------|
| 1 | Conectar Mercado Pago (OAuth) no tenant | ☐ | |
| 2 | Gerar cobrança MP na fatura (Checkout Pro) | ☐ | |
| 3 | Pagar (cartão/Pix de teste ou valor controlado) | ☐ | |
| 4 | Webhook recebido (200, log sem erro) | ☐ | |
| 5 | Fatura → `paid`, `paid_at` coerente | ☐ | |
| 6 | Fatura híbrida Asaas + MP: refs Asaas preservadas, quitação MP refletida | ☐ | |
| 7 | Reenvio / duplicidade de webhook não altera duas vezes | ☐ | |
| 8 | `rejected` / `pending` não marcam pago indevidamente | ☐ | |
| 9 | Página pública: retorno `mp_return` mostra orientação; sem botão MP se já pago | ☐ | |

---

## 9. Checklist — assinatura `x-signature` (Fase 6)

Execute com `MERCADO_PAGO_WEBHOOK_SECRET` igual ao segredo do painel MP e um pagamento de teste real ou sandbox.

| # | Caso | Resultado esperado | OK |
|---|------|-------------------|-----|
| A | Notificação real do MP (assinatura válida, headers completos) | `200`, fatura atualizada como nos testes da Fase 4 | ☐ |
| B | Mesmo payload com `x-signature` alterada (um caractere em `v1`) | `401`, body `{ "received": false, "error": "invalid_signature" }`, **sem** nova linha útil em `payment_events` para ataque | ☐ |
| C | Secret configurado e POST **sem** header `x-signature` | `401` `invalid_signature` | ☐ |
| D | Secret **não** configurado e POST sem `x-signature` | `200` (modo compatível) + log `signature_validation_skipped` | ☐ |
| E | Header `x-request-id` presente | Mesmo `request_id` aparece nos logs `[mercado_pago.webhook]` da linha aplicada | ☐ |

---

## 10. Fase 7 — UX final e validação comercial

Objetivo: conferência rápida após MP conectado, cobrança criada e pagamento confirmado (somente interface; backend inalterado nesta fase).

### Checklist de uso (operador / CS)

| # | Verificação | OK |
|---|-------------|-----|
| 1 | **Configurações → Pagamentos:** card **Mercado Pago** no grid (ambiente, última validação, webhook, ações) sem bloco duplicado no topo | ☐ |
| 2 | **Fatura (interna):** bloco “Cobrança e gateways” com situação, gateway principal, quitado via, status Asaas; sem URL duplicada no resumo | ☐ |
| 3 | **Fatura paga:** link público só com “Copiar link”; sem “Pagar agora” / abrir checkout como pagamento | ☐ |
| 4 | **Fatura paga + MP:** card “Mercado Pago — cobrança encerrada” com link de referência (se existir) | ☐ |
| 5 | **Página pública /pay:** mensagens claras para análise MP, retorno do checkout, confirmação, cancelado, falha, reembolso | ☐ |
| 6 | **Página pública paga:** nenhum bloco de pagamento ativo (PIX/boleto/cartão/MP) | ☐ |

**Documentação visual:** capturas de tela para manual interno são opcionais; este checklist substitui entregáveis com imagens fixas no repositório.

### Pendências futuras (fora do escopo Fase 7)

- Métricas no painel (taxa de conversão Checkout Pro, tempo médio até `paid`).
- Template de e-mail/WhatsApp pós-quitação MP.
- Testes E2E automatizados do fluxo público.

---

## Referências no repositório

- Plano técnico: `docs/INTEGRACAO_MERCADO_PAGO_GATEWAY_PLANO.md`  
- Webhook: `packages/backend/src/services/mercadoPagoWebhookService.ts`  
- Assinatura HMAC / manifest: `packages/backend/src/services/mercadoPagoWebhookSignature.ts`  
- Preferência checkout: `packages/backend/src/services/mercadoPagoCustomerInvoicePaymentService.ts`  
- Env notification URL + segredo webhook: `packages/backend/src/config/mercadoPagoGatewayEnv.ts`  
- UX painel pagamentos / fatura / página pública (Fase 7): `src/pages/settings/PaymentsPanelPage.tsx`, `src/components/settings/MercadoPagoGatewayPanelCard.tsx`, `src/pages/CustomerInvoiceDetail.tsx`, `src/pages/CustomerInvoicePay.tsx`
