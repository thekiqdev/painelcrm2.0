# Sprint OS-S2 — UI listagem / criação / detalhe — **FEITO**

| Campo | Valor |
|-------|-------|
| **Status** | **Concluído** |
| **Data** | 2026-10-28 |
| **Plano-mãe** | [`../PLANO_SPRINTS_ORDEM_DE_SERVICO.md`](../PLANO_SPRINTS_ORDEM_DE_SERVICO.md) |
| **Anterior** | [S1](./SPRINT_OS_S1_NOTES.md) |
| **Próximo** | **ok sprint 3** → PDF A4 + preview no painel |

---

## Objetivo

Fluxo interno usável: buscar cliente, período, serviços/produtos (catálogo ou manual), listar/filtrar e editar drafts.

---

## Entregas

| Peça | Path |
|------|------|
| Listagem | `src/pages/ServiceOrders.tsx` → `/service-orders` |
| Criação | `src/pages/NewServiceOrder.tsx` → `/service-orders/new` |
| Detalhe + edição | `src/pages/ServiceOrderDetails.tsx` → `/service-orders/:id` |
| Formulário | `src/components/service-orders/ServiceOrderForm.tsx` |
| Editor itens | `src/components/service-orders/ServiceOrderItemsEditor.tsx` |
| Rotas | `src/App.tsx` |
| Menu desktop | `AppShellSidebar` (grupo Documentação) |
| Menu mobile | `mobileMoreQuickAccess` + `MobileAppNavigation` |
| i18n nav | `service_orders` em pt-BR / en / es |
| Preload | `routePreload.serviceOrders` |

### UX

- Busca remota de cliente (`ClientSearchCombobox`)
- Snapshot automático + endereço de execução editável
- Período entrada/saída (`datetime-local`)
- Equipamento opcional
- Serviços e produtos: catálogo ou linha manual
- `billing_mode`: manual / auto ao assinar / none
- Prefill `?clientId=` + `from=client`
- Edição só em `draft` \| `scheduled` \| `in_progress`
- Exclusão só draft/cancelled

### Visibilidade

Menu aparece quando:
1. Feature de plano `service_orders` ativa (seed S1)
2. `canView('service_orders')`

---

## Aceite S2

| Critério | Status |
|----------|--------|
| Criar OS com cliente + itens | ✅ |
| Listar / filtrar status / busca | ✅ |
| Detalhe com totais e histórico | ✅ |
| Editar draft | ✅ |
| Menu atrás de feature + permissão | ✅ |
| PDF / assinatura / fatura / agenda | ❌ S3–S6 |

---

## Como testar

1. Aplicar migration S1 (`360_service_orders_module.sql`) se ainda não rodou  
2. Login em tenant com plano contendo `service_orders`  
3. Menu **Documentação → Ordens de serviço**  
4. Criar OS, voltar à lista, abrir detalhe, editar  

---

## Próximo (OS-S3)

Template HTML A4 (wireframe S0) + `GET /api/service-orders/:id/pdf` + preview no detalhe.
