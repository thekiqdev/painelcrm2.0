/**
 * Testa syncAcquisitionLeadToOpsKanban para um lead existente.
 * Uso: npx tsx src/scripts/testOpsKanbanSync.ts [leadId]
 */
import { syncAcquisitionLeadToOpsKanban } from '../services/superadminOpsKanbanLeadService.js';
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
  const leadId =
    process.argv[2] ??
    (
      await pool.query(
        `SELECT id::text FROM acquisition_leads ORDER BY created_at DESC LIMIT 1`,
      )
    ).rows[0]?.id;

  if (!leadId) {
    console.error('No lead found');
    process.exit(1);
  }

  const su = await pool.query<{ id: string }>(
    `SELECT id::text FROM users WHERE is_super_admin = true LIMIT 1`,
  );
  const actor = su.rows[0]?.id;
  console.log('leadId', leadId, 'actor', actor);

  console.log('\n--- ensureSuperadminOpsKanbanSeed ---');
  const seed = await ensureSuperadminOpsKanbanSeed(actor!, { backfillLeads: false });
  console.log(JSON.stringify(seed, null, 2));

  const lead = await pool.query(
    `SELECT id, correlation_id FROM acquisition_leads WHERE id = $1`,
    [leadId],
  );
  const correlationId = lead.rows[0]?.correlation_id ?? 'test';

  console.log('\n--- syncAcquisitionLeadToOpsKanban ---');
  const result = await syncAcquisitionLeadToOpsKanban({
    acquisitionLeadId: leadId,
    correlationId,
    timelineType: 'lead_created',
    actorUserId: actor,
  });
  console.log(JSON.stringify(result, null, 2));

  const cards = await pool.query(
    `SELECT kc.id, col.name AS column_name FROM chat_kanban_cards kc
     JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.acquisition_lead_id = $1`,
    [leadId],
  );
  console.log('\n--- card after sync ---', cards.rows);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
