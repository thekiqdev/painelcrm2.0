# Plano: Vincular Conversas ao Número do WhatsApp (Card como Armazenador)

## Objetivo
Fazer com que o **card de Detalhes da Instância** seja o armazenador das conversas para aquele número, gerando uma **chave única** baseada no número conectado. Quando uma nova instância for criada com o mesmo número, ela herdará automaticamente as conversas da chave única. As conversas serão deletadas quando o card da instância for excluído.

## Situação Atual

### Estrutura do Banco de Dados
- **`chat_instances`**: Armazena instâncias do WhatsApp
  - `id` (UUID): Identificador único da instância
  - `metadata` (JSONB): Contém `connectedPhone` (número conectado)
  - `status`: Status da instância (connected, disconnected, etc.)

- **`chat_conversations`**: Armazena conversas
  - `instance_id` (UUID): FK para `chat_instances` (OBRIGATÓRIA)
  - `phone_number` (TEXT): Número do contato da conversa
  - `user_id` (UUID): Usuário dono da conversa
  - Constraint: `UNIQUE(instance_id, external_chat_id)`

### Problema Identificado
1. Conversas estão vinculadas apenas à `instance_id`
2. Se uma instância cair e for criada outra com o mesmo número, as conversas antigas ficam "órfãs"
3. Não há forma de recuperar conversas antigas quando uma nova instância é conectada
4. Quando excluir o card da instância, as conversas são deletadas (ON DELETE CASCADE)

## Solução Proposta (CARD COMO ARMAZENADOR)

### Princípio
**Criar uma chave única baseada no número conectado (`user_id + normalized_phone`) e vincular conversas a essa chave. Quando uma nova instância for criada com o mesmo número, ela herdará automaticamente as conversas vinculadas à chave única.**

### Passo 1: Adicionar Coluna `connected_phone` e `phone_key` na Tabela `chat_instances`
**Arquivo**: `database/init/19_add_connected_phone_to_instances.sql`

**Ação**: 
- Adicionar coluna `connected_phone` (TEXT) para armazenar o número conectado
- Adicionar coluna `phone_key` (TEXT) para armazenar a chave única (`user_id + normalized_phone`)
- Criar índices para busca rápida

**SQL**:
```sql
-- Adicionar coluna connected_phone na tabela chat_instances
ALTER TABLE public.chat_instances
  ADD COLUMN IF NOT EXISTS connected_phone TEXT;

-- Adicionar coluna phone_key (chave única: user_id + normalized_phone)
ALTER TABLE public.chat_instances
  ADD COLUMN IF NOT EXISTS phone_key TEXT;

-- Criar índice para melhorar performance nas buscas por número conectado
CREATE INDEX IF NOT EXISTS idx_chat_instances_connected_phone 
  ON public.chat_instances(connected_phone) 
  WHERE connected_phone IS NOT NULL;

-- Criar índice único para phone_key (garante uma instância ativa por número por usuário)
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_instances_phone_key_unique 
  ON public.chat_instances(user_id, phone_key) 
  WHERE phone_key IS NOT NULL;

-- Criar índice composto para buscar instâncias ativas por número
CREATE INDEX IF NOT EXISTS idx_chat_instances_user_phone_status 
  ON public.chat_instances(user_id, connected_phone, status) 
  WHERE connected_phone IS NOT NULL;
```

### Passo 2: Atualizar `connected_phone` e `phone_key` ao Conectar Instância
**Arquivo**: `packages/backend/src/controllers/chatController.ts`

**Funções a modificar**:
1. `connectInstance`: Atualizar `connected_phone` e `phone_key` quando instância for conectada
2. `getInstanceStatus`: Atualizar `connected_phone` e `phone_key` quando status for verificado

**Lógica**:
- Quando `connectedPhone` for extraído do metadata:
  - Normalizar o número
  - Salvar na coluna `connected_phone`
  - Gerar `phone_key` = `user_id + ':' + normalized_phone`
  - Salvar `phone_key` na coluna `phone_key`
- Manter o `metadata.connectedPhone` para compatibilidade

**Código** (exemplo):
```typescript
// Após extrair connectedPhone do metadata
if (connectedPhone) {
  updatedMetadata.connectedPhone = connectedPhone;
  const normalizedPhone = normalizePhoneNumber(connectedPhone);
  
  if (normalizedPhone) {
    // Gerar chave única: user_id + ':' + normalized_phone
    const phoneKey = `${instance.user_id}:${normalizedPhone}`;
    
    // NOVO: Atualizar connected_phone e phone_key
    await pool.query(
      'UPDATE chat_instances SET connected_phone = $1, phone_key = $2 WHERE id = $3',
      [normalizedPhone, phoneKey, instance.id]
    );
  }
}
```

### Passo 3: Adicionar Coluna `phone_key` na Tabela `chat_conversations`
**Arquivo**: `database/init/19_add_connected_phone_to_instances.sql`

**Ação**: Adicionar coluna `phone_key` (TEXT) na tabela `chat_conversations` para vincular conversas à chave única do número conectado.

