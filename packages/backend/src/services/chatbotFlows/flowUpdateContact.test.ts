import { describe, expect, it } from 'vitest';
import { processInboundStep, type RuntimeGraph } from './flowRuntimeEngine.js';

describe('S20 wait_input save_to_contact', () => {
  const graph: RuntimeGraph = {
    nodes: [
      { id: 'start', type: 'start', data: { trigger: { type: 'first_message' } } },
      {
        id: 'q',
        type: 'wait_input',
        data: {
          prompt: 'Qual seu nome?',
          variable: 'nome',
          save_to_contact: true,
          contact_field: 'name',
        },
      },
      { id: 'end', type: 'end', data: {} },
    ],
    edges: [
      { id: 'a', source: 'start', target: 'q', sourceHandle: 'default' },
      { id: 'b', source: 'q', target: 'end', sourceHandle: 'default' },
    ],
  };

  it('emite update_contact ao capturar resposta', () => {
    const waiting = processInboundStep({
      graph,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'oi',
      justStarted: true,
    });
    expect(waiting.session.status).toBe('waiting_input');

    const r = processInboundStep({
      graph,
      session: waiting.session,
      messageBody: 'Maria Silva',
    });
    expect(r.session.variables.nome).toBe('Maria Silva');
    expect(r.actions.find((a) => a.type === 'update_contact')).toMatchObject({
      type: 'update_contact',
      field: 'name',
      value: 'Maria Silva',
      ensureLead: true,
    });
    expect(r.session.status).toBe('ended');
  });

  it('não emite update_contact quando save_to_contact=false', () => {
    const g: RuntimeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'q'
          ? { ...n, data: { prompt: 'x', variable: 'a', save_to_contact: false } }
          : n
      ),
    };
    const waiting = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'oi',
      justStarted: true,
    });
    const r = processInboundStep({
      graph: g,
      session: waiting.session,
      messageBody: 'João',
    });
    expect(r.session.variables.a).toBe('João');
    expect(r.actions.some((a) => a.type === 'update_contact')).toBe(false);
  });

  it('emite update_contact para cpf_cnpj', () => {
    const g: RuntimeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'q'
          ? {
              ...n,
              data: {
                prompt: 'CPF?',
                variable: 'cpf',
                save_to_contact: true,
                contact_field: 'cpf_cnpj',
              },
            }
          : n
      ),
    };
    const waiting = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    const r = processInboundStep({
      graph: g,
      session: waiting.session,
      messageBody: '529.982.247-25',
    });
    expect(r.actions.find((a) => a.type === 'update_contact')).toMatchObject({
      type: 'update_contact',
      field: 'cpf_cnpj',
      value: '529.982.247-25',
      ensureLead: true,
    });
  });

  it('respeita ensure_lead=false (opt-out S35)', () => {
    const g: RuntimeGraph = {
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === 'q'
          ? {
              ...n,
              data: {
                prompt: 'x',
                variable: 'a',
                save_to_contact: true,
                ensure_lead: false,
                contact_field: 'name',
              },
            }
          : n
      ),
    };
    const waiting = processInboundStep({
      graph: g,
      session: {
        status: 'active',
        currentNodeId: null,
        variables: {},
        waitingVariable: null,
      },
      messageBody: 'x',
      justStarted: true,
    });
    const r = processInboundStep({
      graph: g,
      session: waiting.session,
      messageBody: 'Ana',
    });
    expect(r.actions.find((a) => a.type === 'update_contact')).toMatchObject({
      type: 'update_contact',
      field: 'name',
      value: 'Ana',
      ensureLead: false,
    });
  });
});
