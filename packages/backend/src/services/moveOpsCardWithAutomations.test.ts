import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../utils/kanbanRlsTx.js', () => ({
  beginKanbanTxWithRls: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./chatKanbanTagStore.js', () => ({
  nextKanbanCardPosition: vi.fn().mockResolvedValue(1),
}));

vi.mock('./superadminOpsLeadTimelineService.js', () => ({
  appendOperationalTimelineByCardId: vi.fn().mockResolvedValue(undefined),
  TIMELINE_LABELS: { kanban_moved: 'Movido no Kanban' },
}));

vi.mock('./kanbanAutomationContext.js', () => ({
  resolveKanbanAutomationContext: vi.fn(),
  toPhase2AutomationContext: vi.fn((ctx: { cardId: string }) => ({
    cardId: ctx.cardId,
    subjectKind: 'acquisition_lead',
  })),
}));

vi.mock('./kanbanColumnAutomationService.js', () => ({
  runKanbanPhase2Automations: vi.fn(),
}));

vi.mock('./kanbanScheduledMoveService.js', () => ({
  cancelPendingScheduledMovesForCardColumn: vi.fn().mockResolvedValue(undefined),
  insertScheduledMoveIfColumnConfigured: vi.fn().mockResolvedValue(undefined),
}));

import { pool } from '../utils/db.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';
import { resolveKanbanAutomationContext } from './kanbanAutomationContext.js';
import { runKanbanPhase2Automations } from './kanbanColumnAutomationService.js';
import { moveOpsCardWithAutomations } from './moveOpsCardWithAutomations.js';

const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SRC_BOARD_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SRC_COL_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEST_BOARD_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const DEST_COL_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const phase2ColumnMetadata = {
  kanban_phase2: {
    version: 1,
    notifications: {
      notify_operator: false,
      notify_team: false,
      message_template: null,
      auto_message_enabled: true,
      auto_message_mode: 'free_text',
      auto_message_template_id: null,
      auto_message_whatsapp_template_id: null,
      auto_message_text: 'Olá!',
    },
    webhook: { enabled: false, url: '', method: 'POST', timeout_ms: 3000, signing_secret: '', include_headers: true, non_blocking: true },
    crm: { enabled: false, ensure_client_on_column_entry: false, auto_link_or_create_lead: false, allow_create_when_no_dedupe_match: true },
    productivity: { enabled: false, auto_create_task: false, task_title_template: '', task_description_template: '', task_priority: 'medium', due_offset_days: null, assignee_mode: 'actor', assignee_user_id: null },
    automations: { auto_move_by_time: { enabled: false, to_column_id: null, to_board_id: null, delay_value: 60, delay_unit: 'minutes' } },
  },
};

function baseInput(source: string) {
  return {
    tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
    actorUserId: ACTOR_ID,
    cardId: CARD_ID,
    sourceBoardId: SRC_BOARD_ID,
    sourceColumnId: SRC_COL_ID,
    destinationBoardId: DEST_BOARD_ID,
    destinationColumnId: DEST_COL_ID,
    source,
    correlationId: 'corr-1',
  };
}

function mockCardRow(overrides?: Partial<{
  board_id: string;
  column_id: string;
}>) {
  return {
    id: CARD_ID,
    board_id: overrides?.board_id ?? SRC_BOARD_ID,
    column_id: overrides?.column_id ?? SRC_COL_ID,
    acquisition_lead_id: LEAD_ID,
    metadata: {},
    archived_at: null,
  };
}

function mockMoveQueries() {
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM chat_kanban_cards') && s.includes('acquisition_lead_id')) {
      return { rows: [mockCardRow()], rowCount: 1 } as never;
    }
    if (s.includes('FROM chat_kanban_boards')) {
      return {
        rows: [{ id: DEST_BOARD_ID, name: 'Engajamento Trial', linked_sales_funnel_id: null, archived_at: null, is_active: true }],
        rowCount: 1,
      } as never;
    }
    if (s.includes('FROM chat_kanban_columns') && s.includes('board_id')) {
      return {
        rows: [{ id: DEST_COL_ID, name: 'Dia 4', board_id: DEST_BOARD_ID, metadata: phase2ColumnMetadata }],
        rowCount: 1,
      } as never;
    }
    if (s.includes('SELECT name FROM chat_kanban_columns')) {
      return { rows: [{ name: 'Dia 2' }], rowCount: 1 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });

  const clientQuery = vi.fn().mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('UPDATE chat_kanban_cards') && s.includes('archived_at = now()')) {
      return { rows: [], rowCount: 0 } as never;
    }
    if (s.includes('UPDATE chat_kanban_cards')) {
      return { rows: [], rowCount: 1 } as never;
    }
    if (s === 'COMMIT' || s === 'ROLLBACK' || s.startsWith('BEGIN')) {
      return { rows: [], rowCount: 0 } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });

  vi.mocked(pool.connect).mockResolvedValue({
    query: clientQuery,
    release: vi.fn(),
  } as never);
}

