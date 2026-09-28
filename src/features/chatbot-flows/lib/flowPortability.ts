/** Contrato painelcrm.chatbot_flow v1 (cliente) + resolve S21. */
import {
  adaptChatbotFlowData,
  detectFlowImportFormat,
  type ForeignImportReport,
} from './flowForeignImport';

export const FLOW_EXPORT_FORMAT = 'painelcrm.chatbot_flow' as const;
export const FLOW_EXPORT_FORMAT_VERSION = 1 as const;

export type ChatbotFlowExportDocument = {
  format: typeof FLOW_EXPORT_FORMAT;
  format_version: number;
  exported_at: string;
  flow: { name: string; trigger?: unknown };
  graph: { nodes: unknown[]; edges: unknown[] };
};

export type ExportPreview = {
  name: string;
  nodeCount: number;
  edgeCount: number;
};

export type { ForeignImportReport };

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|secret|password|passwd|token|bearer|x-api-key)$/i;

function stripSensitiveFromValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveFromValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      if (k === 'headers' && v && typeof v === 'object' && !Array.isArray(v)) {
        const headers: Record<string, unknown> = {};
        for (const [hk, hv] of Object.entries(v as Record<string, unknown>)) {
          if (SENSITIVE_KEY_RE.test(hk)) continue;
          headers[hk] = stripSensitiveFromValue(hv);
        }
        out[k] = headers;
        continue;
      }
      if (k === 'headers' && Array.isArray(v)) {
        out[k] = v
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const item = row as Record<string, unknown>;
            const hk = String(item.key || '');
            if (SENSITIVE_KEY_RE.test(hk)) return null;
            return { key: hk, value: String(item.value ?? '') };
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

function sanitizeGraph(graph: { nodes: unknown[]; edges: unknown[] }) {
  return {
    nodes: (graph.nodes || []).map((n) => stripSensitiveFromValue(n)),
    edges: (graph.edges || []).map((e) => stripSensitiveFromValue(e)),
  };
}

export function parseExportDocumentClient(
  raw: unknown
): { ok: true; doc: ChatbotFlowExportDocument; preview: ExportPreview } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON inválido' };
  const obj = raw as Record<string, unknown>;
  if (obj.format !== FLOW_EXPORT_FORMAT) {
    return {
      ok: false,
      error: `Formato desconhecido (esperado ${FLOW_EXPORT_FORMAT} ou chatbot.flow_data)`,
    };
  }
  if (typeof obj.format_version !== 'number') {
    return { ok: false, error: 'format_version inválido' };
  }
  if (obj.format_version > FLOW_EXPORT_FORMAT_VERSION) {
    return {
      ok: false,
      error: `format_version ${obj.format_version} não suportada (máx. ${FLOW_EXPORT_FORMAT_VERSION})`,
    };
  }
  const flow = obj.flow && typeof obj.flow === 'object' ? (obj.flow as Record<string, unknown>) : null;
  const graph = obj.graph && typeof obj.graph === 'object' ? (obj.graph as Record<string, unknown>) : null;
  if (!flow || typeof flow.name !== 'string' || !flow.name.trim()) {
    return { ok: false, error: 'Nome do flow ausente no documento' };
  }
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    return { ok: false, error: 'Grafo inválido (nodes/edges)' };
  }
  const doc: ChatbotFlowExportDocument = {
    format: FLOW_EXPORT_FORMAT,
    format_version: obj.format_version,
    exported_at: typeof obj.exported_at === 'string' ? obj.exported_at : new Date().toISOString(),
    flow: { name: flow.name.trim().slice(0, 200), trigger: flow.trigger },
    graph: { nodes: graph.nodes, edges: graph.edges },
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

export type ResolveImportClientResult =
  | {
      ok: true;
      doc: ChatbotFlowExportDocument;
      preview: ExportPreview;
      sourceFormat: 'painelcrm.chatbot_flow' | 'chatbot.flow_data';
      createOnly: boolean;
      report: ForeignImportReport | null;
    }
  | { ok: false; error: string };

/** Resolve nativo ou chatbot.flow_data no cliente (S21). */
export function resolveImportDocumentClient(raw: unknown): ResolveImportClientResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'JSON inválido' };
  const obj = raw as Record<string, unknown>;

  if (obj.format === FLOW_EXPORT_FORMAT) {
    const parsed = parseExportDocumentClient(raw);
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      doc: parsed.doc,
      preview: parsed.preview,
      sourceFormat: 'painelcrm.chatbot_flow',
      createOnly: false,
      report: null,
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
    createOnly: true,
    report: {
      ...adapted.report,
      nodeCount: doc.graph.nodes.length,
      edgeCount: doc.graph.edges.length,
    },
  };
}

export function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function slugifyFilename(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'flow'
  );
}
