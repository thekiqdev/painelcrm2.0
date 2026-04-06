-- Lookup seguro para webhook: índice em external_instance_name (não único — duplicatas são erro na aplicação).
CREATE INDEX IF NOT EXISTS idx_chat_instances_external_instance_name
  ON public.chat_instances (external_instance_name)
  WHERE external_instance_name IS NOT NULL AND btrim(external_instance_name) <> '';

COMMENT ON INDEX public.idx_chat_instances_external_instance_name IS
  'Suporte a resolução de instância no webhook por external_instance_name (Etapa 1 isolamento multi-tenant).';
