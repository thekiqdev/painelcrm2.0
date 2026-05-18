/**
 * Auto-resolve de tickets inativos (aguardando cliente).
 * Cron diário: npm run tickets:auto-resolve
 */
import 'dotenv/config';
import { runTicketAutoResolveBatch } from '../services/ticketAutoResolveService.js';

async function main(): Promise<void> {
  const result = await runTicketAutoResolveBatch();
  console.log(
    `[tickets-auto-resolve] resolved=${result.resolved_count}`,
    result.ticket_ids.length ? `ids=${result.ticket_ids.join(',')}` : ''
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[tickets-auto-resolve] fatal', err);
  process.exit(1);
});
