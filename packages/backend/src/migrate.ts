/**
 * Script de migração: executa os SQLs de database/init em ordem.
 * Uso: na raiz do projeto, npm run migrate (ou cd packages/backend && npx tsx src/migrate.ts)
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// No Docker: /app/dist -> root = /app. No repo: packages/backend/dist -> root = projeto (../../..)
const initDirDocker = path.resolve(__dirname, '..', 'database', 'init');
const initDirRepo = path.resolve(__dirname, '../../..', 'database', 'init');
const initDir = fs.existsSync(initDirDocker) ? initDirDocker : initDirRepo;
const rootDir = path.resolve(initDir, '..', '..');
const rootEnv = path.resolve(rootDir, '.env');
dotenv.config({ path: rootEnv });
dotenv.config();
const order = [
  '01_create_users_and_auth.sql',
  '02_create_enums.sql',
  '03_create_permissions_and_roles.sql',
  '04_create_leads_and_clients.sql',
  '05_create_funnels.sql',
  '06_create_products.sql',
  '07_create_contracts.sql',
  '08_create_projects.sql',
  '09_create_tickets.sql',
  '10_create_whatsapp.sql',
  '11_create_tasks.sql',
  '12_create_proposals.sql',
  '13_create_finance.sql',
  '15_create_chat_tables.sql',
  '16_create_notifications_table.sql',
  '17_alter_chat_conversations_add_lead_id.sql',
  '18_add_chat_conversations_unique_constraint.sql',
  '19_add_connected_phone_to_instances.sql',
  '20_fix_conversations_last_message_at.sql',
  '21_create_message_templates.sql',
  '22_update_message_templates_structure.sql',
  '23_add_super_admin.sql',
  '24_plans_and_plan_features.sql',
  '25_seed_initial_plans.sql',
  '26_tenants_and_user_tenant.sql',
  '27_tenant_feature_overrides.sql',
  '28_tenant_plan_and_audit_log.sql',
  '29_system_features_table.sql',
  '30_tenants_created_via.sql',
  '32_migrate_old_users_to_tenants.sql',
  '33_tenant_billing.sql',
  '34_tenants_config.sql',
  '35_tenant_admin_notes_and_tags.sql',
  '36_tenant_limit_overrides.sql',
  '37_plans_whatsapp_limit_and_tenant_override.sql',
  '38_plans_plan_type_and_default.sql',
  '39_plan_interval_prices.sql',
  '40_tenant_billing_interval_extend.sql',
  '41_seed_default_plan.sql',
  '42_plans_benefits.sql',
  '43_plans_free.sql',
  '44_projects_wizard_foundation.sql',
  '45_projects_wizard_phase2.sql',
  '46_project_areas_and_versions.sql',
  '47_project_tasks_area_id.sql',
  '48_project_areas_responsible_ids.sql',
  '49_teams_and_team_members.sql',
  '50_projects_team_id.sql',
  'create-admin-user.sql',
];

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

async function runMigrations(pool: pg.Pool) {
  for (const file of order) {
    const filePath = path.join(initDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`Pulando ${file} (arquivo não encontrado).`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`Executando ${file}...`);
    try {
      await pool.query(sql);
      console.log(`  OK: ${file}`);
    } catch (err: any) {
      if (err.message && err.message.includes('already exists')) {
        console.log(`  (já existe) ${file}`);
      } else {
        console.error(`  ERRO em ${file}:`, err.message);
        throw err;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
