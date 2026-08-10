import { describe, expect, it } from 'vitest';
import {
  applyCapturedMediaVariables,
  decideWaitInputCapture,
  pickInboundMedia,
  readWaitInputAccept,
  readWaitInputMediaKinds,
} from './waitInputMedia.js';
import {
  buildWebhookOutBody,
} from './flowHttpActions.js';
import {
  interpolateTemplate,
  processInboundStep,
  type RuntimeGraph,
  type RuntimeSessionSnapshot,
} from './flowRuntimeEngine.js';

function graphWaitMedia(accept: 'text' | 'media' | 'any' = 'media'): RuntimeGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', data: { trigger: { type: 'keyword', value: 'oi' } } },
      {
        id: 'q1',
        type: 'wait_input',
        data: {
          prompt: 'Envie o extrato PDF',
          variable: 'arquivo',
          accept,
          media_kinds: ['document', 'image'],
        },
      },
      {
        id: 'm1',
        type: 'send_message',
        data: { text: 'Recebi {{arquivo.nome}} ({{arquivo.tipo}})' },
      },
      { id: 'e1', type: 'end', data: {} },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'q1', sourceHandle: 'default' },
      { id: 'e2', source: 'q1', target: 'm1', sourceHandle: 'default' },
      { id: 'e3', source: 'm1', target: 'e1', sourceHandle: 'default' },
    ],
  };
}

function waitingSession(graph: RuntimeGraph): RuntimeSessionSnapshot {
  return {
    currentNodeId: 'q1',
    status: 'waiting_input',
    variables: {},
    waitingVariable: 'arquivo',
    resumeAt: null,
  };
}

describe('S32 waitInputMedia helpers', () => {
  it('readWaitInputAccept default text', () => {
    expect(readWaitInputAccept({})).toBe('text');
    expect(readWaitInputAccept({ accept: 'media' })).toBe('media');
    expect(readWaitInputAccept({ accept: 'any' })).toBe('any');
  });

  it('media_kinds default document+image', () => {
    expect(readWaitInputMediaKinds({})).toEqual(['document', 'image']);
    expect(readWaitInputMediaKinds({ media_kinds: ['audio'] })).toEqual(['audio']);
  });

  it('pickInboundMedia extrai url/nome/tipo', () => {
    const m = pickInboundMedia(
      [
        {
          type: 'document',
          url: 'https://cdn.example/extrato.pdf',
          fileName: 'extrato_inss.pdf',
          mimetype: 'application/pdf',
        },
      ],
      ['document', 'image']
    );
    expect(m).toEqual({
      url: 'https://cdn.example/extrato.pdf',
      nome: 'extrato_inss.pdf',
      tipo: 'application/pdf',
      kind: 'document',
      asset_id: null,
    });
  });

  it('decide: media rejeita texto; any prioriza mídia', () => {
    const mediaItems = [
      {
        type: 'document',
        url: 'https://uaz/file.pdf',
        fileName: 'a.pdf',
        mimetype: 'application/pdf',
      },
    ];
    expect(
      decideWaitInputCapture({
        accept: 'media',
        mediaKinds: ['document'],
        messageBody: 'só texto',
        inboundMedia: null,
      }).ok
    ).toBe(false);

    const anyBoth = decideWaitInputCapture({
      accept: 'any',
      mediaKinds: ['document'],
      messageBody: 'legenda',
      inboundMedia: mediaItems,
    });
    expect(anyBoth.ok && anyBoth.mode === 'media').toBe(true);
  });

  it('applyCapturedMediaVariables grava objeto + flat', () => {
    const vars: Record<string, unknown> = {};
    applyCapturedMediaVariables(vars, 'arquivo', {
      url: 'https://x/a.pdf',
      nome: 'a.pdf',
      tipo: 'application/pdf',
      kind: 'document',
    });
    expect(vars.arquivo).toEqual({
      url: 'https://x/a.pdf',
      nome: 'a.pdf',
      tipo: 'application/pdf',
    });
    expect(vars['arquivo.url']).toBe('https://x/a.pdf');
    expect(vars['arquivo.nome']).toBe('a.pdf');
    expect(vars['arquivo.tipo']).toBe('application/pdf');
  });
});

