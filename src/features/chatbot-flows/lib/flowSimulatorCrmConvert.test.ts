import { describe, expect, it } from 'vitest';
import { EMPTY_TEST_SUBJECT } from './flowTestSubject';
import {
  createIdleSimulation,
  resolveHttpSimulation,
  startSimulation,
} from './flowSimulator';
import type { RuntimeGraph } from './runtimeEngine';

const graph: RuntimeGraph = {
  nodes: [
    { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
    { id: 'cvt', type: 'crm_convert', data: { mode: 'to_lead' } },
    { id: 'ok', type: 'end', data: {} },
    { id: 'err', type: 'end', data: {} },
    { id: 'cli', type: 'end', data: {} },
  ],
  edges: [
    { id: 'a', source: 'start', target: 'cvt', sourceHandle: 'default' },
    { id: 'b', source: 'cvt', target: 'ok', sourceHandle: 'default' },
    { id: 'c', source: 'cvt', target: 'err', sourceHandle: 'error' },
    { id: 'd', source: 'cvt', target: 'cli', sourceHandle: 'already_client' },
  ],
};

describe('S35 crm_convert no Testar', () => {
  it('segue sozinho com lead fictício quando não há sujeito', () => {
    const sim = startSimulation(graph, EMPTY_TEST_SUBJECT);
    expect(sim.session.status).toBe('ended');
    expect(String(sim.session.variables['lead.id'] || sim.session.variables.lead_id)).toBe(
      'sim-lead-1'
    );
    expect(sim.visitedNodeIds).toContain('ok');
    expect(sim.pendingHttpKind).toBeNull();
  });

  it('Forçar erro segue a saída error', () => {
    const idle = createIdleSimulation();
    const waiting = {
      ...idle,
      session: {
        status: 'waiting_http' as const,
        currentNodeId: 'cvt',
        variables: {},
        waitingVariable: null,
      },
      currentNodeId: 'cvt',
      pendingHttp: true,
      pendingHttpKind: 'crm_convert' as const,
      running: true,
    };
    const next = resolveHttpSimulation(graph, waiting, false);
    expect(next.visitedNodeIds).toContain('err');
    expect(String(next.session.variables.crm_convert_error || '')).toBe('forced_error');
  });
});
