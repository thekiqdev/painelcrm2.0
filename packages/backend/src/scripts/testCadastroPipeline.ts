/**
 * Simula POST /cadastro (step contact) e valida card no Kanban operacional.
 * Uso: npx tsx src/scripts/testCadastroPipeline.ts
 */
import { orchestrateSignupStep } from '../acquisition/signupOrchestrationService.js';
import pg from 'pg';
import { randomUUID } from 'crypto';

const pool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  user: process.env.POSTGRES_USER ?? 'postgres',
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB ?? 'painelcrm',
});

async function main() {
  const correlationId = randomUUID();
  const email = `pipeline-test-${Date.now()}@example.com`;
  const phone = `5511999${String(Date.now()).slice(-7)}`;

  console.log('--- orchestrateSignupStep (contact) ---');
  const result = await orchestrateSignupStep({
    step: 'contact',
    name: 'Pipeline Test Lead',
    email,
    phone,
    correlationId,
  });
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok || !result.lead?.id) {
    process.exit(1);
  }

  // Fallback é fire-and-forget (void publish); aguarda sync assíncrono
  await new Promise((r) => setTimeout(r, 3000));

  const card = await pool.query(
    `SELECT kc.id::text, col.name AS column_name, kc.metadata
     FROM chat_kanban_cards kc
     JOIN chat_kanban_columns col ON col.id = kc.column_id
     WHERE kc.acquisition_lead_id = $1`,
    [result.lead.id],
  );
  console.log('\n--- card in ops kanban ---', card.rows);

  const outbox = await pool.query(
    `SELECT event_key, status FROM outbox_events WHERE aggregate_id = $1 ORDER BY created_at DESC LIMIT 3`,
    [result.lead.id],
  );
  console.log('\n--- outbox (expected empty while shadow) ---', outbox.rows);

  await pool.end();
  if (card.rows.length === 0) {
    console.error('FAIL: no card created');
    process.exit(1);
  }
  console.log('\nOK: pipeline /cadastro → lead → ops kanban card');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
