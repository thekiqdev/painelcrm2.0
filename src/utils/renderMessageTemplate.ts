/**
 * Substituição simples e segura de placeholders `{{chave}}` em textos de template.
 * Sem eval; chaves desconhecidas ou sem valor no contexto permanecem literais.
 */
export type MessageTemplateContext = Record<string, string>;

/** Permite chaves simples e aninhadas com ponto, ex.: `{{contract.value}}`. */
const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderMessageTemplate(
  template: string,
  context: MessageTemplateContext,
): string {
  if (!template) return '';
  return template.replace(PLACEHOLDER_RE, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(context, key)) return full;
    const v = context[key];
    if (v == null) return '';
    return String(v);
  });
}
