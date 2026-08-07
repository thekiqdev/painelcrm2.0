/**
 * Testes S28.1 — webhook sem conversation_id (órfã + reachability).
 */
import { describe, expect, it } from 'vitest';
import {
  collectWebhookOrphanConversationWarnings,
  findWebhookConversationPathGaps,
  type ChatbotFlowGraph,
} from './graphValidation.js';
import {
  CONVERSATION_REQUIRED_ERROR,
  runtimeActionRequiresConversation,
  webhookGraphSupportsOrphanSession,
} from './flowWebhookOrphan.js';

function graph(nodes: unknown[], edges: unknown[]): ChatbotFlowGraph {
  return { nodes, edges };
}

describe('S28.1 webhook orphan / conversation_required', () => {
  it('runtimeActionRequiresConversation cobre send WhatsApp', () => {
    expect(runtimeActionRequiresConversation('send_text')).toBe(true);
    expect(runtimeActionRequiresConversation('send_media')).toBe(true);
    expect(runtimeActionRequiresConversation('send_menu')).toBe(true);
    expect(runtimeActionRequiresConversation('delay')).toBe(false);
    expect(runtimeActionRequiresConversation('http_request')).toBe(false);
    expect(CONVERSATION_REQUIRED_ERROR).toBe('conversation_required');
  });

  it('webhookGraphSupportsOrphanSession exige webhook_in', () => {
    expect(
      webhookGraphSupportsOrphanSession(
        graph([{ id: 's', type: 'start', data: {} }], [])
      )
    ).toBe(false);
    expect(
      webhookGraphSupportsOrphanSession(
        graph([{ id: 'w', type: 'webhook_in', data: { token: 'tokentokentoken12' } }], [])
      )
    ).toBe(true);
  });

  it('detecta gap: webhook → send_message sem ensure_conversation', () => {
    const g = graph(
      [
        { id: 'w', type: 'webhook_in', data: { token: 'tokentokentoken12' } },
        { id: 'm', type: 'send_message', data: { text: 'oi' } },
        { id: 'e', type: 'end', data: {} },
      ],
      [
        { id: 'e1', source: 'w', target: 'm' },
        { id: 'e2', source: 'm', target: 'e' },
      ]
    );
    const gaps = findWebhookConversationPathGaps(g);
    expect(gaps.hasWebhookIn).toBe(true);
    expect(gaps.hasEnsureOnAllPaths).toBe(false);
    expect(gaps.gapNodeIds).toContain('m');
    const warnings = collectWebhookOrphanConversationWarnings(g);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toMatch(/ensure_conversation/);
  });

  it('sem gap se ensure_conversation antes do send', () => {
    const g = graph(
      [
        { id: 'w', type: 'webhook_in', data: { token: 'tokentokentoken12' } },
        { id: 'ec', type: 'ensure_conversation', data: {} },
        { id: 'm', type: 'send_message', data: { text: 'oi' } },
        { id: 'e', type: 'end', data: {} },
      ],
      [
        { id: 'e1', source: 'w', target: 'ec' },
        { id: 'e2', source: 'ec', target: 'm' },
        { id: 'e3', source: 'm', target: 'e' },
      ]
    );
    const gaps = findWebhookConversationPathGaps(g);
    expect(gaps.hasEnsureOnAllPaths).toBe(true);
    expect(gaps.gapNodeIds).toEqual([]);
    expect(collectWebhookOrphanConversationWarnings(g)).toEqual([]);
  });

  it('set_variable / delay / http sem conversa não geram gap', () => {
    const g = graph(
      [
        { id: 'w', type: 'webhook_in', data: { token: 'tokentokentoken12' } },
        { id: 'sv', type: 'set_variable', data: { assignments: [{ name: 'x', value: '1' }] } },
        { id: 'd', type: 'delay', data: { amount: 1, unit: 'seconds' } },
        { id: 'e', type: 'end', data: {} },
      ],
      [
        { id: 'e1', source: 'w', target: 'sv' },
        { id: 'e2', source: 'sv', target: 'd' },
        { id: 'e3', source: 'd', target: 'e' },
      ]
    );
    expect(findWebhookConversationPathGaps(g).hasEnsureOnAllPaths).toBe(true);
    expect(collectWebhookOrphanConversationWarnings(g)).toEqual([]);
  });
});
