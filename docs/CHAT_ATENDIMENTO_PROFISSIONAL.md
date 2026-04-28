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
