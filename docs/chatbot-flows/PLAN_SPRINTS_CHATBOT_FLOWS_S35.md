# Plano de sprints — Chatbot Flows S35 (Convert no teste + lead ao gravar contato)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 |
| **Tipo** | Entrega de sprint |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS.md`](./PLAN_SPRINTS_CHATBOT_FLOWS.md) · S20 · S26.1 |
| **Nome** | **S35 — Converter CRM no Testar + gravar no contato cria lead por padrão** |
| **Status** | **Feito** |
| **Próximo** | [`PLAN_SPRINTS_CHATBOT_FLOWS_S36.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S36.md) (**S36** feito) |

---

## 1. Meta

1. O nó **Converter CRM** não trava no **Testar**: segue com dados fictícios na saída **ok**.
2. Ao ligar **Gravar no contato (CRM)** no `wait_input`, o **padrão** é cadastrar o lead se a conversa ainda não tiver lead/cliente. Nós seguintes só atualizam o mesmo cadastro.

---

## 2. Decisões

| ID | Decisão |
|----|----------|
| **D35.1** | Simulador: `crm_convert` com `ok=true` sempre tem identidade mock (`Lead sim` / `sim-lead-1`); não exige sujeito real |
| **D35.2** | Produção do convert: identidade real inalterada (telefone/e-mail da conversa) |
| **D35.3** | `save_to_contact` implica `ensure_lead !== false` (default criar lead) |
| **D35.4** | Já cliente → não cria lead; já lead → só atualiza |
| **D35.5** | Falha ao criar lead → flow **não trava** (warn + variável de sessão) |
| **D35.6** | Opt-out discreto: “Não criar lead se não houver vínculo” (`ensure_lead: false`) |
| **D35.7** | CPF/CNPJ no lead → **S36** (schema + ficha CRM) |

---

## 3. Aceite

- [x] Testar: convert → próximo nó sem travar; `{{lead.id}}` mock quando sem sujeito
- [x] Produção: 1º “Gravar no contato” tenta criar/vincular lead; 2º campo atualiza o mesmo
- [x] Conversação já cliente: não cria lead
- [x] `ensure_lead: false` mantém o comportamento S20 (só variável se sem vínculo)
- [x] S36 não misturado nesta entrega

---

## 4. Próximo

**S36** — [`PLAN_SPRINTS_CHATBOT_FLOWS_S36.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S36.md) (**feito**).