**SQL**:
```sql
-- Adicionar coluna phone_key na tabela chat_conversations
ALTER TABLE public.chat_conversations
  ADD COLUMN IF NOT EXISTS phone_key TEXT;

-- Criar índice para melhorar performance nas buscas por phone_key
CREATE INDEX IF NOT EXISTS idx_chat_conversations_phone_key 
  ON public.chat_conversations(phone_key) 
  WHERE phone_key IS NOT NULL;

-- Criar índice composto para buscar conversas por user_id e phone_key
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_phone_key 
  ON public.chat_conversations(user_id, phone_key) 
  WHERE phone_key IS NOT NULL;
```

### Passo 4: Atualizar `upsertConversation` para Salvar `phone_key`
**Arquivo**: `packages/backend/src/controllers/chatController.ts`

**Função a modificar**: `upsertConversation`

**Lógica**:
- Quando criar/atualizar uma conversa:
  - Buscar o `phone_key` da instância atual
  - Salvar `phone_key` na conversa
  - Isso vincula a conversa à chave única do número conectado

**Código** (exemplo):
```typescript
// Dentro de upsertConversation, antes de INSERT/UPDATE
const instanceResult = await pool.query(
  'SELECT phone_key FROM chat_instances WHERE id = $1',
  [instance.id]
);
const phoneKey = instanceResult.rows[0]?.phone_key || null;

// No INSERT:
await pool.query(
  `INSERT INTO chat_conversations (
    user_id, instance_id, external_chat_id, external_fast_id,
    contact_name, profile_name, phone_number, status,
    last_message_preview, last_message_at, unread_count, metadata,
    client_id, phone_key
  )
  VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'open'), $9, $10, COALESCE($11, 0), $12::jsonb, $13, $14)
  RETURNING *`,
  [..., phoneKey]
);

// No UPDATE:
await pool.query(
  `UPDATE chat_conversations SET
    ...,
    phone_key = $N
   WHERE ...`,
  [..., phoneKey]
);
```

### Passo 5: Criar Função de Herança de Conversas
**Arquivo**: `packages/backend/src/controllers/chatController.ts`

**Nova função**: `inheritConversationsFromPhoneKey`
- Buscar todas as conversas vinculadas ao `phone_key` da nova instância
- Atualizar `instance_id` dessas conversas para a nova instância
- Isso faz com que a nova instância "herde" as conversas antigas

**Lógica**:
1. Quando uma instância for conectada com sucesso e `phone_key` for gerado
2. Buscar todas as conversas do mesmo `user_id` com o mesmo `phone_key` mas `instance_id` diferente
3. Atualizar `instance_id` dessas conversas para a nova instância
4. Isso faz com que as conversas antigas apareçam na nova instância

**Código** (exemplo):
```typescript
async function inheritConversationsFromPhoneKey(
  userId: string,
  newInstanceId: string,
  phoneKey: string
) {
  if (!phoneKey) return;

  console.log(`[InheritConversations] Herdando conversas para instância ${newInstanceId} com phone_key ${phoneKey}`);

  // Buscar todas as conversas do mesmo user_id e phone_key, mas de outras instâncias
  const result = await pool.query(
    `UPDATE chat_conversations 
     SET instance_id = $1, updated_at = now()
     WHERE user_id = $2 
       AND phone_key = $3
       AND instance_id != $1
     RETURNING id, phone_number`,
    [newInstanceId, userId, phoneKey]
  );

  if (result.rows.length > 0) {
    console.log(`[InheritConversations] ${result.rows.length} conversas herdadas para instância ${newInstanceId}`);
  }

  return result.rows.length;
}
```

### Passo 6: Chamar Herança de Conversas ao Conectar Instância
**Arquivo**: `packages/backend/src/controllers/chatController.ts`

**Modificar**: `connectInstance` e `getInstanceStatus`

**Lógica**:
- Após atualizar `connected_phone` e `phone_key` com sucesso
- Chamar `inheritConversationsFromPhoneKey` automaticamente
- Executar em background (não bloquear resposta)

**Código** (exemplo):
```typescript
// Após salvar connected_phone e phone_key
if (connectedPhone) {
  const normalizedPhone = normalizePhoneNumber(connectedPhone);
  if (normalizedPhone) {
    const phoneKey = `${instance.user_id}:${normalizedPhone}`;
    
    // Atualizar colunas connected_phone e phone_key
    await pool.query(
      'UPDATE chat_instances SET connected_phone = $1, phone_key = $2 WHERE id = $3',
      [normalizedPhone, phoneKey, instance.id]
    );
    
    // NOVO: Herdar conversas vinculadas ao phone_key (em background)
    inheritConversationsFromPhoneKey(instance.user_id, instance.id, phoneKey)
      .catch(err => console.error('Erro ao herdar conversas:', err));
  }
}
```

### Passo 7: Atualizar Constraint UNIQUE de `chat_conversations` (Opcional)
**Arquivo**: `database/init/19_add_connected_phone_to_instances.sql`

