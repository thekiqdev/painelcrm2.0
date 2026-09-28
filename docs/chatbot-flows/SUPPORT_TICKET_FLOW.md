# Suporte — Chatbot Flows tickets (S25)

Referência operacional para **Abrir chamado** (`ticket_assist`) e **Consultar chamado** (`ticket_lookup_assist`).

## Pré-requisitos

| Item | Onde |
|------|------|
| Feature `chatbot_flows_runtime` | Tenant |
| Flow `active` + versão publicada | Chatbot Flows |
| Categorias de ticket | Configurações → Suporte → Categorias (`GET /api/ticket-categories`) — **mesma fonte** do runtime e do simulador |
| Cliente vinculado à conversa | Chat (obrigatório se “Exigir cliente” = on, default) |
| Link público | `{FRONTEND_URL}/ticket/{public_access_token}` |

## Reasons / códigos (`ticket._bootstrap_reason` e erros)

| Código | Fase | Significado | Mensagem típica |
|--------|------|-------------|-----------------|
| `no_client` | bootstrap create | Conversa sem `client_id` (e sem match por telefone) | Pedir vínculo de cliente |
| `no_categories` | bootstrap create | Tenant sem linhas em `ticket_categories` | Pedir cadastro de categorias |
| `conversation_not_found` | bootstrap / create | Conversa fora do tenant ou inexistente | Falha interna / empty |
| `create_failed` | create | INSERT ticket falhou (DB/constraint) | “Não foi possível abrir o chamado…” |
| `missing_fields` | create | Assunto, descrição ou categoria vazios | create fail |
| *(lookup empty)* | lookup | Sem tickets no filtro / sem cliente | `empty_message` do nó |
| *(invalid option)* | menu | Escolha fora da lista após `max_invalid` | handle `invalid` |

Log estruturado: `event=chatbot_flows_runtime` · `phase=ticket_assist_bootstrap` \| `create_ticket` \| `lookup_ticket`.

## Variáveis de template (picker)

Ver catálogo `ticket.*` em Configurações do editor / `templateVariables`:

- `{{ticket.public_url}}`, `{{ticket.number}}`, `{{ticket.subject}}`, `{{ticket.status}}`
- `{{ticket.category_name}}`, `{{ticket.menu}}`, `{{ticket.count}}`, `{{ticket.category_count}}`

## Token legado (D25.4)

No **lookup**, se `public_access_token` estiver null/vazio, o runtime **regenera** e grava no ticket antes de montar a URL.

## QA checklist (WhatsApp real)

- [ ] Categorias cadastradas; conversa **com cliente** vinculado
- [ ] Abrir chamado: ≤3 categorias → botões; >3 → digitar número
- [ ] Assunto + descrição → ticket no módulo Tickets (`channel=whatsapp`, categoria/cliente corretos)
- [ ] Mensagem final com URL `/ticket/{token}` abrível **sem login**
- [ ] Sem cliente + exigir cliente: mensagem de vínculo (não “sem categorias”)
- [ ] Consultar chamado `last_open`: 1 aberto → link direto
- [ ] Consultar `open_menu`: lista → escolha → link daquele ticket
- [ ] Sem abertos: `empty_message` + saída vazia
- [ ] Simulador do editor: mock create + mock lista (kind `ticket`)
- [ ] Sem regressão: `invoice_assist`, start rules S22–S24