describe('S32 wait_input runtime', () => {
  it('accept:media grava arquivo.* após PDF', () => {
    const g = graphWaitMedia('media');
    const r = processInboundStep({
      graph: g,
      session: waitingSession(g),
      messageBody: null,
      inboundMedia: [
        {
          type: 'document',
          url: 'https://uazapi.example/extrato.pdf',
          fileName: 'extrato_inss.pdf',
          mimetype: 'application/pdf',
        },
      ],
    });
    expect(r.session.status).not.toBe('waiting_input');
    expect(r.session.variables['arquivo.url']).toBe('https://uazapi.example/extrato.pdf');
    expect(r.session.variables['arquivo.nome']).toBe('extrato_inss.pdf');
    expect(r.session.variables['arquivo.tipo']).toBe('application/pdf');
    expect(r.session.variables.arquivo).toMatchObject({
      url: 'https://uazapi.example/extrato.pdf',
      nome: 'extrato_inss.pdf',
      tipo: 'application/pdf',
    });
    const send = r.actions.find((a) => a.type === 'send_text');
    expect(send && send.type === 'send_text' ? send.text : '').toContain('extrato_inss.pdf');
  });

  it('accept:text inalterado (só texto)', () => {
    const g = graphWaitMedia('text');
    const r = processInboundStep({
      graph: g,
      session: waitingSession(g),
      messageBody: 'João',
      inboundMedia: [
        {
          type: 'document',
          url: 'https://uazapi.example/x.pdf',
          fileName: 'x.pdf',
          mimetype: 'application/pdf',
        },
      ],
    });
    expect(r.session.variables.arquivo).toBe('João');
    expect(r.session.variables['arquivo.url']).toBeUndefined();
  });

  it('accept:media rejeita texto e re-prompt', () => {
    const g = graphWaitMedia('media');
    const r = processInboundStep({
      graph: g,
      session: waitingSession(g),
      messageBody: 'não tenho pdf',
      inboundMedia: null,
    });
    expect(r.session.status).toBe('waiting_input');
    expect(r.session.waitingVariable).toBe('arquivo');
    expect(r.session.variables.arquivo).toBeUndefined();
    const send = r.actions.find((a) => a.type === 'send_text');
    expect(send && send.type === 'send_text' ? send.text : '').toMatch(/arquivo/i);
  });

  it('accept:any com texto avança', () => {
    const g = graphWaitMedia('any');
    const r = processInboundStep({
      graph: g,
      session: waitingSession(g),
      messageBody: 'sem arquivo',
      inboundMedia: null,
    });
    expect(r.session.status).not.toBe('waiting_input');
    expect(r.session.variables.arquivo).toBe('sem arquivo');
  });

  it('webhook_out custom interpola {{arquivo.url}}', () => {
    const vars = {
      cpf: '42362903400',
      'arquivo.url': 'https://uazapi.example/extrato.pdf',
      'arquivo.nome': 'extrato_inss.pdf',
      'arquivo.tipo': 'application/pdf',
      arquivo: {
        url: 'https://uazapi.example/extrato.pdf',
        nome: 'extrato_inss.pdf',
        tipo: 'application/pdf',
      },
    };
    const body = buildWebhookOutBody({
      payloadMode: 'custom',
      bodyTemplate: JSON.stringify({
        cpf: '{{cpf}}',
        arquivo: {
          nome: '{{arquivo.nome}}',
          tipo: '{{arquivo.tipo}}',
          url: '{{arquivo.url}}',
        },
      }),
      variables: vars,
      conversationId: 'c1',
      tenantId: 't1',
      includeSessionVars: false,
    });
    expect(JSON.parse(body)).toEqual({
      cpf: '42362903400',
      arquivo: {
        nome: 'extrato_inss.pdf',
        tipo: 'application/pdf',
        url: 'https://uazapi.example/extrato.pdf',
      },
    });
    expect(interpolateTemplate('obj={{arquivo}}', vars)).toContain('extrato_inss.pdf');
  });
});
