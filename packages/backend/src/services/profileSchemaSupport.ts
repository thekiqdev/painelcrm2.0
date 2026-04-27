import type { Pool } from 'pg';

/** Mensagem pública única para APIs quando colunas estendidas de `profiles` não existem. */
export const PROFILE_SCHEMA_PUBLIC_MESSAGE =
  'O recurso de perfil ainda não está disponível neste ambiente. Execute as migrações pendentes.';

export const PROFILE_EXTENDED_MIGRATION_REF = '157_profile_personal_and_password_change.sql (database/init/)';

const REQUIRED_PROFILE_COLUMNS = ['avatar_url', 'job_title', 'locale', 'timezone'] as const;

/**
 * Verifica se a migração de perfil estendido foi aplicada (colunas em `public.profiles`).
 */
export async function isProfileExtendedSchemaPresent(pool: Pool): Promise<boolean> {
  const r = await pool.query<{ c: string }>(
    `SELECT count(*)::text AS c
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'profiles'
       AND column_name = ANY($1::text[])`,
    [[...REQUIRED_PROFILE_COLUMNS]],
  );
  const n = parseInt(r.rows[0]?.c ?? '0', 10);
  return n === REQUIRED_PROFILE_COLUMNS.length;
}

/**
 * Log operacional: não expor ao cliente; indica migração e colunas esperadas.
 */
export function logProfileSchemaMissing(
  routeContext: string,
  extra?: { pgMessage?: string; cause?: unknown },
): void {
  console.warn(
    `[profile-schema] ${routeContext}: colunas estendidas ausentes em public.profiles. ` +
      `Aplicar migração ${PROFILE_EXTENDED_MIGRATION_REF}. ` +
      `Esperado: ${REQUIRED_PROFILE_COLUMNS.join(', ')}.` +
      (extra?.pgMessage ? ` PostgreSQL: ${extra.pgMessage}` : ''),
    extra?.cause,
  );
}

/** Resposta JSON padronizada para 503 de schema ausente. */
export function profileSchemaMissingResponseBody(): { error: string; code: 'PROFILE_SCHEMA_MISSING' } {
  return {
    error: PROFILE_SCHEMA_PUBLIC_MESSAGE,
    code: 'PROFILE_SCHEMA_MISSING',
  };
}
