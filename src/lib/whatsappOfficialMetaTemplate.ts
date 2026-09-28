/**
 * Espelha validação/normalização do backend (`whatsappOfficialTemplatePayload.ts`)
 * para preview e envio no formulário de modelos Meta.
 */
export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WaTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';

export type WaTemplateButtonInput =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string };

export interface CreateTemplateFormPayload {
  template_name_normalized: string;
  category: WaTemplateCategory;
  language: string;
  header_type: WaTemplateHeaderType;
  header_text?: string;
  header_media_handle?: string;
  body: string;
  footer?: string;
  buttons: WaTemplateButtonInput[];
  variable_examples: Record<string, string>;
}

const NAME_RE = /^[a-z0-9_]+$/;

export function normalizeTemplateName(input: string): string {
  const s = input
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  return s.slice(0, 512);
}

export function extractPlaceholderIndices(...texts: (string | undefined)[]): number[] {
  const set = new Set<number>();
  const re = /\{\{(\d+)\}\}/g;
  for (const t of texts) {
    if (!t) continue;
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, 'g');
    while ((m = r.exec(t)) !== null) {
      set.add(parseInt(m[1]!, 10));
    }
  }
  return [...set].sort((a, b) => a - b);
}

export function validateTemplatePayloadClient(i: CreateTemplateFormPayload): string | null {
  const name = i.template_name_normalized.trim();
  if (!name || !NAME_RE.test(name)) {
    return 'Nome do modelo inválido: use apenas minúsculas, números e _ (sem espaços nem acentos).';
  }
  if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(i.category)) {
    return 'Categoria inválida.';
  }
  if (!i.language?.trim()) return 'Idioma obrigatório.';
  const body = i.body?.trim() || '';
  if (!body) return 'Corpo da mensagem obrigatório.';

  const texts: string[] = [body];
  if (i.header_type === 'TEXT' && i.header_text) texts.push(i.header_text);
  if (i.footer?.trim()) texts.push(i.footer.trim());
  for (const b of i.buttons) {
    if (b.type === 'URL') {
      texts.push(b.url);
      texts.push(b.text);
    }
  }

  const idx = extractPlaceholderIndices(...texts);
  for (const n of idx) {
    const ex = i.variable_examples[String(n)]?.trim();
    if (!ex) return `Defina um exemplo para a variável {{${n}}} (exigido pela Meta).`;
  }

  if (i.header_type === 'TEXT' && (i.header_text?.trim() || '') === '') {
    return 'Cabeçalho texto selecionado: preencha o texto do cabeçalho.';
  }
  if (i.header_type !== 'NONE' && i.header_type !== 'TEXT') {
    const h = i.header_media_handle?.trim();
    if (!h) {
      return 'Cabeçalho imagem/documento/vídeo: indique o handle de exemplo ou escolha texto/nenhum.';
    }
  }

  if (i.buttons.length > 10) return 'Demasiados botões (máx. 10).';

  return null;
}

/** Preenche placeholders {{n}} com exemplos para preview. */
export function fillPreviewPlaceholders(text: string, examples: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, d) => {
    const v = examples[String(d)]?.trim();
    return v || `[{{${d}}}]`;
  });
}
