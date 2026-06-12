import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
  withBillingWorkerRlsBypass: vi.fn(async (fn: () => Promise<void>) => fn()),
}));

import { pool } from '../utils/db.js';
import {
  cancelPendingScheduledMovesForCardColumn,
  insertScheduledMoveIfColumnConfigured,
} from './kanbanScheduledMoveService.js';

const TENANT_ID = '99999999-9999-4999-8999-999999999999';
const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BOARD_A = '11111111-1111-4111-8111-111111111111';
const BOARD_B = '22222222-2222-4222-8222-222222222222';
const COL_WS = '33333333-3333-4333-8333-333333333333';
const COL_TRIAL = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const MOVE_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const autoMoveMetadata = {
  kanban_phase2: {
    version: 1,
    notifications: {
      notify_operator: false,
      notify_team: false,
      message_template: null,
      auto_message_enabled: false,
      auto_message_mode: 'free_text',
      auto_message_template_id: null,
      auto_message_whatsapp_template_id: null,
      auto_message_text: null,
    },
    webhook: { enabled: false, url: '', method: 'POST', timeout_ms: 3000, signing_secret: '', include_headers: true, non_blocking: true },
    crm: { enabled: false, ensure_client_on_column_entry: false, auto_link_or_create_lead: false, allow_create_when_no_dedupe_match: true },
    productivity: { enabled: false, auto_create_task: false, task_title_template: '', task_description_template: '', task_priority: 'medium', due_offset_days: null, assignee_mode: 'actor', assignee_user_id: null },
    automations: {
      auto_move_by_time: {
        enabled: true,
        to_column_id: COL_TRIAL,
        to_board_id: BOARD_B,
        delay_value: 30,
        delay_unit: 'minutes',
      },
    },
  },
};

describe('kanbanScheduledMoveService observability (K8.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  function lastKanbanLog(): Record<string, unknown> {
    const calls = vi.mocked(console.info).mock.calls.filter((c) => c[0] === '[kanbanScheduledMove]');
    return calls[calls.length - 1][1] as Record<string, unknown>;
  }

  it('insertScheduledMoveIfColumnConfigured emite action scheduled (Ops cross-board)', async () => {
    const clientQuery = vi.fn().mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('DELETE FROM chat_kanban_scheduled_moves')) return { rows: [], rowCount: 0 };
      if (s.includes('INSERT INTO chat_kanban_scheduled_moves')) {
        return { rows: [{ id: MOVE_ID }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await insertScheduledMoveIfColumnConfigured(
      { query: clientQuery } as never,
      {
        tenantId: TENANT_ID,
        boardId: BOARD_A,
        cardId: CARD_ID,
        acquisitionLeadId: LEAD_ID,
        columnId: COL_WS,
        columnMetadata: autoMoveMetadata,
        actorUserId: ACTOR_ID,
      },
    );

    const p = lastKanbanLog();
    expect(p.action).toBe('scheduled');
    expect(p.cardId).toBe(CARD_ID);
    expect(p.acquisitionLeadId).toBe(LEAD_ID);
    expect(p.fromBoard).toBe(BOARD_A);
    expect(p.toBoard).toBe(BOARD_B);
    expect(p.fromColumn).toBe(COL_WS);
    expect(p.toColumn).toBe(COL_TRIAL);
    expect(p.correlationId).toBe(`scheduled-move:${MOVE_ID}`);
  });

  it('cancelPendingScheduledMovesForCardColumn emite action cancelled (manual_move)', async () => {
    const pendingRow = {
      id: MOVE_ID,
      tenant_id: TENANT_ID,
      board_id: BOARD_A,
      card_id: CARD_ID,
      conversation_id: null,
      acquisition_lead_id: LEAD_ID,
      from_column_id: COL_WS,
      to_column_id: COL_TRIAL,
      to_board_id: BOARD_B,
      delay_value: 30,
      delay_unit: 'minutes',
      scheduled_for: new Date(),
      status: 'scheduled',
      created_by_user_id: ACTOR_ID,
    };

    const clientQuery = vi.fn().mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('SELECT sm.*')) return { rows: [pendingRow], rowCount: 1 };
      if (s.includes('UPDATE chat_kanban_scheduled_moves')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await cancelPendingScheduledMovesForCardColumn(
      { query: clientQuery } as never,
      TENANT_ID,
      CARD_ID,
      COL_WS,
      'card_left_source_column',
      ACTOR_ID,
    );

    const p = lastKanbanLog();
    expect(p.action).toBe('cancelled');
    expect(p.scheduledMoveId).toBe(MOVE_ID);
    expect(p.cardId).toBe(CARD_ID);
    expect(p.reason).toBe('card_left_source_column');
  });

  it('cancel por card_deleted', async () => {
    const pendingRow = {
      id: MOVE_ID,
      tenant_id: TENANT_ID,
      board_id: BOARD_A,
      card_id: CARD_ID,
      conversation_id: null,
      acquisition_lead_id: LEAD_ID,
      from_column_id: COL_WS,
      to_column_id: COL_TRIAL,
      to_board_id: BOARD_B,
      delay_value: 30,
      delay_unit: 'minutes',
      scheduled_for: new Date(),
      status: 'scheduled',
      created_by_user_id: ACTOR_ID,
    };

    const clientQuery = vi.fn().mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('SELECT sm.*')) return { rows: [pendingRow], rowCount: 1 };
      if (s.includes('UPDATE chat_kanban_scheduled_moves')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await cancelPendingScheduledMovesForCardColumn(
      { query: clientQuery } as never,
      TENANT_ID,
      CARD_ID,
      COL_WS,
      'card_deleted',
      ACTOR_ID,
    );

    expect(lastKanbanLog().reason).toBe('card_deleted');
  });

  it('insert com conversa também emite scheduled estruturado', async () => {
    const CONV_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const clientQuery = vi.fn().mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('DELETE FROM chat_kanban_scheduled_moves')) return { rows: [], rowCount: 0 };
      if (s.includes('INSERT INTO chat_kanban_scheduled_moves')) {
        return { rows: [{ id: MOVE_ID }], rowCount: 1 };
      }
      if (s.includes('attendance_status')) return { rows: [{ attendance_status: 'open' }] };
      return { rows: [], rowCount: 0 };
    });

    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await insertScheduledMoveIfColumnConfigured(
      { query: clientQuery } as never,
      {
        tenantId: TENANT_ID,
        boardId: BOARD_A,
        cardId: CARD_ID,
        conversationId: CONV_ID,
        columnId: COL_WS,
        columnMetadata: {
          ...autoMoveMetadata,
          kanban_phase2: {
            ...autoMoveMetadata.kanban_phase2,
            automations: {
              auto_move_by_time: {
                enabled: true,
                to_column_id: COL_TRIAL,
                to_board_id: null,
                delay_value: 5,
                delay_unit: 'minutes',
              },
            },
          },
        },
        actorUserId: ACTOR_ID,
      },
    );

    const p = lastKanbanLog();
    expect(p.action).toBe('scheduled');
    expect(p.conversationId).toBe(CONV_ID);
    expect(p.toBoard).toBe(BOARD_A);
  });
});
