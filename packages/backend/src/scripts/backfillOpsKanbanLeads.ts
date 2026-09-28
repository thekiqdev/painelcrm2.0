/**
 * Backfill acquisition leads → operational kanban cards.
 * Uso: npx tsx src/scripts/backfillOpsKanbanLeads.ts
 */
import { ensureSuperadminOpsKanbanSeed } from '../services/superadminOpsKanbanSeedService.js';
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB ?? 'painelcrm',
});

async function main() {
  const su = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE is_super_admin = true LIMIT 1`,
  );
  const actor = su.rows[0]?.id;
  if (!actor) {
    console.error('No super admin user');
    process.exit(1);
  }

  const result = await ensureSuperadminOpsKanbanSeed(actor, {
    backfillLeads: true,
    backfillLimit: 200,
  });
  console.log('seed/backfill', JSON.stringify(result, null, 2));

  const stats = await pool.query<{ leads: number; cards: number }>(
    `SELECT
       (SELECT COUNT(*)::int FROM acquisition_leads) AS leads,
       (SELECT COUNT(*)::int FROM chat_kanban_cards WHERE acquisition_lead_id IS NOT NULL) AS cards`,
  );
  console.log('stats', stats.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
