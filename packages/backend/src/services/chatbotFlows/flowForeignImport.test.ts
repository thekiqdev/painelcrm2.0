import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { adaptChatbotFlowData, detectFlowImportFormat } from './flowForeignImport.js';
import { parseExportDocument, resolveImportDocument } from './flowPortability.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/chatbot_flow_data_sanitized.json'), 'utf8')
);

describe('S21 foreign import', () => {
  it('detecta chatbot.flow_data', () => {
    expect(detectFlowImportFormat(fixture)).toBe('chatbot.flow_data');
    expect(detectFlowImportFormat({ format: 'painelcrm.chatbot_flow' })).toBe(
      'painelcrm.chatbot_flow'
    );
  });

  it('adapta fixture: mapeia tipos, omite unsupported, strip secrets', () => {
    const r = adaptChatbotFlowData(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.report.omitted.some((o) => o.fromType === 'ai_agent')).toBe(true);
    expect(r.report.mapped.some((m) => m.fromType === 'message' && m.toType === 'send_message')).toBe(
      true
    );
    expect(r.report.mapped.some((m) => m.fromType === 'options' && m.toType === 'menu_choice')).toBe(
      true
    );
    expect(r.report.needsRelink.some((n) => n.toType === 'move_kanban')).toBe(true);
    expect(r.report.brokenEdges.some((e) => e.id === 'e_broken')).toBe(true);
    expect(r.report.secretsStripped).toBeGreaterThan(0);

    const http = r.doc.graph.nodes.find(
      (n) => n && typeof n === 'object' && (n as { id?: string }).id === 'http1'
    ) as { data?: { headers?: Array<{ key: string; value: string }> } };
    const headers = http?.data?.headers || [];
    expect(headers.every((h) => !/api[_-]?key|authorization/i.test(h.key))).toBe(true);

    const graphJson = JSON.stringify(r.doc.graph);
    expect(graphJson).not.toContain('SECRET_SHOULD_NOT_LEAK');
    expect(graphJson).not.toContain('SECRET_TOKEN');
  });

  it('remap handles opt:N, http_failure, case:0, condition_else', () => {
    const r = adaptChatbotFlowData(fixture);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const edges = r.doc.graph.edges as Array<{
      id: string;
      sourceHandle?: string;
    }>;
    expect(edges.find((e) => e.id === 'e4')?.sourceHandle).toBe('opt_0');
    expect(edges.find((e) => e.id === 'e5')?.sourceHandle).toBe('opt_1');
    expect(edges.find((e) => e.id === 'e7')?.sourceHandle).toBe('error');
    expect(edges.find((e) => e.id === 'e8')?.sourceHandle).toMatch(/^case:/);
    expect(edges.find((e) => e.id === 'e9')?.sourceHandle).toBe('else');
  });

  it('resolveImportDocument produz doc nativo sanitizado', () => {
    const resolved = resolveImportDocument(fixture);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.sourceFormat).toBe('chatbot.flow_data');
    expect(resolved.createOnly).toBe(true);
    expect(resolved.doc.format).toBe('painelcrm.chatbot_flow');
    const reparse = parseExportDocument(resolved.doc);
    expect(reparse.ok).toBe(true);
    expect(JSON.stringify(resolved.doc.graph)).not.toContain('SECRET');
  });

  it('formato nativo continua ok e não é createOnly', () => {
    const native = {
      format: 'painelcrm.chatbot_flow',
      format_version: 1,
      flow: { name: 'Nativo' },
      graph: {
        nodes: [{ id: 's', type: 'start', data: { trigger: { type: 'first_message' } } }],
        edges: [],
      },
    };
    const resolved = resolveImportDocument(native);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.sourceFormat).toBe('painelcrm.chatbot_flow');
    expect(resolved.createOnly).toBe(false);
    expect(resolved.report).toBeUndefined();
  });
});
