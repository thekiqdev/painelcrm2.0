# Plano — Ajustes pós-revisão OS (após S7)

**Data:** 2026-10-29  
**Contexto:** feedback de uso após S0–S7  
**Base:** [`PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](./PLANO_SPRINTS_ORDEM_DE_SERVICO.md)

---

## 1. Problemas observados

| # | Problema | Causa provável no código |
|---|----------|--------------------------|
| 1 | Dois títulos “Ordens de serviço” na lista | `MobilePageHeader` sem `md:hidden` + bloco desktop `hidden md:flex` — no desktop os dois aparecem |
| 2a | Espaçamento lateral no detalhe | Container `max-w-4xl` + `px-3` estreito vs. outras listagens comerciais |
| 2b | Assinatura não aparece no PDF | PDFKit desenha só **linhas vazias**; PNGs existem no HTML (`buildServiceOrderDocumentHtml` + signers), mas `renderServiceOrderPdfBuffer` **não carrega/desenha** `signature_image_png_base64` |
| 2c | Editar / Excluir | Já existem no detalhe, mas somem por regra: **Editar** só `draft\|scheduled\|in_progress`; **Excluir** só `draft\|cancelled`. OS **Assinada** não mostra os botões |
| 2d | Remarcar na agenda | `schedule-visit` rejeita se já existe `appointment_id` (`visit_already_scheduled`) — falta fluxo de **reagendar** |
| 2e | Assinatura online: link visível | UI mostra `<code>` com URL; falta padrão “Acessar” + “Copiar” sem exibir o link; técnico precisa do mesmo tratamento que o cliente |
| 3 | Histórico na tela | Seção `order.events` no detalhe — remover da UI (API pode manter eventos para auditoria) |

---

## 2. Escopo das alterações

### A — Lista
- Ocultar `MobilePageHeader` no desktop (`md:hidden`), espelhando Propostas.
- Um título + um CTA “Nova OS” por viewport.

### B — Detalhe (layout + ações)
- Alinhar padding/largura ao padrão comercial (ex. propostas/contratos).
- **Editar / Excluir** sempre visíveis quando a permissão permitir, com regras claras:
  - Editar: manter bloqueio pós-congelamento (`awaiting_signature+`), ou só campos não congelados — **decisão default:** manter freeze; botão desabilitado + tooltip se status não editável (em vez de sumir).
  - Excluir: draft/cancelled; nos demais, oferecer **Cancelar OS** se já houver `service_orders_cancel` (sem hard-delete de OS assinada/faturada).
- **Remarcar na agenda:** se `appointment` existir → dialog com novas datas + update do appointment (± re-sync Google); se não existir → mantém “Marcar visita”.

### C — Assinatura online (UI)
- Remover URL em texto.
- Por signatário (cliente **e** técnico): botões **Acessar** (abre em nova aba) e **Copiar link**.
- Manter revogar/reemitir só para quem tem permissão; sem link cru.

### D — PDF com assinaturas
- Em `buildServiceOrderPdfBuffer` / `renderServiceOrderPdfBuffer`: carregar signers; se houver PNG base64, `doc.image(...)` nas faixas cliente/técnico; senão, linha vazia como hoje.
- Garantir regeneração pós-assinatura (ou baixar PDF já com imagens sem depender só do snapshot HTML antigo).
- Teste unitário: buffer/PDF path recebe signer com PNG stub e não quebra.

### E — Histórico
- Remover bloco “Histórico” do `ServiceOrderDetails`.
- Não apagar tabela/eventos no backend neste ciclo.

---

## 3. Fora deste plano

- Múltiplas visitas / vários técnicos  
- Upload de PDF assinado (`pdf_signature`)  
- Mudança de modelo A4 / novos campos  
- e2e HTTP completo  

---

## 4. Quantidade de sprints

### Recomendação oficial: **2 sprints curtos (S8–S9)**

Escopo cabe em **~4–6 dias** de um fullstack; fatiar em 2 reduz risco do PDF/reagendar misturado com polish de UI.

| Sprint | Nome | Dias úteis | Entregas | Critério de aceite |
|--------|------|------------|----------|-------------------|
| **S8** ✅ | UX lista + detalhe + assinatura UI | 2–3 | Título único; espaçamento; Editar/Excluir/Cancelar visíveis; links só Acessar/Copiar (cliente+técnico); remover Histórico | ✅ — [`SPRINT_OS_S8_NOTES.md`](./service-orders/SPRINT_OS_S8_NOTES.md) |
| **S9** ✅ | PDF assinaturas + remarcar agenda | 2–3 | PNG no PDFKit; remarcar visita (API + dialog); smoke PDF pós-assinatura | ✅ — [`SPRINT_OS_S9_NOTES.md`](./service-orders/SPRINT_OS_S9_NOTES.md) |

```
S8 UX polish ✅     S9 PDF + remarcar ✅
```

### Alternativa: **1 sprint único (S8)**

Se preferir monólito rápido (~1 semana): juntar A–E num único PR. Aceitável se o time estiver focado só nisso; o risco é PDF + Google remarcar atrasarem o polish visual.

| Opção | Sprints | Quando escolher |
|-------|---------|-----------------|
| **A (oficial)** | **2** (S8–S9) | Entrega incremental; PDF isolado |
| **B** | **1** (S8 all-in) | Urgência comercial e um único dev |

---

## 5. Ordem de execução sugerida (dentro dos sprints)

**S8**
1. Fix título duplicado  
2. Remover Histórico  
3. Espaçamento detalhe  
4. Toolbar Editar / Excluir / Cancelar  
5. Bloco Assinatura online (Acessar + Copiar; técnico incluso)  

**S9**
1. Passar signers → PDFKit + desenhar PNG  
2. Endpoint/serviço `reschedule-visit` (ou PATCH appointment vinculado)  
3. Dialog “Remarcar” no detalhe + link Agenda  
4. Teste PDF + smoke manual  

---

## 6. Status

1. ✅ **`ok sprint 8`** — UX (lista, detalhe, assinatura UI, histórico)  
2. ✅ **`ok sprint 9`** — PDF com assinaturas + remarcar agenda  

Ajustes pós-revisão **S8–S9 concluídos**.

---

*Documento vivo: notas em `docs/service-orders/SPRINT_OS_S8_NOTES.md` / `SPRINT_OS_S9_NOTES.md`.*
