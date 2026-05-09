CREATE INDEX IF NOT EXISTS idx_chat_instances_user_external_name
  ON public.chat_instances (user_id, external_instance_name)
  WHERE external_instance_name IS NOT NULL AND btrim(external_instance_name) <> '';
