# B3 — Escopo `ClientSearchCombobox` (Fase 8)

Inventário de telas que **escolhem um cliente** (formulário / criação) e decisão Fase 8: uso de `ClientSearchCombobox` vs **fora de escopo** com justificativa.

**Padrão adotado:** `remoteSearch` + `GET /api/clients?q=` para listas grandes; modo **local** (`clients` prop) quando o fluxo já carrega todos os clientes em memória (ex.: wizard de projeto).

---

## Migrado para `ClientSearchCombobox`

| Tela / fluxo | Arquivo | Observação |
|--------------|---------|------------|
| Nova fatura manual | `src/pages/CustomerInvoiceNew.tsx` | `remoteSearch`, criação de cliente |
| Wizard projeto — passo básico | `src/components/projects/wizard/steps/Step2BasicConfig.tsx` | Lista local (`clients` já carregados) |
| Nova cobrança (diálogo) | `src/pages/CustomerCharges.tsx` | `remoteSearch`, cliente opcional |
| Novo ticket | `src/pages/NewTicket.tsx` | `remoteSearch`, preenche contato via `getClientById` |
| Nova tarefa (modal avançado) | `src/pages/Tasks.tsx` | `remoteSearch`; lista `clients` ainda carregada para `TaskFullView` |

---

## Fora do escopo B3 (documentado)

| Contexto | Motivo |
|----------|--------|
| **`src/pages/Proposals.tsx`** | UI de demonstração: `Select` com valores fixos (`client1`, `client2`), sem API de clientes. Migrar quando o módulo de propostas for integrado ao backend. |
| **`src/pages/Finance.tsx`** | Resolução de nome por `client_id` em dados já retornados (não é seletor de cliente em formulário novo). |
| **`src/pages/ClientProfile.tsx`**, **`ContractDetails.tsx`**, rotas com `:id` | Cliente já definido pelo contexto da rota / entidade; não há “escolher cliente” no mesmo sentido. |
| **Listagens** (`CustomerCharges` tabela, `Tickets` coluna “Cliente”) | Exibição somente leitura; mapa `client_id` → nome ou dado embutido. |
| **Outros módulos** (pedidos, mensagens, contratos wizard, etc.) | Se existir `Select` de cliente futuro, repetir o padrão deste doc em PR dedicado (Fase 8 não exige varredura infinita — escopo **ampliado** nas telas operacionais listadas em “Migrado”). |

---

## Manutenção

- Novos fluxos que **permitam escolher qualquer cliente do tenant** devem preferir `ClientSearchCombobox` com `remoteSearch` para evitar carregar `getClients()` sem filtro.
- Referência: `docs/PLANO-CORRECAO-FASE-8-V2.md` §B3.
