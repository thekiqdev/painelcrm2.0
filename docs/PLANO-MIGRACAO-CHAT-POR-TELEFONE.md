# Plano de Migração: Chat Baseado em Número de Telefone

## Problema Atual

1. **Constraint atual**: `UNIQUE(instance_id, external_chat_id)`
   - Cada instância cria sua própria conversa para o mesmo número
   - Ao desconectar/reconectar, uma nova conversa é criada
   - Mensagens ficam fragmentadas entre múltiplas conversas
   - Histórico é perdido ao trocar de instância

2. **Estrutura atual**:
   - `chat_conversations.instance_id` é obrigatório e parte da chave única
   - Conversas são criadas por instância, não por número
   - Mensagens são vinculadas a `conversation_id` que muda entre instâncias

## Solução Proposta

### 1. Nova Estrutura de Dados

**Chave única**: `UNIQUE(user_id, instance_phone_normalizado, contact_phone_normalizado)`
- Uma conversa única por combinação: (número conectado na instância + número do contato)
- Se admin tem 2 números WhatsApp (ex: 5511981169950 e 5511999999999) e mesmo cliente fala com ambos, aparecem 2 conversas separadas
- `instance_id` vira campo de referência (última instância que recebeu mensagem)
- Histórico completo preservado por número conectado
- Permite rastrear de qual número do admin veio cada conversa

### 2. Mudanças no Banco de Dados

#### Migration 18: Alterar constraint e estrutura

```sql
-- 1. Adicionar coluna connected_phone_number na tabela chat_instances
ALTER TABLE chat_instances 
  ADD COLUMN IF NOT EXISTS connected_phone_number TEXT;

-- 2. Extrair número conectado do metadata existente (se houver)
UPDATE chat_instances 
SET connected_phone_number = 
  CASE 
    WHEN metadata->>'phone' IS NOT NULL THEN regexp_replace(metadata->>'phone', '\D', '', 'g')
    WHEN metadata->>'connectedPhone' IS NOT NULL THEN regexp_replace(metadata->>'connectedPhone', '\D', '', 'g')
    WHEN metadata->>'number' IS NOT NULL THEN regexp_replace(metadata->>'number', '\D', '', 'g')
    ELSE NULL
  END
WHERE connected_phone_number IS NULL;

-- 3. Adicionar colunas na tabela chat_conversations
ALTER TABLE chat_conversations 
  ADD COLUMN IF NOT EXISTS instance_phone_normalizado TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone_normalizado TEXT;

-- 4. Popular colunas normalizadas com valores existentes
UPDATE chat_conversations c
SET 
  instance_phone_normalizado = regexp_replace(COALESCE(i.connected_phone_number, ''), '\D', '', 'g'),
  contact_phone_normalizado = regexp_replace(COALESCE(c.phone_number, ''), '\D', '', 'g')
FROM chat_instances i
WHERE c.instance_id = i.id
  AND (c.instance_phone_normalizado IS NULL OR c.contact_phone_normalizado IS NULL);

-- 5. Remover constraint antiga
ALTER TABLE chat_conversations 
  DROP CONSTRAINT IF EXISTS chat_conversations_instance_id_external_chat_id_key;

-- 6. Criar nova constraint única baseada em user_id + instance_phone + contact_phone
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_conversations_user_instance_contact_phone 
  ON chat_conversations(user_id, instance_phone_normalizado, contact_phone_normalizado) 
  WHERE instance_phone_normalizado IS NOT NULL 
    AND instance_phone_normalizado <> ''
    AND contact_phone_normalizado IS NOT NULL 
    AND contact_phone_normalizado <> '';

-- 7. Criar índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_chat_conversations_instance_phone 
  ON chat_conversations(instance_phone_normalizado) 
  WHERE instance_phone_normalizado IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_conversations_contact_phone 
  ON chat_conversations(contact_phone_normalizado) 
  WHERE contact_phone_normalizado IS NOT NULL;

-- 8. Consolidar conversas duplicadas (mesmo user_id + instance_phone + contact_phone, diferentes instance_id)
-- Manter a conversa mais antiga e migrar mensagens
DO $$
DECLARE
  dup_record RECORD;
  target_conv_id UUID;
  source_conv_ids UUID[];
BEGIN
  FOR dup_record IN 
    SELECT 
      user_id,
      instance_phone_normalizado,
      contact_phone_normalizado,
      array_agg(id ORDER BY created_at) as conversation_ids,
      min(created_at) as oldest_created_at
    FROM chat_conversations
    WHERE instance_phone_normalizado IS NOT NULL 
      AND instance_phone_normalizado <> ''
      AND contact_phone_normalizado IS NOT NULL 
      AND contact_phone_normalizado <> ''
    GROUP BY user_id, instance_phone_normalizado, contact_phone_normalizado
    HAVING count(*) > 1
  LOOP
    -- Pegar a primeira conversa (mais antiga) como target
    SELECT id INTO target_conv_id 
    FROM chat_conversations 
    WHERE user_id = dup_record.user_id 
      AND instance_phone_normalizado = dup_record.instance_phone_normalizado
      AND contact_phone_normalizado = dup_record.contact_phone_normalizado
    ORDER BY created_at ASC 
    LIMIT 1;
    
    -- Pegar IDs das outras conversas para migrar
    SELECT array_agg(id) INTO source_conv_ids
    FROM chat_conversations
    WHERE user_id = dup_record.user_id 
      AND instance_phone_normalizado = dup_record.instance_phone_normalizado
      AND contact_phone_normalizado = dup_record.contact_phone_normalizado
      AND id != target_conv_id;
    
    -- Migrar mensagens das conversas duplicadas para a conversa principal
    UPDATE chat_messages
    SET conversation_id = target_conv_id
    WHERE conversation_id = ANY(source_conv_ids);
    
    -- Atualizar a conversa principal com dados mais recentes
    UPDATE chat_conversations c
    SET 
      instance_id = (
        SELECT instance_id 
        FROM chat_conversations 
        WHERE id = ANY(source_conv_ids)
        ORDER BY last_message_at DESC NULLS LAST, updated_at DESC
        LIMIT 1
      ),
      external_fast_id = COALESCE(
        (SELECT external_fast_id FROM chat_conversations WHERE id = ANY(source_conv_ids) AND external_fast_id IS NOT NULL LIMIT 1),
        c.external_fast_id
      ),
      contact_name = COALESCE(
        (SELECT contact_name FROM chat_conversations WHERE id = ANY(source_conv_ids) AND contact_name IS NOT NULL LIMIT 1),
        c.contact_name
      ),
      profile_name = COALESCE(
        (SELECT profile_name FROM chat_conversations WHERE id = ANY(source_conv_ids) AND profile_name IS NOT NULL LIMIT 1),
        c.profile_name
      ),
      last_message_preview = COALESCE(
        (SELECT last_message_preview FROM chat_conversations WHERE id = ANY(source_conv_ids) AND last_message_preview IS NOT NULL ORDER BY last_message_at DESC LIMIT 1),
        c.last_message_preview
      ),
      last_message_at = GREATEST(
        c.last_message_at,
        (SELECT MAX(last_message_at) FROM chat_conversations WHERE id = ANY(source_conv_ids))
      ),
      unread_count = (
        SELECT SUM(unread_count) FROM chat_conversations WHERE id = ANY(source_conv_ids) OR id = target_conv_id
      ),
      updated_at = now()
    WHERE id = target_conv_id;
    
    -- Deletar conversas duplicadas
    DELETE FROM chat_conversations WHERE id = ANY(source_conv_ids);
  END LOOP;
END $$;
```

