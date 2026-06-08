/**
 * Diagnóstico: /cadastro → acquisition_leads → outbox → ops kanban
 * Uso: npx tsx src/scripts/debugOpsKanbanPipeline.ts
 */
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB ?? 'painelcrm',
});

async function section(title: string, rows: unknown) {
  console.log(`\n=== ${title} ===`);
  console.log(JSON.stringify(rows, null, 2));
}

async function main() {
  const leads = await pool.query(
    `SELECT id, name, email, phone, source, current_stage, correlation_id, created_at
     FROM acquisition_leads ORDER BY created_at DESC LIMIT 5`,
  );
  await section('acquisition_leads (last 5)', leads.rows);

  const outbox = await pool.query(
    `SELECT id, event_key, status, tenant_id, correlation_id, attempts, last_error, created_at
     FROM outbox_events WHERE event_key LIKE 'acquisition.%'
     ORDER BY created_at DESC LIMIT 15`,
  );
  await section('outbox_events acquisition (last 15)', outbox.rows);

  const outboxCount = await pool.query(`SELECT COUNT(*)::int AS c FROM outbox_events`);
  await section('outbox_events total count', outboxCount.rows);

  const flags = await pool.query(
    `SELECT key, default_enabled, shadow_mode
     FROM platform_feature_flags
     WHERE key LIKE 'outbox.%' OR key LIKE 'acquisition.%'
     ORDER BY key`,
  );
  await section('feature flags', flags.rows);

  const col260 = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='chat_kanban_cards' AND column_name='acquisition_lead_id'`,
  );
  await section('migration 260 column', col260.rows);

  const cards = await pool.query(
    `SELECT kc.id, kc.acquisition_lead_id, col.name AS column_name, kc.created_at
     FROM chat_kanban_cards kc
     JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.acquisition_lead_id IS NOT NULL
     ORDER BY kc.created_at DESC LIMIT 10`,
  );
  await section('ops kanban lead cards', cards.rows);

  const boards = await pool.query(
    `SELECT id, name, tenant_id FROM chat_kanban_boards
     WHERE tenant_id = '1f1a0f0a-0000-4000-8000-000000000001'
     ORDER BY sort_order`,
  );
  await section('superadmin ops boards', boards.rows);

  const columns = await pool.query(
    `SELECT col.id, col.name, b.name AS board_name
     FROM chat_kanban_columns col
     JOIN chat_kanban_boards b ON b.id = col.board_id
     WHERE col.tenant_id = '1f1a0f0a-0000-4000-8000-000000000001'
       AND lower(trim(b.name)) IN ('aquisição', 'aquisicao')
     ORDER BY col.position`,
  );
  await section('Aquisição columns', columns.rows);

  const superadmins = await pool.query(
    `SELECT id, email, is_super_admin FROM users WHERE is_super_admin = true LIMIT 5`,
  );
  await section('super admin users', superadmins.rows);

  const subscriberLogs = await pool.query(
    `SELECT subscriber_name, idempotency_key, outbox_event_id, created_at
     FROM outbox_subscriber_idempotency
     WHERE subscriber_name LIKE 'ops.kanban%'
     ORDER BY created_at DESC LIMIT 10`,
  );
  await section('ops kanban subscriber idempotency', subscriberLogs.rows);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
