# Chat — Atendimento profissional (Fase 5)

## Visão geral

A Fase 5 organiza o atendimento por **filas**, **equipes** (tabela `teams` existente), **responsável**, **status** da conversa, **transferências** com histórico (`chat_conversation_transfers`), **métricas** (`GET /api/chat/metrics`) e **notificações** (`chat_assigned`, `chat_transferred`) ao destino relevante.

## Status da conversa (`attendance_status`)

| Valor | Significado resumido |
|-------|----------------------|
| `open` | Aberta sem tratamento final definido |
| `pending` | Aguardando atendimento / fila |
| `in_progress` | Em atendimento por um responsável |
| `waiting_customer` | Aguardando resposta do cliente |
| `closed` | Encerrada |
| `archived` | Arquivada |

Compatibilidade leve na UI com valores antigos (`in_service`, `unassigned`, `queued`).

## Filas

- Tabela `chat_queues` (tenant-scoped).
- Configuração mínima na UI: **Configurações → Chat e atendimento** (`section=chatAttendance`).
- Atribuição de fila via `PATCH /api/chat/conversations/:id/queue` ou `action: queue` em `PATCH …/attendance`.

## Equipes

- Reutiliza **Equipes** globais do CRM (`teams`, `team_members`).
- Papel extra no membro: `supervisor` (além de `lead` e `member`).
- Transferência para equipa: fluxo existente + histórico Fase 5.

## Transferências

- Histórico canónico: `chat_conversation_transfers` (origens/destinos user/team/queue).
- Auditoria legada: `chat_conversation_assignment_history` continua a ser escrita pelas operações de atendimento.

## Realtime

Além de `conversation_attendance_updated`, em eventos relevantes são emitidos (Socket.IO):

- `assignment.changed`
- `conversation.transferred`
- `conversation.status_changed`

Payload inclui `conversation_id`, ids de atribuição/fila/equipe e `status` quando aplicável.

## Critérios de aceite (checklist)

- [x] Migração incremental segura (`185_*`)
- [x] Filas CRUD + métricas + histórico transferências
- [x] Status normalizados + atualização em mensagens (SLA básico)
- [x] Lista Chat: filtros Todas, Minhas, Equipe, Fila, Não atribuídas, Aguard. cliente, Encerradas
- [x] Configurações: entrada “Chat e atendimento” + filas; link para equipes
- [x] Permissões granulares via `chatAccess` + `module_extras`
- [x] Build backend/frontend

Melhorias opcionais futuras: painel lateral com histórico de transferências ligado à API, cartões de métricas dentro do Chat, UI para `module_extras` do chat por perfil.

---

## Fase 7 — Interface operacional do atendimento

### Telas

- **Chat (`/chat`)**: bloco **Atendimento** com cartões (conversas abertas, aguardando, em atendimento, SLA em risco, SLA vencido, tempos médios), lista **Atendentes** e filtro da lista ao tocar nos cartões.
- **Badges** na lista de conversas (máx. 2 por conversa): SLA em risco / vencido, sem responsável, aguardando cliente, cliente aguarda resposta.
- **Configurações → Chat e atendimento** (`/settings?section=chatAttendance`): abas **Filas**, **Equipes**, **SLA**, **Automação**, **Regras** (histórico de automações no separador Automação).

### APIs relevantes

- `GET /api/chat/operations-dashboard` — resumo operacional, contexto SLA, por fila, atendentes; logs de automação quando o utilizador tem `view_metrics` ou gestão de filas/automação.
- `GET /api/chat/automation/logs` — histórico (`chat_automation_logs`, migração `189` / Supabase `20260528120000_*`).
- CRUD de filas e distribuição: `GET/PATCH /api/chat/queues`, `PUT /api/chat/automation/queues/:id/distribution`.
- Regras: `GET/POST/PATCH/DELETE /api/chat/automation/rules`.

### Permissões

- Visualização de conversas e painel básico: `chat.view` (módulo chat).
- Métricas completas / logs: extras `chat_view_metrics` ou gestão (`manage_queues`, `manage_automation`) conforme `chatAccess`.
- Edição de filas, SLA global, regras e distribuição: gestão de automação/filas no backend; na UI usa-se tipicamente **edição do módulo Chat** (`can_edit`).

### Critérios de aceite (Fase 7)

- Painel operacional e filtros por cartão funcionando; badges na lista; atendentes com carga; abas em Configurações; regras criáveis pela UI; histórico visível com migração aplicada; layout utilizável em mobile (cartões horizontais no painel, regras em cards no telefone, botão **Nova regra** fixo em ecrãs pequenos).

### Realtime

- Eventos de conversa/atribuição disparam *debounce* e recarregam o painel (`operations-dashboard`) sem recalcular tudo no cliente.
