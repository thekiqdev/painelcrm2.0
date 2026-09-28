/**
 * Script de migração: executa os SQLs de `database/init` na ordem em `startup/migrationOrder.ts`.
 * Ficheiros novos em `database/init` não são descobertos automaticamente — acrescentar ao array.
 * Uso: `cd packages/backend && npm run migrate:tsx` **ou** `npm run build && npm run migrate`.
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import pg from 'pg';
import { MIGRATION_ORDER } from './startup/migrationOrder.js';
import { resolveInitDir } from './startup/migrationPaths.js';
import {
  bootstrapSchemaMigrations,
  computeMigrationChecksum,
  registerMigrationExecuted,
} from './startup/migrationGuard.js';

const initDir = resolveInitDir();
const rootDir = path.resolve(initDir, '..', '..');
const rootEnv = path.resolve(rootDir, '.env');
dotenv.config({ path: rootEnv });
dotenv.config();

async function main() {
  const config = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'painelcrm',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };

  const adminPool = new pg.Pool({ ...config, database: 'postgres' });
  try {
    await adminPool.query('SELECT 1');
    console.log('Conexão com PostgreSQL OK.');
  } catch (e) {
    console.error('Erro ao conectar no banco. Verifique o .env e se o PostgreSQL está rodando.');
    console.error(e);
    process.exit(1);
  }

  const dbName = config.database;
  const checkDb = await adminPool.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName]
  );
  if (checkDb.rowCount === 0) {
    console.log(`Criando banco "${dbName}"...`);
    await adminPool.query(`CREATE DATABASE "${dbName}"`);
  }
  await adminPool.end();

  const pool = new pg.Pool(config);
  await runMigrations(pool);
  await pool.end();
  console.log('Migração concluída.');
}

export async function runMigrations(pool: pg.Pool): Promise<void> {
  await bootstrapSchemaMigrations(pool);

  for (const file of MIGRATION_ORDER) {
    const filePath = path.join(initDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Pulando ${file} (arquivo não encontrado).`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    const checksum = computeMigrationChecksum(sql);
    console.log(`Executando ${file}...`);
    let applied = false;
    try {
      await pool.query(sql);
      console.log(`  OK: ${file}`);
      applied = true;
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : '';
      if (msg.includes('already exists')) {
        const firstLine = msg.split('\n')[0];
        console.log(`  (já existe) ${file}`);
        console.log(`     detalhe: ${firstLine}`);
        applied = true;
      } else {
        console.error(`  ERRO em ${file}:`, err.message);
        throw err;
      }
    }
    if (applied) {
      await registerMigrationExecuted(pool, file, checksum);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
