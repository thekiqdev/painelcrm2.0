# QA staging — permissões granulares do Chat (Fase 3)

Checklist para validação manual em **staging** após criar perfis de teste no tenant.

## Perfis sugeridos (custom role ou role do sistema + `module_extras`)

Ajuste em **Configurações → permissões do perfil** (ou API). Chaves em `chat.module_extras` quando aplicável.

| Perfil | `chat.can_view` | `chat.can_edit` | Ideia de extras (`module_extras`) |
|--------|-----------------|-----------------|-----------------------------------|
| **Sem chat** | false | false | — |
| **Chat somente leitura** | true | false | `chat_reply: false`, restantes default false |
| **Chat atendimento básico** | true | true | `chat_reply`, `chat_take_attendance`, `chat_transfer`, `chat_close`, `chat_reopen`, `chat_assign`, `chat_view_queue: true` |
| **Chat supervisor** | true | true | acima + `chat_view_all`, `chat_manage_tags`, `chat_manage_queues`, `chat_view_metrics` |
| **Chat grupos** | true | true | `chat_create_group`, `chat_manage_groups`, `chat_manage_group_participants`, `chat_manage_group_settings` |

**Admin do tenant:** deve continuar com acesso total (ignora negações).

---

## Validação por área

Marque após testar com o perfil adequado.

### Acesso e listagem
- [ ] **Sem `chat.view`:** não abre `/chat`; floating chat oculto (comportamento existente Fase 2).
- [ ] **Com `chat.view` sem `chat.view_queue`:** vê lista “Todas / Minhas / Encerradas”; **não** vê toggles Fila / Equipe / Não atribuídas; contagens `queue`/`team`/`unassigned` = 0 na API; GET com `attendanceFilter=queue` → **403**.
- [ ] **Com `chat.view_queue`:** vê toggles de fila e contagens; lista filtrada funciona.

### Composer e envio
- [ ] Sem `chat.send_message`: composer oculto/mensagem; POST envio → 403.

### Atendimento
- [ ] Assumir / transferir / encerrar / reabrir alinhados às chaves granulares (botões e 403).

### Tags e comercial / agenda
- [ ] Tags, fatura, proposta, contrato, agenda conforme extras e módulos CRM.

### Floating
- [ ] Ações rápidas respeitam as mesmas chaves (disabled / oculto).

### Grupos WhatsApp
- [ ] Criar grupo só com `chat.create_group`; painel CRM com `manage_*` conforme Fase 3.

---

## Pedidos HTTP úteis (debug)

```http
GET /api/chat/conversations?instanceId=<uuid>&inboxScope=tenant&attendanceFilter=queue
```

Esperado sem `chat.view_queue`: **403** `{ "error": "Sem permissão para ver a fila de atendimento." }`.

```http
GET /api/chat/conversations/attendance-counts?instanceIds=<uuid>&inboxScope=tenant
```

Esperado sem `chat.view_queue`: `queue`, `team`, `unassigned` = **0** (mine/closed/unread mantêm-se conforme dados).

---

## Transferência (perfil lateral)

- UI “Transferir atendimento” só quando há permissão CRM `chat.transfer_attendance` **e** regras de negócio (atribuído / admin).
- PATCH atendimento sem permissão → **403** (backend já aplicado na Fase 3).
