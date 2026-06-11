import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Diretório `database/init` (Docker / monorepo). */
export function resolveInitDir(): string {
  const initDirDocker = path.resolve(__dirname, '..', '..', 'database', 'init');
  const initDirRepo = path.resolve(__dirname, '../../../..', 'database', 'init');
  return fs.existsSync(initDirDocker) ? initDirDocker : initDirRepo;
}

/** DDL em `database/schema_migrations.sql`. */
export function resolveSchemaMigrationsSqlPath(): string {
  const docker = path.resolve(__dirname, '..', '..', 'database', 'schema_migrations.sql');
  const repo = path.resolve(__dirname, '../../../..', 'database', 'schema_migrations.sql');
  return fs.existsSync(docker) ? docker : repo;
}
