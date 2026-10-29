# Sprint OS-S0 — Kickoff / ADR — **FEITO**

| Campo | Valor |
|-------|-------|
| **Status** | **Concluído** |
| **Data** | 2026-10-28 |
| **Plano-mãe** | [`../PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](../PLANO_SPRINTS_ORDEM_DE_SERVICO.md) |
| **Investigação** | [`../INVESTIGACAO_ORDEM_DE_SERVICO.md`](../INVESTIGACAO_ORDEM_DE_SERVICO.md) |
| **Próximo** | **ok sprint 1** → Schema + API CRUD |

---

## Objetivo

Congelar decisões de arquitetura/produto, layout A4, merge fields, nomes canônicos e schema draft — **sem** migration nem UI de produção.

---

## Entregas

| Artefato | Path |
|----------|------|
| ADR (D1–D12) | [`ADR_OS_S0_DECISOES.md`](./ADR_OS_S0_DECISOES.md) |
| Merge fields | [`MERGE_FIELDS_OS.md`](./MERGE_FIELDS_OS.md) |
| Wireframe A4 HTML | [`wireframe/ordem_servico_a4.html`](./wireframe/ordem_servico_a4.html) |
| Notas deste sprint | este arquivo |

### Como visualizar o wireframe

Abrir no browser (duplo clique ou):

```text
docs/service-orders/wireframe/ordem_servico_a4.html
```

Dados de exemplo = PDF anexo OIKOS nº 138.

---

## Aceite S0

| Critério | Status |
|----------|--------|
| Decisões D1–D12 no ADR | ✅ |
| Flag/módulo/rotas/event keys nomeados | ✅ |
| Schema draft SQL | ✅ (ADR §5) |
| HTML A4 fiel ao modelo | ✅ |
| Catálogo merge fields | ✅ |
| Checklist tenant-scope referenciado | ✅ |
| Código de produção / migration | ❌ fora de escopo (S1) |

---

## Decisões-chave (atalho)

- Domínio próprio `service_orders*`  
- HTML→PDFKit (não upload PDF na v1)  
- Assinatura padrão contratos (`client` + `technician` opcional)  
- `billing_mode`: `none` \| `manual` \| `auto_on_sign`  
- Visita via appointments + toggle Google  
- Feature `service_orders` **OFF** até go-live  
- Sem baixa de estoque na v1  

---

## Próximo (OS-S1)

1. Migration a partir do schema draft do ADR  
2. Registrar `service_orders` em `MODULE_IDS` + permission catalog  
3. Rotas `/api/service-orders` + Zod + `assertModulePermission`  
4. Totais serviços/produtos no create/patch  
5. Client tipado `src/services/serviceOrders.ts` (sem menu ainda, ou atrás da flag off)

Critérios de aceite S1: ver plano-mãe § Sprint 1.
