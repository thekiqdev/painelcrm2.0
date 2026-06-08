/**
 * Timeline operacional unificada (foundation) — armazenada em chat_kanban_cards.metadata.operational_timeline.
 */
import type { PoolClient } from 'pg';
import { pool } from '../utils/db.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { findOpsKanbanCardForLead } from './superadminOpsKanbanLeadService.js';

export type OperationalTimelineEntry = {
  at: string;
  type: string;
  label?: string;
  correlation_id?: string;
  [key: string]: unknown;
};

export async function appendOperationalTimelineByCardId(
  client: PoolClient,
  cardId: string,
  entry: Omit<OperationalTimelineEntry, 'at'> & { at?: string },
): Promise<void> {
  const payload = {
    at: entry.at ?? new Date().toISOString(),
    ...entry,
  };
  await client.query(
    `UPDATE chat_kanban_cards
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'::jsonb),
       '{operational_timeline}',
       COALESCE(metadata->'operational_timeline', '[]'::jsonb) || jsonb_build_array($1::jsonb),
       true
     ),
     updated_at = now()
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(payload), cardId, SUPERADMIN_OPS_KANBAN_TENANT_ID],
  );
}

export async function appendOperationalTimelineForLead(
  acquisitionLeadId: string,
  entry: Omit<OperationalTimelineEntry, 'at'> & { at?: string },
): Promise<void> {
  const card = await findOpsKanbanCardForLead(acquisitionLeadId);
  if (!card) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await appendOperationalTimelineByCardId(client, card.cardId, entry);
    await client.query('COMMIT');
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[opsKanban] appendOperationalTimelineForLead', e);
  } finally {
    client.release();
  }
}

export const TIMELINE_LABELS: Record<string, string> = {
  lead_created: 'Lead criado',
  signup_started: 'Cadastro iniciado',
  signup_step: 'Passo do cadastro',
  checkout_started: 'Checkout iniciado',
  checkout_abandoned: 'Checkout abandonado',
  trial_started: 'Trial iniciado',
  stage_changed: 'Estágio atualizado',
  kanban_card_created: 'Entrou no pipeline operacional',
  kanban_moved: 'Movido no Kanban',
  checkout_abandoned_automation: 'Automação de recovery',
  recovery_whatsapp: 'Tentativa WhatsApp (recovery)',
  activation_event: 'Evento de ativação',
  onboarding_company_completed: 'Empresa configurada',
  onboarding_users_completed: 'Equipe adicionada',
  whatsapp_connected: 'WhatsApp conectado',
  onboarding_whatsapp_skipped: 'WhatsApp adiado',
  column_automation_started: 'Automação de coluna iniciada',
  column_automation_completed: 'Automação de coluna concluída',
  column_automation_failed: 'Automação de coluna falhou',
};
