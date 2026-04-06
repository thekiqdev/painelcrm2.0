-- Garantir que a constraint UNIQUE(instance_id, external_chat_id) existe
-- Esta constraint é necessária para o ON CONFLICT funcionar corretamente

-- Verificar se a constraint já existe antes de criar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'chat_conversations_instance_id_external_chat_id_key'
    AND conrelid = 'chat_conversations'::regclass
  ) THEN
    -- Criar constraint única se não existir
    ALTER TABLE public.chat_conversations
      ADD CONSTRAINT chat_conversations_instance_id_external_chat_id_key 
      UNIQUE (instance_id, external_chat_id);
  END IF;
END $$;

-- Alternativa: se a constraint não existir com esse nome, tentar criar diretamente
-- (pode falhar se já existir com outro nome, mas é seguro)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'chat_conversations'::regclass
    AND contype = 'u'
    AND (
      (conkey::int[] = ARRAY[
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'chat_conversations'::regclass AND attname = 'instance_id'),
        (SELECT attnum FROM pg_attribute WHERE attrelid = 'chat_conversations'::regclass AND attname = 'external_chat_id')
      ]::int[])
    )
  ) THEN
    -- Tentar criar a constraint única
    BEGIN
      ALTER TABLE public.chat_conversations
        ADD CONSTRAINT chat_conversations_instance_id_external_chat_id_key 
        UNIQUE (instance_id, external_chat_id);
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint já existe com outro nome, tudo bem
      NULL;
    END;
  END IF;
END $$;