describe('moveOpsCardWithAutomations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveKanbanAutomationContext).mockResolvedValue({
      tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
      actorUserId: ACTOR_ID,
      boardId: DEST_BOARD_ID,
      boardName: 'Engajamento Trial',
      columnId: DEST_COL_ID,
      columnName: 'Dia 4',
      cardId: CARD_ID,
      subject: { kind: 'acquisition_lead', acquisitionLeadId: LEAD_ID },
      columnMetadata: phase2ColumnMetadata,
      correlationId: 'corr-1',
    });
    vi.mocked(runKanbanPhase2Automations).mockResolvedValue({ attempted: true });
  });

  const moveSources = [
    ['A — drag manual Ops', 'ops_kanban_patch'],
    ['B — Promotion Engine', 'activatePlanFromBilling'],
    ['C — Trial Engagement', 'trial_engagement_lifecycle'],
    ['D — Trial Recovery', 'trial_recovery_lifecycle'],
    ['E — subscription.activated', 'subscription.activated'],
    ['F — trial.expired', 'trial.expired'],
    ['G — onboarding.completed', 'completeWizardWhatsappStep'],
    ['H — syncAcquisitionLeadToOpsKanban', 'syncAcquisitionLeadToOpsKanban'],
  ] as const;

  it.each(moveSources)('cenário %s executa Phase2', async (_label, source) => {
    mockMoveQueries();
    const result = await moveOpsCardWithAutomations(baseInput(source));

    expect(result.status).toBe('moved');
    expect(result.phase2Executed).toBe(true);
    expect(result.cardId).toBe(CARD_ID);
    expect(runKanbanPhase2Automations).toHaveBeenCalled();
  });

  it('cenário I — already_at_destination não duplica Phase2', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM chat_kanban_cards') && s.includes('acquisition_lead_id')) {
        return {
          rows: [mockCardRow({ board_id: DEST_BOARD_ID, column_id: DEST_COL_ID })],
          rowCount: 1,
        } as never;
      }
      if (s.includes('FROM chat_kanban_boards')) {
        return {
          rows: [{ id: DEST_BOARD_ID, name: 'Engajamento Trial', linked_sales_funnel_id: null, archived_at: null, is_active: true }],
          rowCount: 1,
        } as never;
      }
      if (s.includes('FROM chat_kanban_columns') && s.includes('board_id')) {
        return {
          rows: [{ id: DEST_COL_ID, name: 'Dia 4', board_id: DEST_BOARD_ID, metadata: phase2ColumnMetadata }],
          rowCount: 1,
        } as never;
      }
      if (s.includes('SELECT name FROM chat_kanban_columns')) {
        return { rows: [{ name: 'Dia 4' }], rowCount: 1 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await moveOpsCardWithAutomations(baseInput('ops_kanban_patch'));

    expect(result.status).toBe('already_at_destination');
    expect(result.phase2Executed).toBe(false);
    expect(pool.connect).not.toHaveBeenCalled();
    expect(runKanbanPhase2Automations).not.toHaveBeenCalled();
  });

  it('cenário J — card inexistente', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [], rowCount: 0 } as never);

    const result = await moveOpsCardWithAutomations(baseInput('ops_kanban_patch'));

    expect(result.status).toBe('card_not_found');
    expect(result.phase2Executed).toBe(false);
  });

  it('cenário K — board inexistente', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM chat_kanban_cards') && s.includes('acquisition_lead_id')) {
        return { rows: [mockCardRow()], rowCount: 1 } as never;
      }
      if (s.includes('FROM chat_kanban_boards')) {
        return { rows: [], rowCount: 0 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await moveOpsCardWithAutomations(baseInput('trial_engagement_lifecycle'));

    expect(result.status).toBe('board_not_found');
    expect(result.phase2Executed).toBe(false);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('cenário L — coluna inexistente', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM chat_kanban_cards') && s.includes('acquisition_lead_id')) {
        return { rows: [mockCardRow()], rowCount: 1 } as never;
      }
      if (s.includes('FROM chat_kanban_boards')) {
        return {
          rows: [{ id: DEST_BOARD_ID, name: 'Engajamento Trial', linked_sales_funnel_id: null, archived_at: null, is_active: true }],
          rowCount: 1,
        } as never;
      }
      if (s.includes('FROM chat_kanban_columns') && s.includes('board_id')) {
        return { rows: [], rowCount: 0 } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await moveOpsCardWithAutomations(baseInput('onboarding.completed'));

    expect(result.status).toBe('column_not_found');
    expect(result.phase2Executed).toBe(false);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('arquiva card conflitante no board destino antes de mover entre boards', async () => {
    mockMoveQueries();
    await moveOpsCardWithAutomations(baseInput('subscription.activated'));

    const client = await pool.connect();
    const clientQuery = vi.mocked(client.query);
    const archiveCall = clientQuery.mock.calls.find(([sql]) =>
      String(sql).includes('archived_at = now()') && String(sql).includes('acquisition_lead_id'),
    );
    expect(archiveCall).toBeDefined();
  });
});
