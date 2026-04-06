-- Etapa 4: eventos de timeline do cliente (append-only, tenant-scoped)
CREATE TABLE IF NOT EXISTS client_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  source TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  actor_id UUID NULL,
  reference_type TEXT NULL,
  reference_id UUID NULL,
  event_key TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_timeline_events_client_created_at
  ON client_timeline_events (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_timeline_events_tenant_client_created_at
  ON client_timeline_events (tenant_id, client_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_client_timeline_events_event_key
  ON client_timeline_events (event_key)
  WHERE event_key IS NOT NULL;
