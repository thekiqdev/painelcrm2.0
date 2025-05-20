
CREATE TABLE IF NOT EXISTS "public"."whatsapp_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "connection_name" text NOT NULL,
  "event_data" jsonb NOT NULL,
  "processed" boolean DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Adicionar índice para melhorar performance de consultas
CREATE INDEX IF NOT EXISTS "idx_whatsapp_webhook_events_connection_name" ON "public"."whatsapp_webhook_events" ("connection_name");

-- Adicionar políticas de segurança para acesso aos dados
ALTER TABLE "public"."whatsapp_webhook_events" ENABLE ROW LEVEL SECURITY;

-- Permitir que usuários autenticados vejam apenas seus próprios eventos
CREATE POLICY "Users can view their own webhook events"
  ON "public"."whatsapp_webhook_events"
  FOR SELECT
  USING (auth.uid() IN (
    SELECT w.user_id FROM whatsapp_connections w 
    WHERE w.name = connection_name
  ));
