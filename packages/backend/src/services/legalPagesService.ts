import { pool } from '../utils/db.js';
import { sanitizeLegalPageHtml, stripHtmlToPlainText } from '../utils/legalHtmlSanitize.js';

export type LegalPageType = 'privacy_policy' | 'terms_of_service';
export type LegalPublicationStatus = 'draft' | 'published';

export type LegalPagePublicRow = {
  type: LegalPageType;
  html: string;
  published_at: string | null;
  /** Fallback para data de exibição quando published_at é nulo (ex.: legado). */
  updated_at: string | null;
  status: LegalPublicationStatus;
};

export type LegalPageAdminRow = {
  type: LegalPageType;
  content_draft: string;
  content_published: string;
  status: LegalPublicationStatus;
  updated_at: string | null;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
  has_unpublished_changes: boolean;
};

const MIN_VISIBLE_CHARS = 50;
const MAX_HTML_CHARS = 500_000;

function isMissingLegalPagesTable(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = e instanceof Error ? e.message : String(e);
  return code === '42P01' || /relation\s+["']?legal_pages["']?\s+does not exist/i.test(msg);
}

function isMissingDraftColumns(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /column\s+["']?content_draft["']?\s+does not exist/i.test(msg);
}

export function assertLegalHtmlMeetsPublishMinimum(sanitizedHtml: string): { ok: true } | { ok: false; error: string } {
  if (sanitizedHtml.length > MAX_HTML_CHARS) {
    return { ok: false, error: `Conteúdo excede o limite de ${MAX_HTML_CHARS} caracteres.` };
  }
  const plain = stripHtmlToPlainText(sanitizedHtml);
  if (plain.trim().length === 0) {
    return { ok: false, error: 'Não é possível publicar um documento vazio.' };
  }
  if (plain.length < MIN_VISIBLE_CHARS) {
    return {
      ok: false,
      error: `O texto publicável deve ter pelo menos ${MIN_VISIBLE_CHARS} caracteres visíveis.`,
    };
  }
  return { ok: true };
}

function computeHasUnpublishedChanges(draft: string, published: string): boolean {
  return draft.trim() !== published.trim();
}

export async function getLegalPagePublished(type: LegalPageType): Promise<LegalPagePublicRow> {
  try {
    const r = await pool.query<{
      content_published: string | null;
      published_at: Date | null;
      updated_at: Date | null;
      status: string | null;
    }>(
      `SELECT content_published, published_at, updated_at, status FROM legal_pages WHERE type = $1`,
      [type],
    );
    const row = r.rows[0];
    if (!row) {
      return { type, html: '', published_at: null, updated_at: null, status: 'draft' };
    }
    const publishedRaw = row.content_published ?? '';
    const html = sanitizeLegalPageHtml(publishedRaw);
    const status: LegalPublicationStatus =
      row.status === 'published' ? 'published' : 'draft';
    return {
      type,
      html,
      published_at: row.published_at ? row.published_at.toISOString() : null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      status,
    };
  } catch (e: unknown) {
    if (isMissingDraftColumns(e)) {
      throw new Error(
        'Esquema desatualizado: execute a migração database/init/161_legal_pages_draft_publish.sql.',
      );
    }
    if (isMissingLegalPagesTable(e)) {
      throw new Error('Tabela legal_pages não existe. Execute as migrações.');
    }
    throw e;
  }
}

export async function getLegalPageAdmin(type: LegalPageType): Promise<LegalPageAdminRow> {
  try {
    const r = await pool.query<{
      content_draft: string | null;
      content_published: string | null;
      status: string | null;
      updated_at: Date | null;
      updated_by: string | null;
      published_at: Date | null;
      published_by: string | null;
    }>(
      `SELECT content_draft, content_published, status, updated_at, updated_by, published_at, published_by
       FROM legal_pages WHERE type = $1`,
      [type],
    );
    const row = r.rows[0];
    if (!row) {
      return {
        type,
        content_draft: '',
        content_published: '',
        status: 'draft',
        updated_at: null,
        updated_by: null,
        published_at: null,
        published_by: null,
        has_unpublished_changes: false,
      };
    }
    const draft = sanitizeLegalPageHtml(row.content_draft ?? '');
    const published = sanitizeLegalPageHtml(row.content_published ?? '');
    const status: LegalPublicationStatus =
      row.status === 'published' ? 'published' : 'draft';
    return {
      type,
      content_draft: draft,
      content_published: published,
      status,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      updated_by: row.updated_by,
      published_at: row.published_at ? row.published_at.toISOString() : null,
      published_by: row.published_by,
      has_unpublished_changes: computeHasUnpublishedChanges(draft, published),
    };
  } catch (e: unknown) {
    if (isMissingDraftColumns(e)) {
      throw new Error(
        'Esquema desatualizado: execute a migração database/init/161_legal_pages_draft_publish.sql.',
      );
    }
    if (isMissingLegalPagesTable(e)) {
      throw new Error('Tabela legal_pages não existe. Execute as migrações.');
    }
    throw e;
  }
}

export async function saveLegalPageDraft(
  type: LegalPageType,
  rawHtml: string,
  editorUserId: string | undefined,
): Promise<LegalPageAdminRow> {
  const draft = sanitizeLegalPageHtml(rawHtml);
  if (draft.length > MAX_HTML_CHARS) {
    throw new Error(`Conteúdo excede o limite de ${MAX_HTML_CHARS} caracteres.`);
  }
  try {
    await pool.query(
      `INSERT INTO legal_pages (type, content_draft, content_published, status, updated_by, created_at, updated_at)
       VALUES ($1, $2, '', 'draft', $3, now(), now())
       ON CONFLICT (type) DO UPDATE SET
         content_draft = EXCLUDED.content_draft,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()`,
      [type, draft, editorUserId ?? null],
    );
    return await getLegalPageAdmin(type);
  } catch (e: unknown) {
    if (isMissingDraftColumns(e)) {
      throw new Error(
        'Esquema desatualizado: execute a migração database/init/161_legal_pages_draft_publish.sql.',
      );
    }
    if (isMissingLegalPagesTable(e)) {
      throw new Error('Tabela legal_pages não existe. Execute as migrações.');
    }
    throw e;
  }
}

/**
 * Publica o documento legal.
 * @param rawHtml opcional — se enviado, é o texto atual do editor (permite publicar sem clicar antes em "Salvar rascunho").
 *                            Se omitido, usa o rascunho já guardado na BD.
 */
export async function publishLegalPage(
  type: LegalPageType,
  editorUserId: string | undefined,
  rawHtml?: string | null,
): Promise<LegalPageAdminRow> {
  let toPublish: string;
  if (rawHtml !== undefined && rawHtml !== null) {
    toPublish = sanitizeLegalPageHtml(rawHtml);
  } else {
    const admin = await getLegalPageAdmin(type);
    toPublish = sanitizeLegalPageHtml(admin.content_draft);
  }
  const minCheck = assertLegalHtmlMeetsPublishMinimum(toPublish);
  if (!minCheck.ok) {
    throw new Error(minCheck.error);
  }
  try {
    await pool.query(
      `INSERT INTO legal_pages (
         type, content_draft, content_published, status,
         updated_by, published_by, published_at, created_at, updated_at
       )
       VALUES ($1, $2, $2, 'published', $3, $3, now(), now(), now())
       ON CONFLICT (type) DO UPDATE SET
         content_draft = EXCLUDED.content_draft,
         content_published = EXCLUDED.content_published,
         status = 'published',
         updated_by = EXCLUDED.updated_by,
         published_by = EXCLUDED.published_by,
         published_at = now(),
         updated_at = now()`,
      [type, toPublish, editorUserId ?? null],
    );
    return await getLegalPageAdmin(type);
  } catch (e: unknown) {
    if (isMissingDraftColumns(e)) {
      throw new Error(
        'Esquema desatualizado: execute a migração database/init/161_legal_pages_draft_publish.sql.',
      );
    }
    throw e;
  }
}
