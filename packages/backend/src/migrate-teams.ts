/**
 * Aplica apenas as migrações de equipes (49) e team_id em projetos (50).
 * Use quando a tabela "teams" não existir e o migrate completo já foi rodado antes
 * (ou o banco é outro que o script migrate usa).
 *
 * Mesma conexão que o backend: variáveis POSTGRES_* do .env (raiz do projeto ou backend).
 *
 * Uso (na pasta packages/backend):
 *   npx tsx src/migrate-teams.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env na raiz do repositório (igual ao migrate.ts)
const repoRoot = path.resolve(__dirname, '../../..');
const rootEnv = path.join(repoRoot, '.env');
const backendEnv = path.join(__dirname, '..', '.env');
dotenv.config({ path: rootEnv });
dotenv.config({ path: backendEnv });

const initDir = path.join(repoRoot, 'database', 'init');
const files = ['49_teams_and_team_members.sql', '50_projects_team_id.sql'];

async function main() {
  const config = {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'painelcrm',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
  };

  console.log('Conectando em', config.host + ':' + config.port + '/' + config.database, '...');

  const pool = new pg.Pool(config);
  try {
    const r = await pool.query('SELECT 1');
    if (!r) throw new Error('Sem resposta do banco');
  } catch (e: any) {
    console.error('Erro ao conectar:', e.message);
    process.exit(1);
  }

  for (const file of files) {
    const filePath = path.join(initDir, file);
    if (!fs.existsSync(filePath)) {
      console.log('Arquivo não encontrado:', filePath);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log('Executando', file, '...');
    try {
      await pool.query(sql);
      console.log('  OK:', file);
    } catch (err: any) {
      if (err.message && err.message.includes('already exists')) {
        console.log('  (já existe)', file);
      } else {
        console.error('  ERRO:', err.message);
        await pool.end();
        process.exit(1);
      }
    }
  }

  await pool.end();
  console.log('Concluído. Reinicie o backend e tente criar a equipe de novo.');
}

main();
