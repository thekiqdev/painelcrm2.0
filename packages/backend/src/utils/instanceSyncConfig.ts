/**
 * Etapa 4 — configuração de sincronização de histórico por instância (metadata.chat_instances).
 * Persistência: `sync_on_connect`, `sync_mode` em `chat_instances.metadata` (sem migração SQL).
 */

export type SyncMode = 'none' | 'days_7' | 'days_30' | 'days_90' | 'full';

const SYNC_MODES: ReadonlySet<string> = new Set(['none', 'days_7', 'days_30', 'days_90', 'full']);

/** Comportamento legado (Etapas 1–3): bootstrap automático com janela ampla. */
export const DEFAULT_SYNC_ON_CONNECT = true;
export const DEFAULT_SYNC_MODE: SyncMode = 'full';

export function normalizeSyncMode(raw: unknown): SyncMode {
  if (raw == null || raw === '') return DEFAULT_SYNC_MODE;
  const s = String(raw).trim().toLowerCase();
  if (SYNC_MODES.has(s)) return s as SyncMode;
  return DEFAULT_SYNC_MODE;
}

export function normalizeSyncOnConnect(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw;
  return DEFAULT_SYNC_ON_CONNECT;
}

/**
 * A partir de um payload (metadata do cliente ou body de connect), produz valores persistidos.
 */
export function normalizeSyncConfigFromInput(input: Record<string, unknown> | null | undefined): {
  sync_on_connect: boolean;
  sync_mode: SyncMode;
} {
  const src = input || {};
  return {
    sync_on_connect: normalizeSyncOnConnect(src.sync_on_connect),
    sync_mode: normalizeSyncMode(src.sync_mode),
  };
}

/** Se false, não agenda bootstrap de histórico. */
export function shouldBootstrapHistory(metadata: Record<string, unknown> | null | undefined): boolean {
  const m = metadata || {};
  if (normalizeSyncOnConnect(m.sync_on_connect) === false) return false;
  if (normalizeSyncMode(m.sync_mode) === 'none') return false;
  return true;
}

/**
 * Converte modo em instante mínimo (inclusivo) para filtro de data.
 * `full` e `none` → null (nenhum filtro por data no app; `none` não deve chegar aqui no bootstrap).
 */
export function syncModeToMinTimestampMs(mode: SyncMode, nowMs: number = Date.now()): number | null {
  const d = (days: number) => nowMs - days * 24 * 60 * 60 * 1000;
  switch (mode) {
    case 'days_7':
      return d(7);
    case 'days_30':
      return d(30);
    case 'days_90':
      return d(90);
    case 'full':
    case 'none':
    default:
      return null;
  }
}

/** Filtro UazAPI `/chat/find`: campo `wa_lastMsgTimestamp` com operador `>=` (ver OpenAPI operadores). */
export function buildWaLastMsgTimestampFilter(minTimestampMs: number): string {
  const sec = Math.floor(minTimestampMs / 1000);
  return `>=${sec}`;
}

export function extractWaLastMsgTimestampMs(row: Record<string, unknown>): number | null {
  const v =
    row.wa_lastMsgTimestamp ??
    row.wa_last_msg_timestamp ??
    (row as any).lastMsgTimestamp ??
    (row as any).last_message_timestamp;
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) return null;
  return n > 1e12 ? n : n * 1000;
}
