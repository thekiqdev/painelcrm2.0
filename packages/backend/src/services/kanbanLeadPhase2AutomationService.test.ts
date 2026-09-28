import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/db.js', () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock('../utils/kanbanRlsTx.js', () => ({
  beginKanbanTxWithRls: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../acquisition/acquisitionLeadRepository.js', () => ({
  findAcquisitionLeadById: vi.fn(),
}));

vi.mock('../communication/channelProviderGateway/channelProviderGateway.js', () => ({
  sendMessage: vi.fn(),
}));

vi.mock('./notifications.js', () => ({
  createNotification: vi.fn(),
}));

vi.mock('../automation/orchestration/orchestrationService.js', () => ({
  startWorkflow: vi.fn(),
}));

vi.mock('./whatsappModelSequenceService.js', () => ({
  resolveWhatsappModelForTenant: vi.fn(),
}));

vi.mock('./opsLeadGatewaySend.js', () => ({
  buildOpsLeadGatewaySendInput: vi.fn(async (base, extras) => ({
    ...base,
    tenantId: extras.opsTenantId ?? '1f1a0f0a-0000-4000-8000-000000000001',
    instanceToken: 'test-platform-instance-token',
    metadata: {
      ...(base.metadata ?? {}),
      acquisition_lead_id: extras.acquisitionLeadId,
      target_tenant_id: extras.targetTenantId ?? null,
      ops_gateway_rollout: true,
    },
  })),
}));

import { pool } from '../utils/db.js';
import { findAcquisitionLeadById } from '../acquisition/acquisitionLeadRepository.js';
import { sendMessage } from '../communication/channelProviderGateway/channelProviderGateway.js';
import { createNotification } from './notifications.js';
import { startWorkflow } from '../automation/orchestration/orchestrationService.js';
import { resolveWhatsappModelForTenant } from './whatsappModelSequenceService.js';
import type { KanbanPhase2AutomationContext } from './kanbanColumnAutomationService.js';
import {
  isOpsLeadPhase2AlreadyExecuted,
  markOpsLeadPhase2Executed,
  runKanbanPhase2AutomationsForLead,
} from './kanbanLeadPhase2AutomationService.js';
import { buildOpsLeadPhase2ExecutionKey } from './kanbanAutomationContext.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';

const LEAD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COLUMN_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARD_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACTOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const CORR_A = 'corr-event-a';
const CORR_B = 'corr-event-b';

const sampleLead = {
  id: LEAD_ID,
  name: 'Lead Test',
  email: 'lead@test.com',
  phone: '5511999999999',
  tenant_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  source: null,
  campaign: null,
  utm_json: {},
  selected_plan_id: null,
  current_stage: 'trial_started' as const,
  activation_score: 'cold' as const,
  abandoned_at: null,
  converted_at: null,
  correlation_id: 'corr-1',
  metadata_json: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function phase2Metadata(overrides?: {
  auto_message_enabled?: boolean;
  notify_operator?: boolean;
  notify_team?: boolean;
  webhook_enabled?: boolean;
  auto_message_mode?: 'free_text' | 'whatsapp_model';
  auto_message_whatsapp_template_id?: string | null;
}) {
  return {
    kanban_phase2: {
      version: 1,
      notifications: {
        notify_operator: overrides?.notify_operator ?? false,
        notify_team: overrides?.notify_team ?? false,
        message_template: null,
        auto_message_enabled: overrides?.auto_message_enabled ?? true,
        auto_message_mode: overrides?.auto_message_mode ?? 'free_text',
        auto_message_template_id: null,
        auto_message_whatsapp_template_id: overrides?.auto_message_whatsapp_template_id ?? null,
        auto_message_text: 'Olá {{contact_name}}, dia 2 do trial!',
      },
      webhook: {
        enabled: overrides?.webhook_enabled ?? false,
        url: overrides?.webhook_enabled ? 'https://example.com/hook' : '',
        method: 'POST' as const,
        timeout_ms: 3000,
        signing_secret: '',
        include_headers: true,
        non_blocking: true,
      },
      crm: {
        enabled: false,
        ensure_client_on_column_entry: false,
        auto_link_or_create_lead: false,
        allow_create_when_no_dedupe_match: true,
      },
      productivity: {
        enabled: false,
        auto_create_task: false,
        task_title_template: '',
        task_description_template: '',
        task_priority: 'medium' as const,
        due_offset_days: null,
        assignee_mode: 'actor' as const,
        assignee_user_id: null,
      },
      automations: {
        auto_move_by_time: {
          enabled: false,
          to_column_id: null,
          to_board_id: null,
          delay_value: 60,
          delay_unit: 'minutes' as const,
        },
      },
    },
  };
}

function baseCtx(overrides?: Partial<KanbanPhase2AutomationContext>): KanbanPhase2AutomationContext {
  return {
    tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
    actorUserId: ACTOR_ID,
    boardId: 'board-1',
    boardLinkedFunnelId: null,
    boardName: 'Engajamento Trial',
    columnId: COLUMN_ID,
    columnName: 'Dia 2',
    cardId: CARD_ID,
    conversationId: '',
    conversationDisplayName: 'Lead Test',
    conversationClientId: null,
    conversationLeadId: LEAD_ID,
    assignedToUserId: null,
    assignedTeamId: null,
    queueId: null,
    attendanceStatus: null,
    columnMetadata: phase2Metadata(),
    subjectKind: 'acquisition_lead',
    acquisitionLeadId: LEAD_ID,
    correlationId: CORR_A,
    ...overrides,
  };
}

function executionKey(correlationId: string): string {
  return buildOpsLeadPhase2ExecutionKey(LEAD_ID, COLUMN_ID, correlationId);
}

function mockEmptyCardMetadata() {
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM chat_kanban_cards') && s.includes('metadata')) {
      return { rows: [{ metadata: {} }], rowCount: 1 } as never;
    }
    if (s.includes('UPDATE chat_kanban_cards')) return { rows: [], rowCount: 1 } as never;
    return { rows: [], rowCount: 0 } as never;
  });
}

