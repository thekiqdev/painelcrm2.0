# Migração: Adicionar Colunas ao Chat

Este documento descreve as migrations necessárias para adicionar funcionalidades de vínculo de conversas com clientes e leads.

## Migration 17: Adicionar lead_id

**Arquivo**: `database/init/17_alter_chat_conversations_add_lead_id.sql`

Esta migration adiciona a coluna `lead_id` na tabela `chat_conversations` para permitir vincular conversas a leads.

### Comandos SQL

```sql
-- Adicionar coluna lead_id na tabela chat_conversations para vincular conversas a leads
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance nas buscas por lead_id
CREATE INDEX IF NOT EXISTS idx_chat_conversations_lead_id ON public.chat_conversations(lead_id);

-- Criar índice para melhorar performance nas buscas por client_id (se ainda não existir)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_client_id ON public.chat_conversations(client_id);

-- Criar índice para melhorar performance nas buscas por telefone normalizado
CREATE INDEX IF NOT EXISTS idx_chat_conversations_phone_number ON public.chat_conversations(phone_number);
```

### Como Executar

1. **Via psql (recomendado)**:
   ```bash
   psql -h <host> -U <user> -d <database> -f database/init/17_alter_chat_conversations_add_lead_id.sql
   ```

2. **Via script de migração**:
   - O script `packages/backend/scripts/run-chat-migration.mjs` pode ser atualizado para incluir esta migration

3. **Manual no banco**:
   - Conectar ao banco de dados
   - Executar os comandos SQL acima

### Verificação

Após executar a migration, verifique se a coluna foi criada:

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chat_conversations' 
  AND column_name = 'lead_id';
```

Deve retornar uma linha com `lead_id` do tipo `uuid`.

## Migration 16: Adicionar assigned_to e queue (Opcional)

**Nota**: Esta migration é opcional e só é necessária se você quiser usar funcionalidades de atribuição de conversas e filas.

Se você precisar dessas funcionalidades, crie o arquivo `database/init/16_alter_chat_conversations_add_assignment.sql`:

```sql
-- Adicionar colunas de atribuição
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS queue TEXT,
  ADD COLUMN IF NOT EXISTS last_assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_chat_conversations_assigned_to ON public.chat_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_queue ON public.chat_conversations(queue);
```

## Status Atual

- ✅ `client_id` - Já existe desde a criação da tabela
- ❌ `lead_id` - Precisa ser adicionado via migration 17
- ❌ `assigned_to` - Opcional, não implementado ainda
- ❌ `queue` - Opcional, não implementado ainda

## Comportamento Atual do Sistema

- **Clientes**: O sistema vincula automaticamente conversas a clientes quando encontra um telefone correspondente
- **Leads**: O sistema NÃO vincula automaticamente a leads. Leads devem ser vinculados manualmente após serem criados
- **Mensagens**: Funcionam normalmente mesmo sem as colunas opcionais

## Próximos Passos

1. Executar a migration 17 para adicionar `lead_id`
2. Após a migration, o código já está preparado para usar `lead_id` quando disponível
3. (Opcional) Implementar migration 16 se precisar de atribuição de conversas

