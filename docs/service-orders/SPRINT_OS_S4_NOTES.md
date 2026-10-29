# Sprint OS-S4 — Assinatura online — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-28 |
| **ADR** | [`ADR_OS_S0_DECISOES.md`](./ADR_OS_S0_DECISOES.md) (D3) |

## Entregas

### Migration
- `database/init/361_service_orders_signature.sql` — `service_order_signers`, `service_order_public_view_tokens`, `service_order_signer_signature_invites`, funções SECURITY DEFINER de lookup público, seed `service_order.sent` / `service_order.signed` (+ templates WhatsApp/e-mail).
- Registada em `migrationOrder.ts` após `360_service_orders_module.sql`.

### Backend
- `serviceOrderTokenCrypto.ts` — hash SHA-256 + AES-GCM ciphertext (reemissão no painel).
- `serviceOrderSignatureService.ts` — enviar/regenerar, revogar, reemitir, payloads públicos view/sign, submit com PNG + termos.
- Controllers autenticados: `POST /:id/send-for-signature`, `POST /:id/revoke-signature-links`, `POST /:id/signers/:signerId/reissue-invite`.
- Público: `GET/POST /api/public/service-orders/view|sign/:token` (+ `/pdf`) com rate limit.
- Notificações: `serviceOrderTransactionalNotifications.ts` (e-mail + WhatsApp via motor, fire-and-forget).
- GET detalhe enriquecido com `signers` + `public_view`.
- Snapshot HTML atualizado após assinatura (imagens PNG no bloco de assinaturas).

### Frontend
- Rotas públicas `/service-order-view/:token`, `/service-order-sign/:token` (+ Auth/comercial/Meta paths).
- Páginas `PublicServiceOrderView` / `PublicServiceOrderSign` (SignaturePad).
- Detalhe: Enviar / Reenviar / Revogar / Reemitir + copiar links.

## Fluxo

1. OS em `draft|scheduled|in_progress` → **Enviar para assinatura**.
2. Freeze documento, upsert signatário `client` (+ `technician` opcional), view token + invites.
3. Status → `awaiting_signature`; notificação `service_order.sent`.
4. Cliente assina no link → status `signed` quando o signatário **cliente** conclui; evento `service_order.signed`.

## Critérios de aceite

| Critério | Status |
|----------|--------|
| Link view só lê | ✅ |
| Link sign coleta assinatura (pad + nome + termos) | ✅ |
| Após assinar (cliente), status `signed` | ✅ |
| Rate limit básico | ✅ |
| Isolamento por token hash | ✅ |

## Fora deste sprint

- Fatura `auto_on_sign` / conversão (S5).
- Overlay PNG no PDFKit (HTML snapshot já mostra assinatura).
- Agenda / Google (S6).
