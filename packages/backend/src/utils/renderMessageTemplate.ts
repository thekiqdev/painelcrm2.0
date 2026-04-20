/**
 * Substituição simples e segura de placeholders `{{chave}}` em textos de template.
 * Sem eval; chaves desconhecidas ou sem valor no contexto permanecem literais.
 * (Espelha `src/utils/renderMessageTemplate.ts` do app.)
 */
export type MessageTemplateContext = Record<string, string>;

/** Permite `{{cliente_nome}}` e `{{contract.value_formatted}}`. */
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderMessageTemplate(template: string, context: MessageTemplateContext): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(context, key)) return full;
    const v = context[key];
    if (v == null) return '';
    return String(v);
  });
}
