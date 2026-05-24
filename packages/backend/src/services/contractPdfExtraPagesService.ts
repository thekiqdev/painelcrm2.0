import { pool } from '../utils/db.js';

export type ContractPdfExtraPageRow = {
  id: string;
  contract_id: string;
  page_order: number;
  editor_json: Record<string, unknown>;
  html_snapshot: string;
};

export async function listExtraPages(contractId: string): Promise<ContractPdfExtraPageRow[]> {
  const r = await pool.query<ContractPdfExtraPageRow>(
    `SELECT id, contract_id, page_order, editor_json, html_snapshot
     FROM contract_pdf_extra_pages
     WHERE contract_id = $1
     ORDER BY page_order`,
    [contractId],
  );
  return r.rows.map((row) => ({
    ...row,
    editor_json:
      typeof row.editor_json === 'object' && row.editor_json !== null
        ? (row.editor_json as Record<string, unknown>)
        : {},
  }));
}

export async function replaceExtraPages(
  contractId: string,
  pages: Array<{ page_order: number; editor_json?: Record<string, unknown>; html_snapshot: string }>,
): Promise<ContractPdfExtraPageRow[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM contract_pdf_extra_pages WHERE contract_id = $1`, [contractId]);
    for (const p of pages) {
      await client.query(
        `INSERT INTO contract_pdf_extra_pages (contract_id, page_order, editor_json, html_snapshot)
         VALUES ($1, $2, $3::jsonb, $4)`,
        [contractId, p.page_order, JSON.stringify(p.editor_json ?? {}), p.html_snapshot ?? ''],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return listExtraPages(contractId);
}

export async function appendExtraPage(
  contractId: string,
  htmlSnapshot = '<p></p>',
): Promise<{ page: ContractPdfExtraPageRow; source_pdf_page_count: number; pdf_page_count: number }> {
  const cr = await pool.query<{ source_pdf_page_count: number | null; pdf_page_count: number | null }>(
    `SELECT source_pdf_page_count, pdf_page_count FROM contracts WHERE id = $1`,
    [contractId],
  );
  const row = cr.rows[0];
  const source = Math.max(1, row?.source_pdf_page_count ?? row?.pdf_page_count ?? 1);

  const maxR = await pool.query<{ m: number | null }>(
    `SELECT MAX(page_order)::int AS m FROM contract_pdf_extra_pages WHERE contract_id = $1`,
    [contractId],
  );
  const nextOrder = (maxR.rows[0]?.m ?? 0) + 1;

  const ins = await pool.query<ContractPdfExtraPageRow>(
    `INSERT INTO contract_pdf_extra_pages (contract_id, page_order, editor_json, html_snapshot)
     VALUES ($1, $2, '{}'::jsonb, $3)
     RETURNING id, contract_id, page_order, editor_json, html_snapshot`,
    [contractId, nextOrder, htmlSnapshot],
  );
  const page = ins.rows[0];
  const virtualTotal = source + nextOrder;

  await pool.query(
    `UPDATE contracts SET
       source_pdf_page_count = COALESCE(source_pdf_page_count, $2),
       pdf_page_count = $3,
       updated_at = now()
     WHERE id = $1`,
    [contractId, source, virtualTotal],
  );

  return {
    page: {
      ...page,
      editor_json: {},
    },
    source_pdf_page_count: source,
    pdf_page_count: virtualTotal,
  };
}

export async function updateExtraPage(
  contractId: string,
  pageId: string,
  patch: { html_snapshot?: string; editor_json?: Record<string, unknown> },
): Promise<ContractPdfExtraPageRow | null> {
  const r = await pool.query<ContractPdfExtraPageRow>(
    `UPDATE contract_pdf_extra_pages SET
       html_snapshot = COALESCE($3, html_snapshot),
       editor_json = COALESCE($4::jsonb, editor_json),
       updated_at = now()
     WHERE contract_id = $1 AND id = $2
     RETURNING id, contract_id, page_order, editor_json, html_snapshot`,
    [
      contractId,
      pageId,
      patch.html_snapshot ?? null,
      patch.editor_json != null ? JSON.stringify(patch.editor_json) : null,
    ],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...row,
    editor_json:
      typeof row.editor_json === 'object' && row.editor_json !== null
        ? (row.editor_json as Record<string, unknown>)
        : {},
  };
}

export async function deleteExtraPage(contractId: string, pageId: string): Promise<number> {
  const del = await pool.query(
    `DELETE FROM contract_pdf_extra_pages WHERE contract_id = $1 AND id = $2`,
    [contractId, pageId],
  );
  const pages = await listExtraPages(contractId);
  const cr = await pool.query<{ source_pdf_page_count: number | null }>(
    `SELECT source_pdf_page_count FROM contracts WHERE id = $1`,
    [contractId],
  );
  const source = Math.max(1, cr.rows[0]?.source_pdf_page_count ?? 1);
  const virtualTotal = source + pages.length;
  await pool.query(`UPDATE contracts SET pdf_page_count = $2, updated_at = now() WHERE id = $1`, [
    contractId,
    virtualTotal,
  ]);
  return del.rowCount ?? 0;
}

/** Número da página virtual (1-based) para uma página extra. */
export function virtualPageForExtra(sourcePageCount: number, pageOrder: number): number {
  return sourcePageCount + pageOrder;
}

export async function getSourcePageCount(contractId: string): Promise<number> {
  const r = await pool.query<{ source_pdf_page_count: number | null; pdf_page_count: number | null }>(
    `SELECT source_pdf_page_count, pdf_page_count FROM contracts WHERE id = $1`,
    [contractId],
  );
  const row = r.rows[0];
  return Math.max(1, row?.source_pdf_page_count ?? row?.pdf_page_count ?? 1);
}