**Ação**: 
- A constraint atual `UNIQUE(instance_id, external_chat_id)` pode ser mantida
- OU podemos criar uma constraint alternativa baseada em `phone_key` e `external_chat_id`
- Isso depende se queremos permitir múltiplas instâncias com mesmo número (não recomendado)

**Nota**: Manter constraint atual é mais seguro e simples.

## Vantagens desta Solução

1. **Card como Armazenador**: O card da instância é o responsável por armazenar conversas do número
2. **Chave Única**: `phone_key` garante identificação única por número conectado
3. **Herança Automática**: Nova instância com mesmo número herda conversas automaticamente
4. **Simples**: Adiciona apenas 2 colunas (`connected_phone` e `phone_key`)
5. **Compatível**: Funciona com sistema atual sem quebrar nada
6. **Automática**: Herança acontece automaticamente ao conectar
7. **Deleção Controlada**: Ao excluir card, conversas são deletadas (ON DELETE CASCADE)

## Riscos e Mitigações

### Risco 1: Duplicação de Conversas ao Herdar
**Mitigação**: 
- A constraint `UNIQUE(instance_id, external_chat_id)` previne duplicação na mesma instância
- Ao herdar, apenas atualizamos `instance_id`, não criamos duplicatas

### Risco 2: Performance ao Herdar Muitas Conversas
**Mitigação**: 
- Executar herança em background
- UPDATE em lote é eficiente no PostgreSQL
- Adicionar logs para monitoramento

### Risco 3: Instâncias Antigas sem `phone_key`
**Mitigação**: 
- Herança só funciona se `phone_key` estiver preenchido
- Pode executar script de backfill para preencher `phone_key` de instâncias antigas baseado no `metadata.connectedPhone`

### Risco 4: Múltiplas Instâncias com Mesmo Número
**Mitigação**: 
- Constraint `UNIQUE(user_id, phone_key)` previne múltiplas instâncias ativas com mesmo número
- Se necessário, pode adicionar validação no frontend

## Ordem de Implementação

1. ✅ Criar migration SQL (Passos 1 e 3)
   - Adicionar `connected_phone` e `phone_key` em `chat_instances`
   - Adicionar `phone_key` em `chat_conversations`
   - Criar índices necessários

2. ✅ Atualizar `connectInstance` e `getInstanceStatus` (Passo 2)
   - Salvar `connected_phone` e `phone_key` ao conectar

3. ✅ Atualizar `upsertConversation` (Passo 4)
   - Salvar `phone_key` nas conversas

4. ✅ Criar função `inheritConversationsFromPhoneKey` (Passo 5)

5. ✅ Chamar herança ao conectar instância (Passo 6)

6. ⚠️ (Opcional) Script de backfill para instâncias antigas
   - Preencher `phone_key` de instâncias antigas baseado no `metadata.connectedPhone`

## Testes Sugeridos

1. **Teste 1**: Criar instância A, conectar com número X, criar conversas
   - Verificar se `phone_key` foi gerado
   - Verificar se conversas têm `phone_key` preenchido

2. **Teste 2**: Excluir instância A, criar instância B, conectar com número X
   - Verificar se `phone_key` da instância B é igual ao da instância A
   - Verificar se conversas antigas foram herdadas (se não foram deletadas)

3. **Teste 3**: Criar instância B com mesmo número enquanto instância A ainda existe
   - Verificar se conversas da instância A são herdadas pela instância B
   - Verificar se constraint `UNIQUE(user_id, phone_key)` funciona

4. **Teste 4**: Excluir card da instância
   - Verificar se conversas são deletadas (ON DELETE CASCADE)

5. **Teste 5**: Enviar nova mensagem na instância B e verificar se histórico está completo

## Notas Finais

- **Card como Armazenador**: O card da instância é o responsável por armazenar conversas do número conectado
- **Chave Única**: `phone_key = user_id + ':' + normalized_phone` garante identificação única
- **Herança Automática**: Quando criar nova instância com mesmo número, conversas são herdadas automaticamente
- **Deleção Controlada**: Ao excluir card, conversas são deletadas (comportamento desejado)
- Mantém **compatibilidade total** com sistema atual
- Pode ser implementada **incrementalmente** (passo a passo)
- **Não quebra** funcionalidades existentes

## Fluxo Visual

```
ANTES:
Instância A (número: 11999999999, phone_key: user123:11999999999) → Conversas vinculadas
Excluir Instância A ❌ → Conversas deletadas ❌
Instância B (número: 11999999999, phone_key: user123:11999999999) → Conversas NÃO aparecem ❌

DEPOIS:
Instância A (número: 11999999999, phone_key: user123:11999999999) → Conversas vinculadas com phone_key
Criar Instância B (número: 11999999999, phone_key: user123:11999999999) → Sistema detecta mesmo phone_key
                                                                          → Herda conversas automaticamente ✅
                                                                          → Conversas aparecem na Instância B ✅
Excluir Instância B ❌ → Conversas deletadas (comportamento esperado) ✅
```

