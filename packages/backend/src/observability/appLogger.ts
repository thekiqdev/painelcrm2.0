/**
 * MB-014 — Logger estruturado / política única (backend).
 *
 * Níveis: error > warn > info > debug
 * Env:
 *   LOG_LEVEL=error|warn|info|debug  (default: info em prod, debug em development)
 *   LOG_JSON=1                       → uma linha JSON por evento
 *   LOG_HTTP=1                       → access log /api (senão só em debug)
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const RANK: Record<LogLevel, number> = {
  error: 40,
  warn: 30,
  info: 20,
  debug: 10,
};

function resolveMinLevel(): LogLevel {
  const raw = String(process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (raw === 'error' || raw === 'warn' || raw === 'info' || raw === 'debug') return raw;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

let minLevel: LogLevel = resolveMinLevel();

export function refreshLogLevelFromEnv(): void {
  minLevel = resolveMinLevel();
}

export function getLogMinLevel(): LogLevel {
  return minLevel;
}

function enabled(level: LogLevel): boolean {
  return RANK[level] >= RANK[minLevel];
}

function useJson(): boolean {
  return String(process.env.LOG_JSON || '') === '1';
}

export function isHttpAccessLogEnabled(): boolean {
  // Opt-in only — evita spam por request em prod/dev.
  return String(process.env.LOG_HTTP || '') === '1';
}

type Fields = Record<string, unknown>;

function emit(level: LogLevel, scope: string, message: string, fields?: Fields): void {
  if (!enabled(level)) return;
  const payload = {
    level,
    scope,
    msg: message,
    ts: new Date().toISOString(),
    ...(fields || {}),
  };
  const line = useJson()
    ? JSON.stringify(payload)
    : `[${payload.ts}] ${level.toUpperCase()} [${scope}] ${message}${
        fields && Object.keys(fields).length ? ` ${JSON.stringify(fields)}` : ''
      }`;

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const appLogger = {
  error(scope: string, message: string, fields?: Fields): void {
    emit('error', scope, message, fields);
  },
  warn(scope: string, message: string, fields?: Fields): void {
    emit('warn', scope, message, fields);
  },
  info(scope: string, message: string, fields?: Fields): void {
    emit('info', scope, message, fields);
  },
  debug(scope: string, message: string, fields?: Fields): void {
    emit('debug', scope, message, fields);
  },
  /** Startup / shutdown — sempre info (não depende de debug). */
  boot(scope: string, message: string, fields?: Fields): void {
    emit('info', scope, message, fields);
  },
};
