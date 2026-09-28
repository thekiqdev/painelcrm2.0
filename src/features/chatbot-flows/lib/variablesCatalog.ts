/**
 * Re-export do catálogo para o módulo Chatbot Flows (S9) + vars do flow.
 */
import {
  getTemplateVariableCategoriesForScope,
  listTemplateVariablesForScope,
  templateVariableToken,
  TEMPLATE_VARIABLE_CATEGORIES,
  type TemplateVariableCategory,
  type TemplateVariableDefinition,
  type TemplateVariableScope,
} from '@/lib/templateVariables/catalog';
import type { FlowDefinedVariable } from './flowDefinedVariables';

export {
  TEMPLATE_VARIABLE_CATEGORIES,
  getTemplateVariableCategoriesForScope,
  listTemplateVariablesForScope,
  templateVariableToken,
  type TemplateVariableCategory,
  type TemplateVariableDefinition,
  type TemplateVariableScope,
};

export type ChatbotFlowVariableCategory = {
  id: string;
  title: string;
  description?: string;
  fields: TemplateVariableDefinition[];
};

export function getChatbotFlowVariableCategories(
  flowDefined: FlowDefinedVariable[] = []
): ChatbotFlowVariableCategory[] {
  const base = getTemplateVariableCategoriesForScope('chatbot_flows');
  const known = new Set(
    base.flatMap((c) =>
      c.fields.flatMap((f) => [f.key, ...(f.aliases || []), f.key.split('.').pop() || ''])
    )
  );

  const flowFields: TemplateVariableDefinition[] = flowDefined
    .filter((v) => !known.has(v.name))
    .map((v) => ({
      key: v.name,
      aliases: [v.name],
      label: v.label || v.name,
      description: `Definida neste flow (${v.source})`,
      source: v.source,
      scopes: ['chatbot_flows'] as TemplateVariableScope[],
      dynamic: true,
    }));

  const categories: ChatbotFlowVariableCategory[] = [];
  if (flowFields.length) {
    categories.push({
      id: 'flow_defined',
      title: 'Neste flow',
      description: 'Variáveis criadas em perguntas, HTTP, menu e set variável.',
      fields: flowFields,
    });
  }
  categories.push(...base);
  return categories;
}

/** Conjunto de chaves reconhecidas (catálogo + flow) para hint de tokens. */
export function collectKnownVariableKeys(flowDefined: FlowDefinedVariable[] = []): Set<string> {
  const keys = new Set<string>();
  for (const cat of getChatbotFlowVariableCategories(flowDefined)) {
    for (const f of cat.fields) {
      keys.add(f.key);
      for (const a of f.aliases || []) keys.add(a);
    }
  }
  for (const v of flowDefined) keys.add(v.name);
  return keys;
}
