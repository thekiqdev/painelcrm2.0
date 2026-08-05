/**
 * Variáveis definidas pelos nós do próprio flow (para o picker S10/S14+).
 */

import { NODE_LABELS, type EssentialNodeType } from './nodeCatalog';

const VAR_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export type FlowDefinedVariable = {
  name: string;
  label: string;
  source: string;
  nodeId: string;
};

type FlowNodeLike = {
  id: string;
  type?: string | null;
  data?: Record<string, unknown> | null;
};

function pushVar(
  out: Map<string, FlowDefinedVariable>,
  nameRaw: unknown,
  opts: { label?: string; source: string; nodeId: string }
) {
  const name = String(nameRaw || '').trim();
  if (!VAR_NAME_RE.test(name)) return;
  if (out.has(name)) return;
  out.set(name, {
    name,
    label: opts.label || name,
    source: opts.source,
    nodeId: opts.nodeId,
  });
}

function nodeTypeLabel(type: string): string {
  return NODE_LABELS[type as EssentialNodeType] || type;
}

/** Coleta nomes de variáveis criadas/capturadas pelos nós do draft. */
export function collectFlowDefinedVariables(nodes: FlowNodeLike[]): FlowDefinedVariable[] {
  const out = new Map<string, FlowDefinedVariable>();

  for (const n of nodes) {
    const type = String(n.type || '');
    const data = (n.data && typeof n.data === 'object' ? n.data : {}) as Record<string, unknown>;
    const src = nodeTypeLabel(type);

    if (type === 'wait_input' || type === 'select_invoice' || type === 'menu_choice') {
      pushVar(out, data.variable || 'answer', {
        label: String(data.variable || 'answer'),
        source: src,
        nodeId: n.id,
      });
    }

    if (type === 'set_variable') {
      pushVar(out, data.variable, {
        label: String(data.variable || ''),
        source: src,
        nodeId: n.id,
      });
    }

    if (type === 'http_request') {
      pushVar(out, data.status_variable, {
        label: String(data.status_variable || ''),
        source: `${src} · status`,
        nodeId: n.id,
      });
      pushVar(out, data.response_variable, {
        label: String(data.response_variable || ''),
        source: `${src} · body`,
        nodeId: n.id,
      });
      if (Array.isArray(data.response_map)) {
        for (const row of data.response_map) {
          if (!row || typeof row !== 'object') continue;
          const r = row as Record<string, unknown>;
          const path = String(r.path || '').trim();
          pushVar(out, r.variable, {
            label: path ? `${String(r.variable)} ← ${path}` : String(r.variable || ''),
            source: `${src} · map`,
            nodeId: n.id,
          });
        }
      }
    }

    if (type === 'menu_choice' && Array.isArray(data.options)) {
      for (const opt of data.options) {
        if (!opt || typeof opt !== 'object') continue;
        const o = opt as Record<string, unknown>;
        const setVars = Array.isArray(o.set_variables) ? o.set_variables : [];
        for (const sv of setVars) {
          if (!sv || typeof sv !== 'object') continue;
          const s = sv as Record<string, unknown>;
          pushVar(out, s.name, {
            label: String(s.name || ''),
            source: `${src} · opção ${String(o.label || o.id || '')}`.trim(),
            nodeId: n.id,
          });
        }
      }
    }

    if (type === 'invoice_assist') {
      pushVar(out, 'answer', {
        label: 'answer',
        source: src,
        nodeId: n.id,
      });
    }
  }

  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Extrai tokens {{chave}} de um texto de template. */
export function extractTemplateTokens(text: string): string[] {
  const re = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ''))) {
    found.add(m[1]!);
  }
  return [...found];
}