### 3. Mudanças no Backend

#### 3.1. Função `upsertConversation`

**Antes**: Buscava por `(instance_id, external_chat_id)`
**Depois**: Buscar por `(user_id, instance_phone_normalizado, contact_phone_normalizado)`

```typescript
async function upsertConversation(
  instance: ChatInstanceRow,
  chatData: ReturnType<typeof normalizeChatPayload>
) {
  // 1. Obter número conectado na instância
  const instanceResult = await pool.query(
    'SELECT connected_phone_number FROM chat_instances WHERE id = $1',
    [instance.id]
  );
  const instancePhone = instanceResult.rows[0]?.connected_phone_number 
    ? normalizePhoneNumber(instanceResult.rows[0].connected_phone_number)
    : null;
  
  // 2. Normalizar telefone do contato
  const contactPhone = normalizePhoneNumber(chatData.phoneNumber);
  
  if (!contactPhone) {
    // Se não tem telefone do contato, manter comportamento antigo (por external_chat_id)
    // Mas isso não deveria acontecer em produção
    return null;
  }
  
  if (!instancePhone) {
    // Se instância não tem número conectado ainda, usar fallback
    // Pode acontecer durante conexão inicial
    console.warn('[UpsertConversation] Instance has no connected phone number');
    // Opcional: tentar extrair do metadata ou usar instance_id como fallback temporário
  }
  
  // 3. Buscar conversa existente pela combinação (user_id, instance_phone, contact_phone)
  const existingConv = await pool.query(
    `SELECT id FROM chat_conversations 
     WHERE user_id = $1 
       AND instance_phone_normalizado = $2
       AND contact_phone_normalizado = $3`,
    [instance.user_id, instancePhone, contactPhone]
  );
  
  if (existingConv.rowCount > 0) {
    // Atualizar conversa existente
    const conversationId = existingConv.rows[0].id;
    // Atualizar instance_id para a instância atual (última que recebeu mensagem)
    // Atualizar outros campos se necessário
  } else {
    // Criar nova conversa
    // Com constraint única em (user_id, instance_phone_normalizado, contact_phone_normalizado)
  }
}
```

#### 3.2. Função `saveMessage`

**Mudança**: Buscar `conversation_id` pela combinação (instance_phone, contact_phone) antes de salvar

