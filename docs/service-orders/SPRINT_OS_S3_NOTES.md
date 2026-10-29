# Sprint OS-S3 — Documento A4 + PDF — **FEITO**

| Campo | Valor |
|-------|-------|
| **Status** | **Concluído** |
| **Data** | 2026-10-28 |
| **Plano-mãe** | [`../PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](../PLANO_SPRINTS_ORDEM_DE_SERVICO.md) |
| **Anterior** | [S2](./SPRINT_OS_S2_NOTES.md) |
| **Próximo** | **ok sprint 4** → Assinatura online + links públicos |

---

## Objetivo

Preview A4 no painel + download PDF (PDFKit), alinhado ao wireframe S0 / PDF modelo.

---

## Entregas

| Peça | Path |
|------|------|
| Modelo + HTML | `packages/backend/src/services/serviceOrderDocumentModel.ts` |
| PDFKit | `packages/backend/src/services/serviceOrderPdfService.ts` |
| API document | `GET /api/service-orders/:id/document` → `{ html, model }` |
| API PDF | `GET /api/service-orders/:id/pdf?freeze=1` |
| Preview UI | `ServiceOrderA4Preview` + estilos |
| Detalhe | botões **Baixar PDF** / **Ver documento A4** |
| Testes | `serviceOrderDocumentModel.test.ts` (HTML OIKOS nº 138) |

### Freeze

- Preview atualiza `content_html` (live).
- Baixar PDF em status `draft|scheduled|in_progress` grava/atualiza `content_snapshot_html` + `document_frozen_at`.
- Após `awaiting_signature+` (S4), snapshot deixa de ser sobrescrito.

### Blocos no PDF/HTML

Cabeçalho tenant · nº OS · período · cliente · equipamento (opc.) · serviços · produtos · totais · observações · linhas de assinatura.

---

## Aceite S3

| Critério | Status |
|----------|--------|
| Preview A4 no detalhe | ✅ |
| Download PDF | ✅ |
| Totais 430,00 no modelo OIKOS | ✅ (teste) |
| Branding tenant (`company_*`, CNPJ) | ✅ |
| Assinatura online | ❌ S4 |

---

## Como testar

1. Abrir uma OS existente  
2. Conferir preview A4  
3. Clicar **Baixar PDF** e abrir o arquivo  
4. Confirmar `document_frozen_at` no detalhe após o download  

---

## Próximo (OS-S4)

Tokens públicos view/sign, SignaturePad, notificações `service_order.sent`.
