## Modelo atual (tabelas de chat)

- **chat_instances**
  - `id`, `user_id`, `name`, `external_instance_name`, `instance_token`, `status`, `metadata`, `created_at`, `updated_at`
- **chat_conversations**
  - `id`, `user_id`, `instance_id`, `client_id`, `external_chat_id`, `external_fast_id`
  - `contact_name`, `profile_name`, `phone_number`
  - `status` (padrão `'open'`)
  - `last_message_preview`, `last_message_at`, `unread_count`
  - `metadata`, `created_at`, `updated_at`
  - **UNIQUE** em `(instance_id, external_chat_id)`
- **chat_messages**
  - `id`, `conversation_id`, `direction` (`incoming`/`outgoing`), `external_message_id`
  - `body`, `media`, `status`, `sent_at`, `metadata`, `created_at`

## Objetivo do novo modelo

- Tratar **conversa** como “contato + canal (número / JID)” e **não** como “instância específica”.
- Permitir:
  - múltiplos atendentes;
  - transferência de chats;
  - histórico contínuo mesmo se o mesmo número for conectado em outra instância.

## Campos planejados em `chat_conversations`

> Estes campos serão adicionados em uma etapa futura (migração de banco na Etapa 2).

- **Responsável / atribuição**
  - `assigned_to UUID NULL` → usuário atualmente responsável pela conversa.
  - `queue TEXT NULL` → fila/time lógico (ex.: `"suporte"`, `"comercial"`).
- **Status de atendimento** (diferente de status técnico do WhatsApp)
  - Reuso do campo existente `status TEXT`, com semântica mais clara:
    - valores previstos: `'open'`, `'waiting'`, `'pending_customer'`, `'resolved'`, `'closed'`.
- **Auditoria simples de atribuição**
  - `last_assigned_at TIMESTAMPTZ NULL`
  - `last_assigned_by UUID NULL` → quem atribuiu/transferiu por último.

> A chave técnica `(instance_id, external_chat_id)` permanecerá por enquanto, mas a lógica de listagem passará a considerar **sempre `user_id` + número/JID** como referência funcional.

## Tabela planejada de eventos de conversa

> Também será criada numa migração futura; ainda **não** existe no banco.

`chat_conversation_events`:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE`
- `type TEXT NOT NULL`
  - exemplos: `'created'`, `'assigned'`, `'transferred'`, `'status_changed'`, `'closed'`
- `from_user_id UUID NULL`
- `to_user_id UUID NULL`
- `payload JSONB DEFAULT '{}'::jsonb`
  - detalhes adicionais (motivo da transferência, fila de origem/destino, etc.)
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

## Decisão de chave funcional da conversa

- **Chave funcional**: `user_id + external_chat_id` (número/JID).
- **Instância**:
  - continua salva em `instance_id` para saber por qual canal/número a conversa está sendo atendida;
  - **não será usada** como filtro primário na lista principal de conversas.

## Próximos passos (para Etapa 2)

- Criar migração SQL que:
  - adiciona os campos `assigned_to`, `queue`, `last_assigned_at`, `last_assigned_by` em `chat_conversations`;
  - cria a tabela `chat_conversation_events`.
- Ajustar `chatController` para:
  - popular esses campos quando apropriado;
  - **sem** quebrar o comportamento atual (valores `NULL`/defaults devem manter o fluxo existente.