```typescript
async function saveMessage(
  instanceId: string,
  contactPhoneNumber: string, // telefone do contato
  direction: 'incoming' | 'outgoing',
  payload: {...}
) {
  // 1. Obter número conectado na instância
  const instanceResult = await pool.query(
    'SELECT user_id, connected_phone_number FROM chat_instances WHERE id = $1',
    [instanceId]
  );
  if (instanceResult.rowCount === 0) {
    throw new Error('Instance not found');
  }
  
  const userId = instanceResult.rows[0].user_id;
  const instancePhone = normalizePhoneNumber(instanceResult.rows[0].connected_phone_number);
  const contactPhone = normalizePhoneNumber(contactPhoneNumber);
  
  if (!instancePhone || !contactPhone) {
    throw new Error('Phone numbers required');
  }
  
  // 2. Buscar conversa pela combinação (user_id, instance_phone, contact_phone)
  const conv = await pool.query(
    `SELECT id FROM chat_conversations 
     WHERE user_id = $1 
       AND instance_phone_normalizado = $2
       AND contact_phone_normalizado = $3`,
    [userId, instancePhone, contactPhone]
  );
  
  if (conv.rowCount === 0) {
    // Se não encontrou, criar conversa (ou lançar erro se não deveria criar aqui)
    throw new Error('Conversation not found. Create conversation first.');
  }
  
  const conversationId = conv.rows[0].id;
  
  // 3. Salvar mensagem na conversa encontrada
  // ... resto da lógica de saveMessage
}
```

#### 3.3. Atualizar `connectInstance` para salvar número conectado

```typescript
export async function connectInstance(req: AuthRequest, res: Response) {
  // ... código existente ...
  
  const response = await uazapiService.connectInstance(...);
  
  // Extrair número conectado da resposta da UazAPI
  const connectedPhone = response?.phone 
    || response?.number 
    || response?.connectedPhone
    || data.phone; // fallback para o phone passado no body
  
  const normalizedConnectedPhone = normalizePhoneNumber(connectedPhone);
  
  // Atualizar instância com número conectado
  await pool.query(
    `
    UPDATE chat_instances
    SET 
      status = $1,
      connected_phone_number = $2,
      metadata = metadata || $3::jsonb,
      updated_at = now()
    WHERE id = $4
    `,
    [
      response?.status || 'connecting',
      normalizedConnectedPhone,
      JSON.stringify({ lastConnect: response }),
      instance.id
    ]
  );
  
  // ... resto do código ...
}
```

### 4. Mudanças no Frontend

#### 4.1. Buscar conversas por telefone

- Remover filtro por `instanceId` (ou tornar opcional)
- Buscar todas as conversas do usuário, agrupadas por telefone
- Exibir uma conversa única por número

#### 4.2. Exibir histórico completo

- Todas as mensagens de todas as instâncias aparecem na mesma conversa
- Ordenar por data/hora
- Mostrar de qual instância veio (opcional, no metadata)

### 5. Plano de Execução

#### Etapa 1: Preparação (Sem quebrar produção)
- [ ] Criar migration 18 com todas as alterações
- [ ] Adicionar coluna `phone_number_normalizado`
- [ ] Popular coluna com dados existentes
- [ ] Criar índices novos
- [ ] Consolidar conversas duplicadas

#### Etapa 2: Backend - Lógica de Upsert
- [ ] Modificar `upsertConversation` para buscar por telefone
- [ ] Manter fallback para comportamento antigo se necessário
- [ ] Atualizar `saveMessage` para buscar conversa por telefone
- [ ] Testar com dados reais

#### Etapa 3: Backend - Endpoints
- [ ] Atualizar `getConversations` para agrupar por (instance_phone, contact_phone)
- [ ] Atualizar `getClientMessages` para buscar por contact_phone (pode ter múltiplas conversas se cliente falou com diferentes números do admin)
- [ ] Adicionar filtro opcional por `instancePhone` nos endpoints
- [ ] Garantir que todas as queries funcionem com nova estrutura

#### Etapa 4: Frontend
- [ ] Remover dependência de `instanceId` na busca de conversas
- [ ] Atualizar interface para mostrar uma conversa por número
- [ ] Testar exibição de histórico completo

#### Etapa 5: Limpeza (Opcional)
- [ ] Tornar `instance_id` opcional (NULL permitido)
- [ ] Remover constraint antiga completamente
- [ ] Adicionar campo `last_instance_id` para rastreamento

### 6. Considerações Importantes

1. **Compatibilidade**: Manter `instance_id` preenchido para não quebrar queries existentes
2. **Performance**: Índices em `phone_number_normalizado` são essenciais
3. **Dados existentes**: Migration deve consolidar conversas duplicadas automaticamente
4. **Rollback**: Manter backup antes de executar migration
5. **Testes**: Testar com múltiplas instâncias e números diferentes

### 7. Benefícios

✅ Histórico completo preservado por número conectado
✅ Sem duplicação de conversas (mesma combinação instance_phone + contact_phone)
✅ Conversas separadas por número conectado do admin
✅ Se admin tem 2 números e mesmo cliente fala com ambos, aparecem 2 conversas distintas
✅ Mensagens não são perdidas ao trocar de instância (se for o mesmo número)
✅ Melhor integração com CRM (cliente/lead por telefone)
✅ Rastreamento claro de qual número do admin recebeu cada mensagem
✅ Interface permite filtrar por número conectado

