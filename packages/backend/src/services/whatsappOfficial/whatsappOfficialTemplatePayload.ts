/**
 * Montagem e validação de payloads para criação de Message Templates na Graph API Meta.
 * @see https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/message_templates
 */

export type WaTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type WaTemplateHeaderType = 'NONE' | 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';

export type WaTemplateButtonInput =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string };

export interface CreateTemplatePayloadInput {
  template_name_normalized: string;
  category: WaTemplateCategory;
  language: string;
  header_type: WaTemplateHeaderType;
  header_text?: string;
  /** Handle devolvido pelo upload Resumable da Meta (opcional). */
  header_media_handle?: string;
  body: string;
  footer?: string;
  buttons: WaTemplateButtonInput[];
  /** Chaves "1","2" para {{1}}, {{2}} no corpo/cabeçalho/botões URL */
  variable_examples: Record<string, string>;
}

const NAME_RE = /^[a-z0-9_]+$/;

/** Normaliza nome para regras Meta: minúsculas, sem acentos, espaços → _, só [a-z0-9_]. */
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

/** Índices únicos ordenados p.ex. [1,2] para {{1}} {{2}} */
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

function exampleForIndex(indices: number[], examples: Record<string, string>, idx: number): string {
  const v = examples[String(idx)]?.trim();
  if (!v) throw new Error(`Exemplo em falta para variável {{${idx}}}.`);
  return v;
}

/** Monta array `example.body_text` para a Meta (uma linha com valores por ordem dos placeholders). */
function buildBodyExample(body: string, indices: number[], examples: Record<string, string>): { body_text: string[][] } {
  if (indices.length === 0) return { body_text: [] };
  const row = indices.map((i) => exampleForIndex(indices, examples, i));
  return { body_text: [row] };
}

export function validateTemplatePayload(i: CreateTemplatePayloadInput): string | null {
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
      return 'Cabeçalho imagem/documento/vídeo: envie primeiro o ficheiro à Meta (upload) e cole o handle, ou use cabeçalho texto/nenhum.';
    }
  }

  if (i.buttons.length > 10) return 'Demasiados botões (máx. sugerido 10).';

  return null;
}

/** Constrói o array `components` da Graph API. */
export function buildTemplateComponents(i: CreateTemplatePayloadInput): Record<string, unknown>[] {
  const components: Record<string, unknown>[] = [];

  const body = i.body.trim();
  const bodyIdx = extractPlaceholderIndices(body);

  if (i.header_type === 'TEXT' && i.header_text?.trim()) {
    const ht = i.header_text.trim();
    const hIdx = extractPlaceholderIndices(ht);
    const headerComp: Record<string, unknown> = {
      type: 'HEADER',
      format: 'TEXT',
      text: ht,
    };
    if (hIdx.length > 0) {
      headerComp.example = {
        header_text: hIdx.map((n) => exampleForIndex(hIdx, i.variable_examples, n)),
      };
    }
    components.push(headerComp);
  } else if (i.header_type === 'IMAGE' || i.header_type === 'DOCUMENT' || i.header_type === 'VIDEO') {
    const fmt = i.header_type;
    const handle = i.header_media_handle!.trim();
    components.push({
      type: 'HEADER',
      format: fmt,
      example: { header_handle: [handle] },
    });
  }

  const bodyComp: Record<string, unknown> = { type: 'BODY', text: body };
  if (bodyIdx.length > 0) {
    bodyComp.example = buildBodyExample(body, bodyIdx, i.variable_examples);
  }
  components.push(bodyComp);

  if (i.footer?.trim()) {
    components.push({ type: 'FOOTER', text: i.footer.trim().slice(0, 60) });
  }

  if (i.buttons.length > 0) {
    const graphButtons: Record<string, unknown>[] = [];
    for (const b of i.buttons) {
      if (b.type === 'QUICK_REPLY') {
        graphButtons.push({ type: 'QUICK_REPLY', text: b.text.slice(0, 25) });
      } else if (b.type === 'PHONE_NUMBER') {
        graphButtons.push({
          type: 'PHONE_NUMBER',
          text: b.text.slice(0, 25),
          phone_number: b.phone_number.replace(/\s/g, ''),
        });
      } else {
        const urlIdx = extractPlaceholderIndices(b.url);
        const btn: Record<string, unknown> = {
          type: 'URL',
          text: b.text.slice(0, 25),
          url: b.url,
        };
        if (urlIdx.length > 0) {
          btn.example = urlIdx.map((n) => exampleForIndex(urlIdx, i.variable_examples, n));
        }
        graphButtons.push(btn);
      }
    }
    components.push({ type: 'BUTTONS', buttons: graphButtons });
  }

  return components;
}

/** Corpo JSON para POST /{waba-id}/message_templates */
export function buildCreateTemplateGraphBody(i: CreateTemplatePayloadInput): Record<string, unknown> {
  return {
    name: i.template_name_normalized.trim(),
    language: i.language.trim(),
    category: i.category,
    components: buildTemplateComponents(i),
  };
}

/** Idioma como string ou objeto `{ code }` na resposta da lista Meta. */
export function parseTemplateLanguageFromMeta(t: Record<string, unknown>): string {
  const L = t.language;
  if (typeof L === 'string' && L.trim()) return L.trim();
  if (L && typeof L === 'object' && L !== null && 'code' in L) {
    const c = (L as { code?: unknown }).code;
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return 'pt_BR';
}
