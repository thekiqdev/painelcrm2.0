-- UazAPI webhook hardening (multi-tenant / multi-instance)
ALTER TABLE chat_instances
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS webhook_secret_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_secret_last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS webhook_secret_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS webhook_needs_reconfiguration boolean DEFAULT false;

UPDATE chat_instances
SET webhook_secret = COALESCE(NULLIF(metadata->>'webhook_secret', ''), webhook_secret),
    webhook_secret_created_at = COALESCE(webhook_secret_created_at, now()),
    webhook_secret_version = COALESCE(webhook_secret_version, 1),
    webhook_needs_reconfiguration = CASE
      WHEN COALESCE(NULLIF(webhook_secret, ''), '') = '' THEN true
      WHEN length(COALESCE(webhook_secret, '')) < 32 THEN true
      ELSE COALESCE(webhook_needs_reconfiguration, false)
    END
WHERE webhook_secret IS NULL
   OR webhook_secret_created_at IS NULL
   OR webhook_secret_version IS NULL
   OR webhook_needs_reconfiguration IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_instances_webhook_needs_reconfiguration
  ON chat_instances (webhook_needs_reconfiguration)
  WHERE webhook_needs_reconfiguration = true;
