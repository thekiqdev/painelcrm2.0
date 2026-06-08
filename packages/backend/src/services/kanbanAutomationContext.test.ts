import { describe, expect, it } from 'vitest';
import {
  isColumnAutomationConfigured,
  isOpsAcquisitionLeadCard,
  resolveKanbanAutomationSubject,
  toPhase2AutomationContext,
} from './kanbanAutomationContext.js';
import { SUPERADMIN_OPS_KANBAN_TENANT_ID } from '../config/superadminOpsKanban.js';

describe('kanbanAutomationContext', () => {
  it('resolveKanbanAutomationSubject — acquisition lead sem conversa', () => {
    const subject = resolveKanbanAutomationSubject({
      acquisition_lead_id: 'lead-1',
      conversation_id: null,
    });
    expect(subject).toEqual({ kind: 'acquisition_lead', acquisitionLeadId: 'lead-1' });
  });

  it('resolveKanbanAutomationSubject — conversa tem prioridade quando ambos existem', () => {
    const subject = resolveKanbanAutomationSubject({
      acquisition_lead_id: 'lead-1',
      conversation_id: 'conv-1',
    });
    expect(subject).toEqual({ kind: 'conversation', conversationId: 'conv-1' });
  });

  it('resolveKanbanAutomationSubject — null quando vazio', () => {
    expect(resolveKanbanAutomationSubject({})).toBeNull();
  });

  it('isOpsAcquisitionLeadCard — só no tenant ops', () => {
    expect(
      isOpsAcquisitionLeadCard(SUPERADMIN_OPS_KANBAN_TENANT_ID, {
        acquisition_lead_id: 'l1',
        conversation_id: null,
      }),
    ).toBe(true);
    expect(
      isOpsAcquisitionLeadCard('00000000-0000-4000-8000-000000000002', {
        acquisition_lead_id: 'l1',
        conversation_id: null,
      }),
    ).toBe(false);
  });

  it('isColumnAutomationConfigured — automation_config.enabled', () => {
    expect(
      isColumnAutomationConfigured({
        automation_config: { enabled: true, sources: { new_conversations: true } },
        kanban_phase2: { version: 1 },
      }),
    ).toBe(true);
  });

  it('toPhase2AutomationContext — acquisition lead', () => {
    const ctx = toPhase2AutomationContext({
      tenantId: SUPERADMIN_OPS_KANBAN_TENANT_ID,
      actorUserId: 'user-1',
      boardId: 'board-1',
      boardName: 'Aquisição',
      columnId: 'col-1',
      columnName: 'Novo lead',
      cardId: 'card-1',
      subject: { kind: 'acquisition_lead', acquisitionLeadId: 'lead-1' },
      columnMetadata: {},
      correlationId: 'corr-1',
      acquisitionLead: {
        id: 'lead-1',
        name: 'Test',
        email: 't@test.com',
        phone: '5511999999999',
        current_stage: 'contact_captured',
      },
    });
    expect(ctx.subjectKind).toBe('acquisition_lead');
    expect(ctx.acquisitionLeadId).toBe('lead-1');
    expect(ctx.conversationId).toBe('');
    expect(ctx.correlationId).toBe('corr-1');
  });
});
