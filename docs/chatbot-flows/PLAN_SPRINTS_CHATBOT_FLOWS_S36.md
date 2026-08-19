# Plano de sprints — Chatbot Flows S36 (CPF/CNPJ no lead)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 |
| **Tipo** | Entrega de sprint |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS.md`](./PLAN_SPRINTS_CHATBOT_FLOWS.md) · S20 · S35 |
| **Nome** | **S36 — CPF/CNPJ no cadastro do lead** |
| **Status** | **Feito** |
| **Anterior** | [`PLAN_SPRINTS_CHATBOT_FLOWS_S35.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S35.md) |

---

## 1. Meta

O lead passa a ter **CPF/CNPJ** como o cliente: coluna no banco, ficha/API, chat e `wait_input` **Gravar no contato**. Na conversão lead → cliente o documento é copiado.

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D36.1** | Coluna `leads.cpf_cnpj TEXT` (só dígitos; 11 = CPF, 14 = CNPJ), espelhando `clients` |
| **D36.2** | Campo opcional na ficha (criar/editar), resumo, pré-cadastro, quick view e perfil do chat |
| **D36.3** | `runtimeUpdateContact` grava CPF no lead; some `cpf_cnpj_requires_client` |
| **D36.4** | Conversão (ficha, flow `to_client`, kanban) copia `cpf_cnpj` para o cliente novo |
| **D36.5** | Editor do flow: opção **CPF/CNPJ** (não mais “só cliente”) |

---

## 3. Aceite

- [x] Migração `328_leads_cpf_cnpj.sql` no `migrationOrder`
- [x] API GET/POST/PATCH de lead lê e grava `cpf_cnpj`
- [x] Ficha do lead edita e exibe o documento
- [x] Chat (inbox + floating) edita CPF do lead mesmo vazio
- [x] Flow `save_to_contact` + `contact_field=cpf_cnpj` persiste no lead
- [x] Converter lead → cliente leva o CPF

---

## 4. Próximo

Produto fora deste sprint (ex. S6 hardening / outros itens de chatbot-flows).