function mockRecordedExecution(correlationId: string) {
  const key = executionKey(correlationId);
  vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
    const s = String(sql);
    if (s.includes('FROM chat_kanban_cards') && s.includes('metadata')) {
      return {
        rows: [
          {
            metadata: {
              ops_lead_phase2_executed: { [COLUMN_ID]: '2026-01-01' },
              ops_lead_phase2_executions: {
                [key]: { executed_at: '2026-06-01T00:00:00.000Z', status: 'success' },
              },
            },
          },
        ],
        rowCount: 1,
      } as never;
    }
    return { rows: [], rowCount: 0 } as never;
  });
}

describe('kanbanLeadPhase2AutomationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findAcquisitionLeadById).mockResolvedValue(sampleLead as never);
    vi.mocked(sendMessage).mockResolvedValue({ outcome: 'sent' } as never);
    vi.mocked(createNotification).mockResolvedValue(undefined as never);
    vi.mocked(startWorkflow).mockResolvedValue({ outcome: 'executed' } as never);
    vi.mocked(resolveWhatsappModelForTenant).mockResolvedValue({
      templateName: 'Seq',
      items: [
        {
          position: 0,
          message_type: 'text',
          content: 'Oi',
          media_url: null,
          storage_path: null,
          original_filename: null,
          caption: null,
          delay_seconds: 0,
        },
      ],
    } as never);

    mockEmptyCardMetadata();

    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    } as never);
  });

  it('N5.1-A — mesmo correlationId executa uma vez; retry skip_same_event', async () => {
    const first = await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(first.attempted).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    mockRecordedExecution(CORR_A);
    const second = await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(second.attempted).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('N5.1-B — correlationId diferente executa novamente', async () => {
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: CORR_A }));
    expect(sendMessage).toHaveBeenCalledTimes(1);

    mockEmptyCardMetadata();
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: CORR_B }));
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: executionKey(CORR_B),
      }),
    );
  });

  it('N5.1-C — falha no envio não marca; retry posterior executa novamente', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ outcome: 'failed', error: 'provider_down' } as never);

    const failed = await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(failed.attempted).toBe(true);

    const client = await pool.connect();
    const markCalls = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      String(sql).includes('ops_lead_phase2_executions'),
    );
    expect(markCalls).toHaveLength(0);

    vi.mocked(sendMessage).mockResolvedValue({ outcome: 'sent' } as never);
    mockEmptyCardMetadata();
    await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('N5.1-D — gateway desligado não marca; retry posterior executa novamente', async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ outcome: 'skipped', reason: 'gateway_v1_off' } as never);

    await runKanbanPhase2AutomationsForLead(baseCtx());

    const client = await pool.connect();
    const markCalls = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      String(sql).includes('ops_lead_phase2_executions'),
    );
    expect(markCalls).toHaveLength(0);

    vi.mocked(sendMessage).mockResolvedValue({ outcome: 'sent' } as never);
    mockEmptyCardMetadata();
    await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('N5.1-E — reentrada na coluna com nova correlationId executa novamente', async () => {
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: 'trial:day2:first' }));
    mockEmptyCardMetadata();
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: 'trial:day2:reentry' }));
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('N5.1-F — novo ciclo de trial (nova correlationId) executa novamente', async () => {
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: 'trial-cycle:2026-06' }));
    mockEmptyCardMetadata();
    await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: 'trial-cycle:2026-12' }));
    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it('N5.1-G — webhook falha mas mensagem enviada marca execução', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = baseCtx({ columnMetadata: phase2Metadata({ webhook_enabled: true }) });
    await runKanbanPhase2AutomationsForLead(ctx);

    expect(sendMessage).toHaveBeenCalled();
    const client = await pool.connect();
    const markCalls = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      String(sql).includes('ops_lead_phase2_executions'),
    );
    expect(markCalls.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it('N5.1-H — workflow falha mas mensagem enviada marca execução', async () => {
    vi.mocked(startWorkflow).mockResolvedValue({ outcome: 'failed', reason: 'runtime_error' } as never);

    const ctx = baseCtx({
      columnMetadata: {
        automation_config: { enabled: true, workflow_key: 'ops.trial.day2', sources: { leads: true } },
        ...phase2Metadata(),
      },
    });
    await runKanbanPhase2AutomationsForLead(ctx);

    expect(sendMessage).toHaveBeenCalled();
    const client = await pool.connect();
    const markCalls = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      String(sql).includes('ops_lead_phase2_executions'),
    );
    expect(markCalls.length).toBeGreaterThan(0);
  });

  it('N5.1-I — metadata legado ops_lead_phase2_executed não bloqueia nova execução', async () => {
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('FROM chat_kanban_cards') && s.includes('metadata')) {
        return {
          rows: [{ metadata: { ops_lead_phase2_executed: { [COLUMN_ID]: '2026-01-01' } } }],
          rowCount: 1,
        } as never;
      }
      if (s.includes('UPDATE chat_kanban_cards')) return { rows: [], rowCount: 1 } as never;
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await runKanbanPhase2AutomationsForLead(baseCtx({ correlationId: 'new-after-legacy' }));
    expect(result.attempted).toBe(true);
    expect(sendMessage).toHaveBeenCalled();
  });

  it('auto_message_text envia com executionKey no idempotencyKey', async () => {
    await runKanbanPhase2AutomationsForLead(baseCtx());

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipient: '5511999999999',
        body: expect.stringContaining('Lead Test'),
        idempotencyKey: executionKey(CORR_A),
      }),
    );
  });

  it('N5.2 — sendMessage usa tenant Ops e instanceToken (não lead.tenant_id)', async () => {
    await runKanbanPhase2AutomationsForLead(baseCtx());

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
        instanceToken: 'test-platform-instance-token',
        metadata: expect.objectContaining({
          acquisition_lead_id: LEAD_ID,
          target_tenant_id: sampleLead.tenant_id,
          ops_gateway_rollout: true,
        }),
      }),
    );
  });

  it('whatsapp_model_sequence usa gateway por item', async () => {
    const ctx = baseCtx({
      columnMetadata: phase2Metadata({
        auto_message_mode: 'whatsapp_model',
        auto_message_whatsapp_template_id: '11111111-1111-4111-8111-111111111111',
      }),
    });

    await runKanbanPhase2AutomationsForLead(ctx);

    expect(resolveWhatsappModelForTenant).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalled();
  });

  it('notify_operator cria notificação', async () => {
    const ctx = baseCtx({ columnMetadata: phase2Metadata({ auto_message_enabled: false, notify_operator: true }) });
    await runKanbanPhase2AutomationsForLead(ctx);
    expect(createNotification).toHaveBeenCalled();
  });

  it('lead sem telefone: skipped sem exception e sem marcação', async () => {
    vi.mocked(findAcquisitionLeadById).mockResolvedValue({ ...sampleLead, phone: null } as never);

    const result = await runKanbanPhase2AutomationsForLead(baseCtx());
    expect(result.attempted).toBe(true);
    expect(sendMessage).not.toHaveBeenCalled();

    const client = await pool.connect();
    const markCalls = vi.mocked(client.query).mock.calls.filter(([sql]) =>
      String(sql).includes('ops_lead_phase2_executions'),
    );
    expect(markCalls).toHaveLength(0);
  });

  it('markOpsLeadPhase2Executed grava ops_lead_phase2_executions', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    vi.mocked(pool.connect).mockResolvedValue({
      query: clientQuery,
      release: vi.fn(),
    } as never);

    const key = executionKey(CORR_A);
    await markOpsLeadPhase2Executed(CARD_ID, key, ACTOR_ID);

    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('ops_lead_phase2_executions'),
      expect.arrayContaining([key, CARD_ID, SUPERADMIN_OPS_KANBAN_TENANT_ID]),
    );
  });

  it('isOpsLeadPhase2AlreadyExecuted detecta ops_lead_phase2_executions', async () => {
    const key = executionKey(CORR_A);
    vi.mocked(pool.query).mockImplementation(async (sql: unknown) => {
      const s = String(sql);
      if (s.includes('chat_kanban_cards')) {
        return {
          rows: [
            {
              metadata: {
                ops_lead_phase2_executions: {
                  [key]: { executed_at: '2026-01-01', status: 'success' },
                },
              },
            },
          ],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    expect(await isOpsLeadPhase2AlreadyExecuted(CARD_ID, key)).toBe(true);
  });
});
