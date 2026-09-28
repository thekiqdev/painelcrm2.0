# Inventário de variáveis (S9) — Chatbot Flows / PainelCRM

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-04 |
| **Status** | Investigação concluída + catálogo seed criado |
| **Fonte de metadados** | `packages/backend/src/services/templateVariables/catalog.ts` (+ espelho FE `src/lib/templateVariables/catalog.ts`) |

---

## Veredito

**Não havia uma fonte única.** Existem ~8 motores/catálogos paralelos de `{{var}}`.  
O melhor modelo a **reutilizar** é o de **contratos** (`contractMergeFieldCatalog` + picker).  
Para flows, o motor atual é `interpolateTemplate` (só keys simples, missing → `''`).

---

## Sistemas encontrados

| # | Sistema | Paths | Sintaxe | Política missing |
|---|---------|-------|---------|------------------|
| 1 | **Chatbot Flows** | `flowRuntimeEngine.interpolateTemplate` | `{{var}}` simples | → `''` |
| 2 | **Chat / Kanban templates** | `renderMessageTemplate` + context builders | `{{key}}` / `{{a.b}}` | deixa literal |
| 3 | **Kanban task automation** | `kanbanColumnAutomationService` | whitelist fechada | próprio |
| 4 | **Notifications Engine** | `strictMergeRenderer` + `merge_fields` DB | `{{ns.field}}` | **fail** |
| 5 | **Contratos** | `contractMergeFieldCatalog` + panel | dotted | via renderMessageTemplate |
| 6 | **Propostas** | `mergeProposalPlaceholders` | snake_case | ad-hoc |
| 7 | **Message templates legados** | Settings Modelos | livre | teste manual |
| 8 | **WhatsApp Official HSM** | Meta `{{1}}`… | índices | **ortogonal** (não misturar) |

### Overlaps

- `contact_name` / `client.name` / `client_name` / `display_name`
- `company_name` / `tenant.name` / `system.tenant_name`
- `operator_name` / `agent.name`
- Context builders chat/kanban duplicados ~4×
- Motores de replace quase iguais com políticas diferentes

---

## Categorias do catálogo unificado (seed)

| Categoria | Exemplos |
|-----------|----------|
| `flow_session` | `answer`, `webhook_payload`, `http_status` (dinâmicas) |
| `contact` | `contact.name`, `contact.phone`, `contact.email` |
| `conversation` | `conversation.id`, `column_name`, `board_name` |
| `agent` | `agent.name`, `agent.team_name` |
| `tenant` | `tenant.name`, `tenant.domain` |
| `system` | `system.date`, `system.date_formatted` |

Cada campo tem `key` canônica (dotted), `aliases` flat legados e `scopes`.

---

## Decisões para S10

1. **Seed no runtime** do flow: injetar contact/conversation/agent/tenant/system no `session.variables` (aliases flat para compat com `{{answer}}` e `{{contact_name}}`).
2. **Picker** no editor (generalizar `ContractMergeFieldsPanel`) nos textareas de Mensagem, Pergunta, HTTP body, Webhook template.
3. **Não unificar ainda** Meta HSM `{{n}}` nem notifications strict (podem consumir o catálogo depois).
4. Motor: no S10, flows podem continuar com `interpolateTemplate`; evolução opcional para dotted + aliases via `lookupTemplateVariableValue`.

---

## Reusar vs inventar

| Reusar | Inventar (S9 feito / S10) |
|--------|---------------------------|
| Forma do catálogo contratos | Seed `templateVariables/catalog` |
| `renderMessageTemplate` (chat) | Picker + seed no runner |
| Context builders chat/kanban | Consolidar builders depois |
| Isolar Meta `{{n}}` | — |
