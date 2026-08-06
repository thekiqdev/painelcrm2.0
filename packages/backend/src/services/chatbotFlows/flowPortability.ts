/**
 * Contrato portável painelcrm.chatbot_flow v1 (export/import S2).
 * S21: resolveImportDocument também aceita chatbot.flow_data via adaptador.
 */
import { z } from 'zod';
import type { ChatbotFlowGraph } from './graphValidation.js';
import {
  adaptChatbotFlowData,
  detectFlowImportFormat,
  type ForeignImportReport,
} from './flowForeignImport.js';

export const FLOW_EXPORT_FORMAT = 'painelcrm.chatbot_flow' as const;
export const FLOW_EXPORT_FORMAT_VERSION = 1 as const;

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|secret|password|passwd|token|bearer|x-api-key)$/i;

/** Campos só de editor (S14 HTTP · S27 webhook sample) — não vão para publish/export. */
const EDITOR_SAMPLE_KEY_RE = /^last_(test_|payload_)/;

const graphSchema = z.object({
  nodes: z.array(z.unknown()),
  edges: z.array(z.unknown()),
});

const exportDocSchema = z.object({
  format: z.literal(FLOW_EXPORT_FORMAT),
  format_version: z.number().int().positive(),
  exported_at: z.string().optional(),
  flow: z
    .object({
      name: z.string().trim().min(1).max(200),
      trigger: z.unknown().optional(),
    })
    .passthrough(),
  graph: graphSchema,
});

export type ChatbotFlowExportDocument = {
  format: typeof FLOW_EXPORT_FORMAT;
  format_version: number;
  exported_at: string;
  flow: {
    name: string;
    trigger?: unknown;
  };
  graph: ChatbotFlowGraph;
};

export type ParseExportResult =
  | { ok: true; doc: ChatbotFlowExportDocument; preview: { name: string; nodeCount: number; edgeCount: number } }
  | { ok: false; error: string };

function stripSensitiveFromValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripSensitiveFromValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      if (EDITOR_SAMPLE_KEY_RE.test(k)) continue;
      // headers maps comuns em nós HTTP
      if (k === 'headers' && v && typeof v === 'object' && !Array.isArray(v)) {
        const headers: Record<string, unknown> = {};
        for (const [hk, hv] of Object.entries(v as Record<string, unknown>)) {
          if (SENSITIVE_KEY_RE.test(hk)) continue;
          headers[hk] = stripSensitiveFromValue(hv);
        }
        out[k] = headers;
        continue;
      }
      // headers como lista { key, value } (S5 http_request)
      if (k === 'headers' && Array.isArray(v)) {
        out[k] = v
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const item = row as Record<string, unknown>;
            const hk = String(item.key || '');
            if (SENSITIVE_KEY_RE.test(hk)) return null;
            return {
              key: hk,
              value: typeof item.value === 'string' ? item.value : String(item.value ?? ''),
            };
          })
          .filter(Boolean);
        continue;
      }
      out[k] = stripSensitiveFromValue(v);
    }
    return out;
  }
  return value;
}

/** Remove só samples do editor (mantém secrets do draft para runtime). */
export function stripEditorSamplesFromGraph(graph: ChatbotFlowGraph): ChatbotFlowGraph {
  return {
    nodes: (graph.nodes || []).map((n) => {
      if (!n || typeof n !== 'object') return n;
      const node = n as Record<string, unknown>;
      const data =
        node.data && typeof node.data === 'object'
          ? (node.data as Record<string, unknown>)
          : null;
      if (!data) return n;
      const nextData: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        if (EDITOR_SAMPLE_KEY_RE.test(k)) continue;
        nextData[k] = v;
      }
      return { ...node, data: nextData };
    }),
    edges: graph.edges || [],
  };
}

export function sanitizeGraph(graph: ChatbotFlowGraph): ChatbotFlowGraph {
  return {
    nodes: (graph.nodes || []).map((n) => stripSensitiveFromValue(n)),
    edges: (graph.edges || []).map((e) => stripSensitiveFromValue(e)),
  };
}

function extractStartTrigger(graph: ChatbotFlowGraph): unknown {
  for (const n of graph.nodes || []) {
    if (!n || typeof n !== 'object') continue;
    const node = n as Record<string, unknown>;
    if (node.type !== 'start') continue;
    const data = node.data && typeof node.data === 'object' ? (node.data as Record<string, unknown>) : {};
    return data.trigger ?? { type: 'first_message' };
  }
  return { type: 'first_message' };
}

