import pg from 'pg';
import { AsyncLocalStorage } from 'async_hooks';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertTenantScopedQuery } from './tenantSecurity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnv = path.resolve(__dirname, '../../../../.env');
dotenv.config({ path: rootEnv });
dotenv.config();

const { Pool } = pg;

/** Pool interno; uso direto em migrate e em middleware que configura o client. */
const internalPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'painelcrm',
  user: process.env.POSTGRES_USER || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/** Contexto por request para RLS (Etapa 5): client com SET LOCAL app.current_tenant_id e opcionalmente app.bypass_rls. */
export const dbRequestStorage = new AsyncLocalStorage<{ client?: pg.PoolClient }>();

/**
 * Executa trabalho fora do client HTTP (evita "Connection terminated" em fire-and-forget
 * que continua após o middleware libertar o PoolClient do request).
 */
export async function runDetachedFromRequestDb<T>(work: () => Promise<T>): Promise<T> {
  if (!dbRequestStorage.getStore()?.client) {
    return work();
  }
  return dbRequestStorage.run({}, work);
}

/** Escapa valor para SET LOCAL (evita quebra de string SQL). */
export function escapeSetLocalAppValue(value: string): string {
  return (value ?? '').replace(/'/g, "''");
}

/**
 * Scheduler/worker de billing: bypass RLS explícito em uma conexão dedicada.
 * Processa todos os tenants; usar só em jobs técnicos confinados (Etapa 2).
 */
export async function withBillingWorkerRlsBypass<T>(work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    // SET LOCAL só vive até ao fim da transação implícita de um statement; em autocommit o bypass
    // não chegava aos UPDATEs seguintes (ex.: subscriptions após customer_invoices). Session-level:
    await client.query(`SELECT set_config('app.bypass_rls', '1', false)`);
    return await dbRequestStorage.run({ client }, work);
  } finally {
    try {
      await client.query(`SELECT set_config('app.bypass_rls', '', false)`);
    } catch {
      /* evitar bloquear release se reset falhar */
    }
    client.release();
  }
}

/**
 * Define app.current_tenant_id para leituras/escritas RLS (ex.: rota pública após resolver tenant por token).
 */
export async function withTenantRlsContext<T>(tenantId: string, work: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    const safe = escapeSetLocalAppValue(tenantId);
    await client.query(`SET LOCAL app.current_tenant_id = '${safe}'`);
    return await dbRequestStorage.run({ client }, work);
  } finally {
    client.release();
  }
}

/**
 * Pool que, quando há contexto de request (setRequestDb), usa o client com SET LOCAL já aplicado.
 * Assim as políticas RLS enxergam app.current_tenant_id e app.bypass_rls.
 */
function getQueryText(textOrConfig: string | pg.QueryConfig): string {
  return typeof textOrConfig === 'string' ? textOrConfig : textOrConfig.text;
}

/**
 * Encerra o pool PostgreSQL interno. Usar em scripts cron/worker one-shot ao terminar.
 * O export `pool` é um facade RLS (query/connect/on) — não expõe `.end()`.
 */
export async function endDatabasePool(): Promise<void> {
  await internalPool.end();
}

export const pool = {
  query(
    textOrConfig: string | pg.QueryConfig,
    values?: unknown[]
  ): Promise<pg.QueryResult> {
    const text = getQueryText(textOrConfig);
    assertTenantScopedQuery(text);

    const store = dbRequestStorage.getStore();
    if (store?.client) {
      if (typeof textOrConfig === 'string') {
        return store.client.query(textOrConfig, values);
      }
      return store.client.query(textOrConfig);
    }
    if (typeof textOrConfig === 'string') {
      return internalPool.query(textOrConfig, values);
    }
    return internalPool.query(textOrConfig);
  },
  connect(): Promise<pg.PoolClient> {
    return internalPool.connect();
  },
  on: internalPool.on.bind(internalPool),
} as pg.Pool;

// Test connection - log apenas na primeira conexão
let firstConnection = true;
internalPool.on('connect', () => {
  if (firstConnection) {
    console.log('Connected to PostgreSQL database');
    firstConnection = false;
  }
});

internalPool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

export default pool;


