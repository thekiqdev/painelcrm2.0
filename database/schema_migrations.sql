-- P0.1 — Controle de migrations aplicadas (Migration Guard)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT,
  CONSTRAINT schema_migrations_filename_unique UNIQUE (filename)
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_executed_at
  ON public.schema_migrations (executed_at DESC);

COMMENT ON TABLE public.schema_migrations IS 'Registo de ficheiros SQL de database/init já executados com sucesso';
