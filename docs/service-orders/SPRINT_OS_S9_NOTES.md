# Sprint OS-S9 — PDF assinaturas + remarcar agenda — Notas

| Campo | Valor |
|-------|-------|
| **Status** | **FEITO** |
| **Data** | 2026-10-29 |
| **Plano** | [`PLANO_AJUSTES_POS_S7_ORDEM_DE_SERVICO.md`](../PLANO_AJUSTES_POS_S7_ORDEM_DE_SERVICO.md) |

## Entregas

| Item | Status |
|------|--------|
| PDFKit desenha PNG cliente/técnico | ✅ `pngBufferFromSignatureData` + colunas de assinatura |
| HTML snapshot do PDF também recebe signers | ✅ `buildServiceOrderDocumentHtml(..., { signers })` |
| `POST /:id/reschedule-visit` | ✅ `rescheduleServiceOrderVisit` → `updateAppointment` |
| UI **Remarcar na agenda** | ✅ dialog reutilizado (modo schedule/reschedule) |
| Testes unitários PDF | ✅ 4 testes |

## Como validar

1. OS assinada → **Baixar PDF** → traços do cliente (± técnico) visíveis.  
2. OS com visita → **Remarcar na agenda** → novas datas → `/agenda?appointment_id=`.  
3. Google opcional: checkbox sync na remarcação.

## Fora / backlog

- Múltiplas visitas  
- Remarcar se appointment cancelado (hoje pede nova via Agenda)  