export function buildExportDocument(opts: {
  name: string;
  graph: ChatbotFlowGraph;
}): ChatbotFlowExportDocument {
  const graph = sanitizeGraph(opts.graph);
  return {
    format: FLOW_EXPORT_FORMAT,
    format_version: FLOW_EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    flow: {
      name: opts.name.trim().slice(0, 200) || 'Flow',
      trigger: extractStartTrigger(graph),
    },
    graph,
  };
}

export function parseExportDocument(raw: unknown): ParseExportResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'JSON inválido' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== FLOW_EXPORT_FORMAT) {
    return {
      ok: false,
      error: `Formato desconhecido (esperado ${FLOW_EXPORT_FORMAT} ou chatbot.flow_data)`,
    };
  }
  if (typeof obj.format_version !== 'number' || !Number.isFinite(obj.format_version)) {
    return { ok: false, error: 'format_version inválido' };
  }
  if (obj.format_version > FLOW_EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `format_version ${obj.format_version} não suportada (máx. ${FLOW_EXPORT_FORMAT_VERSION})`,
    };
  }
  if (obj.format_version < 1) {
    return { ok: false, error: 'format_version inválida' };
  }

  const parsed = exportDocSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || 'Documento malformado',
    };
  }

  const graph = sanitizeGraph({
    nodes: parsed.data.graph.nodes,
    edges: parsed.data.graph.edges,
  });

  const doc: ChatbotFlowExportDocument = {
    format: FLOW_EXPORT_FORMAT,
    format_version: parsed.data.format_version,
    exported_at: parsed.data.exported_at || new Date().toISOString(),
    flow: {
      name: parsed.data.flow.name.trim().slice(0, 200),
      trigger: parsed.data.flow.trigger,
    },
    graph,
  };

  return {
    ok: true,
    doc,
    preview: {
      name: doc.flow.name,
      nodeCount: doc.graph.nodes.length,
      edgeCount: doc.graph.edges.length,
    },
  };
}

export type ResolveImportResult =
  | {
      ok: true;
      doc: ChatbotFlowExportDocument;
      preview: { name: string; nodeCount: number; edgeCount: number };
      sourceFormat: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
      /** Presente quando origem é chatbot.flow_data */
      report?: ForeignImportReport;
      /** Formato estrangeiro: só create na v1 */
      createOnly: boolean;
    }
  | { ok: false; error: string };

/**
 * Resolve documento de import nativo ou estrangeiro (S21).
 * Estrangeiro é adaptado para painelcrm.chatbot_flow + relatório.
 */
export function resolveImportDocument(raw: unknown): ResolveImportResult {
  if (raw == null || typeof raw !== 'object') {
    return { ok: false, error: 'JSON inválido' };
  }
  const obj = raw as Record<string, unknown>;

  if (obj.format === FLOW_EXPORT_FORMAT) {
    const parsed = parseExportDocument(raw);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      doc: parsed.doc,
      preview: parsed.preview,
      sourceFormat: 'painelcrm.chatbot_flow',
      createOnly: false,
    };
  }

  const fmt = detectFlowImportFormat(raw);
  if (fmt !== 'chatbot.flow_data') {
    return {
      ok: false,
      error: `Formato desconhecido (esperado ${FLOW_EXPORT_FORMAT} ou chatbot.flow_data)`,
    };
  }
  const adapted = adaptChatbotFlowData(raw);
  if (!adapted.ok) return { ok: false, error: adapted.error };

  const graph = sanitizeGraph(adapted.doc.graph);
  const doc: ChatbotFlowExportDocument = {
    format: FLOW_EXPORT_FORMAT,
    format_version: FLOW_EXPORT_FORMAT_VERSION,
    exported_at: adapted.doc.exported_at,
    flow: { name: adapted.doc.flow.name },
    graph,
  };

  return {
    ok: true,
    doc,
    preview: {
      name: doc.flow.name,
      nodeCount: doc.graph.nodes.length,
      edgeCount: doc.graph.edges.length,
    },
    sourceFormat: 'chatbot.flow_data',
    report: {
      ...adapted.report,
      nodeCount: doc.graph.nodes.length,
      edgeCount: doc.graph.edges.length,
    },
    createOnly: true,
  };
}
