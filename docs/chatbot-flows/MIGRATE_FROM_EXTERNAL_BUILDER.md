# Migrar flow de outro builder (`chatbot.flow_data`)

| Campo | Valor |
|-------|-------|
| **Sprint** | S21 |
| **Formato origem** | Export com `export_version` + `chatbot.flow_data` (ex.: “Fluxo Safe”) |
| **Formato destino** | `painelcrm.chatbot_flow` v1 |

## Como importar

1. Em **Chatbot Flows**, clique em **Importar**.
2. Selecione o `.json` do outro builder **ou** um export PainelCRM.
3. Confira o **relatório**:
   - **Mapeados** — nós convertidos
   - **Omitidos** — tipos sem paridade (não entram no canvas)
   - **Religar** — kanban/tag com IDs externos limpos
   - **Secrets removidos** — `x-api-key` / `Authorization` etc.
4. Confirme o nome → **Importar** (sempre **flow novo** no formato externo).

## Mapa de tipos

| Externo | PainelCRM |
|---------|-----------|
| `message` | `send_message` |
| `open_question` | `wait_input` |
| `options` | `menu_choice` |
| `transfer_to_human` | `transfer_human` |
| `wait` | `delay` |
| `pipeline_add_card` / `pipeline_move_card` | `move_kanban` (board/column vazios) |
| `contact_label_add` | `add_tag` |
| `http_request`, `condition`, `conversation_note`, `resolve_conversation`, `start`, `end` | iguais / equivalentes |

## Handles

| Externo | PainelCRM |
|---------|-----------|
| `opt:N` | id da opção N (`opt_0`, …) |
| `http_failure` / kind | `error` |
| `case:N` | `case:{id}` do caso N |
| `condition_else` | `else` |
| `fallback` | `fallback` |

## Limitações (v1)

- Não há replace de draft para formato externo (só create).
- IDs de pipeline/stage/tag do outro CRM **não** são mapeados automaticamente.
- Tipos sem paridade são **omitidos** (não stub) — edges ligadas a eles somem do grafo e aparecem no relatório.
- Fidelidade 100% do builder original **não** é objetivo.

## Fixture de teste

`packages/backend/src/services/chatbotFlows/fixtures/chatbot_flow_data_sanitized.json` — sem secrets reais.
