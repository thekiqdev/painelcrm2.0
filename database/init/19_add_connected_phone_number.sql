-- Migration 19: Adicionar coluna connected_phone_number na tabela chat_instances
-- Migration separada para garantir que a coluna seja criada mesmo se a migration 18 não foi executada

-- 1. Adicionar coluna connected_phone_number na tabela chat_instances
ALTER TABLE chat_instances 
  ADD COLUMN IF NOT EXISTS connected_phone_number TEXT;

-- 2. Extrair número conectado do metadata existente (se houver)
UPDATE chat_instances 
SET connected_phone_number = 
  CASE 
    WHEN metadata->>'phone' IS NOT NULL AND metadata->>'phone' <> '' THEN regexp_replace(metadata->>'phone', '\D', '', 'g')
    WHEN metadata->>'connectedPhone' IS NOT NULL AND metadata->>'connectedPhone' <> '' THEN regexp_replace(metadata->>'connectedPhone', '\D', '', 'g')
    WHEN metadata->>'number' IS NOT NULL AND metadata->>'number' <> '' THEN regexp_replace(metadata->>'number', '\D', '', 'g')
    WHEN metadata->'lastConnect'->>'phone' IS NOT NULL AND metadata->'lastConnect'->>'phone' <> '' THEN regexp_replace(metadata->'lastConnect'->>'phone', '\D', '', 'g')
    ELSE NULL
  END
WHERE connected_phone_number IS NULL;

-- 3. Criar índice para melhorar performance nas buscas
CREATE INDEX IF NOT EXISTS idx_chat_instances_connected_phone 
  ON chat_instances(connected_phone_number) 
  WHERE connected_phone_number IS NOT NULL;

