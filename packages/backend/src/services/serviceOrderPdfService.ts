/**
 * OS-S3 / OS-S9 — PDF A4 da ordem de serviço (PDFKit + imagens de assinatura).
 */
import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { pool } from '../utils/db.js';
import {
  buildServiceOrderDocumentHtml,
  formatCentsBr,
  formatMoneyLabel,
  loadServiceOrderDocumentModel,
  type ServiceOrderDocumentModel,
  type ServiceOrderDocLine,
  type ServiceOrderHtmlSignerOpt,
} from './serviceOrderDocumentModel.js';
import { listServiceOrderSigners } from './serviceOrderSignatureService.js';
import { getCatalogMediaStorageRoot } from './catalogMediaUploadService.js';
import {
  extractCatalogMediaRelativeKeyFromStoredUrl,
  refreshCatalogMediaRelativeSignedUrl,
} from '../utils/catalogMediaPublicSignedUrl.js';

type PdfDoc = InstanceType<typeof PDFDocument>;

export type ServiceOrderPdfSignerOpt = ServiceOrderHtmlSignerOpt;

export type ResolvedTenantLogo = {
  /** URL relativa assinada (para <img> no preview / HTML). */
  htmlSrc: string | null;
  /** Bytes da imagem (para PDFKit). */
  buffer: Buffer | null;
};

function isFileInsideCatalogRoot(rootDir: string, absoluteFile: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(absoluteFile);
  const rel = path.relative(resolvedRoot, resolvedFile);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function sniffImageKind(buf: Buffer, fileHint?: string): 'png' | 'jpeg' | 'webp' | 'gif' | 'unknown' {
  const lower = String(fileHint || '').toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || (buf[0] === 0xff && buf[1] === 0xd8)) return 'jpeg';
  if (
    lower.endsWith('.webp') ||
    (buf[0] === 0x52 && buf[1] === 0x49 && buf.toString('ascii', 8, 12) === 'WEBP')
  ) {
    return 'webp';
  }
  if (lower.endsWith('.gif') || (buf[0] === 0x47 && buf[1] === 0x49)) return 'gif';
  if (lower.endsWith('.png') || (buf[0] === 0x89 && buf[1] === 0x50)) return 'png';
  return 'unknown';
}

function bufferToImageDataUrl(buf: Buffer, fileHint?: string): string {
  const kind = sniffImageKind(buf, fileHint);
  const mime =
    kind === 'jpeg'
      ? 'image/jpeg'
      : kind === 'webp'
        ? 'image/webp'
        : kind === 'gif'
          ? 'image/gif'
          : 'image/png';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** PDFKit só aceita PNG/JPEG — WebP/GIF são convertidos via sharp. */
async function toPdfKitCompatibleImage(buf: Buffer, fileHint?: string): Promise<Buffer | null> {
  const kind = sniffImageKind(buf, fileHint);
  if (kind === 'png' || kind === 'jpeg') return buf;
  if (kind !== 'webp' && kind !== 'gif' && kind !== 'unknown') return null;
  try {
    const sharp = (await import('sharp')).default;
    return await sharp(buf).png().toBuffer();
  } catch (err) {
    console.warn('[service-order-pdf] falha ao converter logo para PNG', err);
    return null;
  }
}

/**
 * Resolve logo gravada como `/api/public/catalog-media/raw?k=&s=` (disco) ou URL absoluta.
 * `htmlSrc` preferencialmente em data URL para o preview A4 (não depende de assinatura HTTP).
 */
export async function resolveTenantLogoAssets(
  logoUrl: string | null | undefined,
): Promise<ResolvedTenantLogo> {
  const raw = String(logoUrl || '').trim();
  if (!raw) return { htmlSrc: null, buffer: null };

  const refreshed = refreshCatalogMediaRelativeSignedUrl(raw) || raw;
  const key = extractCatalogMediaRelativeKeyFromStoredUrl(raw);

  if (key) {
    try {
      const root = getCatalogMediaStorageRoot();
      const abs = path.join(root, key);
      const resolvedFile = path.resolve(abs);
      if (isFileInsideCatalogRoot(root, resolvedFile) && fs.existsSync(resolvedFile) && fs.statSync(resolvedFile).isFile()) {
        const buf = fs.readFileSync(resolvedFile);
        if (buf.length > 32 && buf.length < 5_000_000) {
          const pdfBuf = await toPdfKitCompatibleImage(buf, resolvedFile);
          return { htmlSrc: bufferToImageDataUrl(buf, resolvedFile), buffer: pdfBuf };
        }
      }
    } catch {
      /* fall through */
    }
  }

  const dataMatch = /^data:image\/[a-zA-Z+]+;base64,(.+)$/i.exec(raw);
  if (dataMatch?.[1]) {
    try {
      const buf = Buffer.from(dataMatch[1], 'base64');
      if (buf.length > 32) {
        const pdfBuf = await toPdfKitCompatibleImage(buf);
        return { htmlSrc: raw, buffer: pdfBuf };
      }
    } catch {
      /* ignore */
    }
  }

  if (/^https?:\/\//i.test(raw)) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(raw, { signal: ctrl.signal });
        if (!res.ok) return { htmlSrc: refreshed, buffer: null };
        const ab = await res.arrayBuffer();
        const buf = Buffer.from(ab);
        if (buf.length > 32 && buf.length < 5_000_000) {
          const ct = String(res.headers.get('content-type') || '');
          const hint = ct.includes('jpeg') || ct.includes('jpg')
            ? '.jpg'
            : ct.includes('webp')
              ? '.webp'
              : ct.includes('gif')
                ? '.gif'
                : '.png';
          const pdfBuf = await toPdfKitCompatibleImage(buf, hint);
          return { htmlSrc: bufferToImageDataUrl(buf, hint), buffer: pdfBuf };
        }
      } finally {
        clearTimeout(t);
      }
    } catch {
      return { htmlSrc: refreshed, buffer: null };
    }
  }

  return { htmlSrc: refreshed, buffer: null };
}

/** @deprecated use resolveTenantLogoAssets */
export async function fetchTenantLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  const r = await resolveTenantLogoAssets(logoUrl);
  return r.buffer;
}

/** Extrai buffer PNG de signature_data (base64 puro ou data URL). */
export function pngBufferFromSignatureData(
  signatureData: Record<string, unknown> | null | undefined,
): Buffer | null {
  const raw = signatureData?.signature_image_png_base64;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let b64 = raw.trim();
  const dataUrl = /^data:image\/png;base64,/i.exec(b64);
  if (dataUrl) b64 = b64.slice(dataUrl[0].length);
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8) return null;
    // PNG magic
    if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) return null;
    return buf;
  } catch {
    return null;
  }
}

function safeFilenamePart(s: string): string {
  return String(s || 'os')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .slice(0, 80);
}

function drawSectionTitle(doc: PdfDoc, title: string, x: number, width: number): void {
  doc.moveDown(0.55);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(title.toUpperCase(), x, doc.y, {
    width,
    characterSpacing: 0.6,
  });
  const y = doc.y + 2;
  doc
    .moveTo(x, y)
    .lineTo(x + width, y)
    .strokeColor('#999999')
    .lineWidth(0.6)
    .stroke();
  doc.moveDown(0.35);
  doc.fillColor('#000000');
}

function drawFieldRow(
  doc: PdfDoc,
  pairs: Array<{ label: string; value: string }>,
  x: number,
  width: number,
): void {
  const colW = width / 2;
  let y = doc.y;
  for (let i = 0; i < pairs.length; i += 2) {
    const left = pairs[i]!;
    const right = pairs[i + 1];
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text(`${left.label}: `, x, y, {
      continued: true,
      width: colW,
    });
    doc.font('Helvetica').fillColor('#111111').text(left.value || '—', { width: colW - 4 });
    if (right) {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text(`${right.label}: `, x + colW, y, {
        continued: true,
        width: colW,
      });
      doc.font('Helvetica').fillColor('#111111').text(right.value || '—', { width: colW - 4 });
    }
    y = Math.max(doc.y, y) + 2;
    doc.y = y;
  }
  doc.fillColor('#000000');
}

function drawTable(
  doc: PdfDoc,
  headers: string[],
  rows: string[][],
  footer: string[] | null,
  x: number,
  width: number,
  colWeights: number[],
): void {
  const sumW = colWeights.reduce((a, b) => a + b, 0);
  const cols = colWeights.map((w) => (w / sumW) * width);
  const rowH = 16;
  const startY = doc.y;

  const drawRow = (cells: string[], bold: boolean, fill: string | null, y: number) => {
    if (fill) {
      doc.rect(x, y, width, rowH).fill(fill);
    }
    doc.strokeColor('#555555').lineWidth(0.4);
    doc.rect(x, y, width, rowH).stroke();
    let cx = x;
    for (let i = 0; i < cells.length; i++) {
      if (i > 0) {
        doc
          .moveTo(cx, y)
          .lineTo(cx, y + rowH)
          .stroke();
      }
      doc
        .font(bold ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(8)
        .fillColor('#111111')
        .text(cells[i] ?? '', cx + 3, y + 4, {
          width: cols[i]! - 6,
          height: rowH - 6,
          ellipsis: true,
        });
      cx += cols[i]!;
    }
  };

  let y = startY;
  if (y + rowH > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  drawRow(headers, true, '#f3f3f3', y);
  y += rowH;

  for (const row of rows) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(headers, true, '#f3f3f3', y);
      y += rowH;
    }
    drawRow(row, false, null, y);
    y += rowH;
  }

  if (footer) {
    if (y + rowH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    drawRow(footer, true, '#fafafa', y);
    y += rowH;
  }

  doc.y = y + 4;
  doc.fillColor('#000000');
}

function formatQty(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function linesToServiceRows(lines: ServiceOrderDocLine[]): string[][] {
  return lines.map((r) => [
    String(r.index),
    r.name,
    formatQty(r.quantity),
    formatCentsBr(r.unit_price_cents),
    formatCentsBr(r.subtotal_cents),
  ]);
}

function linesToProductRows(lines: ServiceOrderDocLine[]): string[][] {
  return lines.map((r) => [
    String(r.index),
    r.name,
    r.unit,
      formatQty(r.quantity),
      formatCentsBr(r.unit_price_cents),
      formatCentsBr(r.subtotal_cents),
    ]);
}

export function renderServiceOrderPdfBuffer(
  model: ServiceOrderDocumentModel,
  opts?: { signers?: ServiceOrderPdfSignerOpt[]; logoBuffer?: Buffer | null },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 36, bottom: 40, left: 40, right: 40 },
      info: {
        Title: model.service_order.number_label,
        Author: model.tenant.name,
        Subject: 'Ordem de Serviço',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c as Buffer));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const x = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const signers = opts?.signers ?? [];
    const logoBuf = opts?.logoBuffer ?? null;

    // Header (logo + dados da empresa). Com logo, não repetir o nome textual da empresa.
    const headerTop = doc.y;
    let textX = x;
    let textWidth = width;
    let logoDrawn = false;
    if (logoBuf) {
      try {
        const logoW = 110;
        const logoH = 48;
        doc.image(logoBuf, x, headerTop, { fit: [logoW, logoH] });
        textX = x + logoW + 12;
        textWidth = width - logoW - 12;
        doc.y = headerTop;
        logoDrawn = true;
      } catch {
        /* logo inválido — segue só com texto */
      }
    }
    if (!logoDrawn) {
      doc
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor('#111111')
        .text(model.tenant.name, textX, headerTop, { width: textWidth });
      doc.moveDown(0.2);
    }
    doc.font('Helvetica').fontSize(8).fillColor('#444444');
    if (model.tenant.phone) doc.text(model.tenant.phone, textX, doc.y, { width: textWidth });
    if (model.tenant.email) doc.text(model.tenant.email, textX, doc.y, { width: textWidth });
    if (model.tenant.document) doc.text(`CNPJ: ${model.tenant.document}`, textX, doc.y, { width: textWidth });
    if (model.tenant.responsible_name) {
      doc.text(`Responsável: ${model.tenant.responsible_name}`, textX, doc.y, { width: textWidth });
    }
    const tenantAddr = [model.tenant.address, model.tenant.city_uf, model.tenant.postal_code ? `CEP: ${model.tenant.postal_code}` : null]
      .filter(Boolean)
      .join(' · ');
    if (tenantAddr) doc.text(tenantAddr, textX, doc.y, { width: textWidth });

    if (logoDrawn) {
      doc.y = Math.max(doc.y, headerTop + 52);
    }
    doc.moveDown(0.4);
    const hy = doc.y;
    doc.moveTo(x, hy).lineTo(x + width, hy).strokeColor('#222222').lineWidth(1.2).stroke();
    doc.moveDown(0.5);

    // Title
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#111111').text(model.service_order.number_label, x, doc.y, {
      width: width * 0.7,
      continued: false,
    });
    const titleY = doc.y - 14;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(model.service_order.issued_at_formatted, x, titleY, { width, align: 'right' });
    doc.moveDown(0.35);
    doc.moveTo(x, doc.y).lineTo(x + width, doc.y).strokeColor('#222222').lineWidth(0.6).stroke();

    drawSectionTitle(doc, 'Período de execução', x, width);
    drawFieldRow(
      doc,
      [
        { label: 'Entrada', value: model.service_order.period_start_formatted },
        { label: 'Saída', value: model.service_order.period_end_formatted },
      ],
      x,
      width,
    );

    drawSectionTitle(doc, 'Dados do cliente', x, width);
    drawFieldRow(
      doc,
      [
        { label: 'Razão social', value: model.client.name },
        { label: 'Nome fantasia', value: model.client.trade_name || '—' },
        { label: 'CNPJ/CPF', value: model.client.document || '—' },
        { label: 'Endereço', value: model.client.address || '—' },
        { label: 'CEP', value: model.client.postal_code || '—' },
        { label: 'Cidade/UF', value: model.client.city_uf || '—' },
        { label: 'Telefone', value: model.client.phone || '—' },
        { label: 'E-mail', value: model.client.email || '—' },
      ],
      x,
      width,
    );

    if (model.equipment.length) {
      drawSectionTitle(
        doc,
        model.equipment.length > 1 ? 'Equipamentos' : 'Equipamento',
        x,
        width,
      );
      for (let i = 0; i < model.equipment.length; i++) {
        const eq = model.equipment[i]!;
        if (model.equipment.length > 1) {
          doc
            .font('Helvetica-Bold')
            .fontSize(9)
            .fillColor('#333333')
            .text(`Equipamento ${i + 1}`, x, doc.y, { width });
          doc.moveDown(0.2);
        }
        drawFieldRow(
          doc,
          [
            {
              label: 'Nome / marca',
              value: [eq.name, eq.brand].filter(Boolean).join(' ') || '—',
            },
            {
              label: 'Modelo / série',
              value: [eq.model, eq.serial].filter(Boolean).join(' / ') || '—',
            },
          ],
          x,
          width,
        );
        if (eq.defects) {
          doc.font('Helvetica-Bold').fontSize(8).fillColor('#555555').text('Defeitos: ', { continued: true });
          doc.font('Helvetica').fillColor('#111111').text(eq.defects, { width });
        }
        if (i < model.equipment.length - 1) doc.moveDown(0.35);
      }
    }

    drawSectionTitle(doc, 'Serviços', x, width);
    const svcQty = model.services.reduce((a, r) => a + r.quantity, 0);
    drawTable(
      doc,
      ['Item', 'Nome', 'Qtd.', 'Vr. unit.', 'Subtotal'],
      model.services.length
        ? linesToServiceRows(model.services)
        : [['—', '—', '—', '—', '—']],
      ['TOTAL', '', formatQty(svcQty), '', formatCentsBr(model.service_order.total_services_cents)],
      x,
      width,
      [1, 5, 2, 2.5, 2.5],
    );

    drawSectionTitle(doc, 'Produtos', x, width);
    const prodQty = model.products.reduce((a, r) => a + r.quantity, 0);
    drawTable(
      doc,
      ['Item', 'Nome', 'Und.', 'Qtd.', 'Vr. unit.', 'Subtotal'],
      model.products.length ? linesToProductRows(model.products) : [['—', '—', '—', '—', '—', '—']],
      ['TOTAL', '', '', formatQty(prodQty), '', formatCentsBr(model.service_order.total_products_cents)],
      x,
      width,
      [1, 4, 1.2, 1.8, 2.2, 2.2],
    );

    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9).fillColor('#111111');
    doc.text(`PRODUTOS: ${formatCentsBr(model.service_order.total_products_cents)}`, { align: 'right', width });
    doc.text(`SERVIÇOS: ${formatCentsBr(model.service_order.total_services_cents)}`, { align: 'right', width });
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text(`TOTAL: ${formatMoneyLabel(model.service_order.total_cents, model.service_order.currency)}`, {
      align: 'right',
      width,
    });

    drawSectionTitle(doc, 'Observações', x, width);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#111111')
      .text(model.service_order.observations || ' ', {
        width,
        height: 48,
      });

    doc.moveDown(1.2);
    const sigGap = 40;
    const sigW = (width - sigGap) / 2;
    const clientSig = signers.find((s) => s.role === 'client');
    const techSig = signers.find((s) => s.role === 'technician');
    const clientPng = pngBufferFromSignatureData(clientSig?.signature_data ?? null);
    const techPng = pngBufferFromSignatureData(techSig?.signature_data ?? null);

    const imgMaxH = 48;
    const needH = imgMaxH + 28;
    if (doc.y + needH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }

    const drawSigColumn = (optsCol: {
      left: number;
      png: Buffer | null;
      nameFallback: string;
      label: string;
      signerName?: string | null;
    }) => {
      const colLeft = optsCol.left;
      let cursorY = doc.y;
      if (optsCol.png) {
        try {
          doc.image(optsCol.png, colLeft + 8, cursorY, {
            fit: [sigW - 16, imgMaxH],
          });
          cursorY += imgMaxH + 4;
        } catch {
          cursorY += 8;
        }
      } else {
        cursorY += imgMaxH - 4;
        doc
          .moveTo(colLeft + 10, cursorY)
          .lineTo(colLeft + sigW - 10, cursorY)
          .strokeColor('#222')
          .lineWidth(0.8)
          .stroke();
        cursorY += 6;
      }
      const caption = optsCol.png
        ? optsCol.signerName?.trim() || optsCol.nameFallback
        : optsCol.label;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#555555')
        .text(caption, colLeft + 10, cursorY, { width: sigW - 20, align: 'center' });
      return doc.y;
    };

    const startY = doc.y + 8;
    doc.y = startY;
    const y1 = drawSigColumn({
      left: x,
      png: clientPng,
      nameFallback: 'Cliente',
      label: 'Assinatura do cliente',
      signerName: clientSig?.name,
    });
    doc.y = startY;
    const y2 = drawSigColumn({
      left: x + sigW + sigGap,
      png: techPng,
      nameFallback: 'Técnico',
      label: 'Assinatura do técnico',
      signerName: techSig?.name,
    });
    doc.y = Math.max(y1, y2) + 8;

    doc.end();
  });
}

/** Atualiza HTML live; opcionalmente congela snapshot na primeira emissão/PDF. */
export async function persistServiceOrderDocumentHtml(params: {
  tenantId: string;
  serviceOrderId: string;
  html: string;
  freeze: boolean;
}): Promise<void> {
  if (params.freeze) {
    // Enquanto status operacional, PDF atualiza o snapshot; após awaiting_signature+ (S4) preserva.
    await pool.query(
      `UPDATE public.service_orders
       SET content_html = $3,
           content_snapshot_html = CASE
             WHEN status IN ('draft', 'scheduled', 'in_progress') THEN $3
             ELSE COALESCE(content_snapshot_html, $3)
           END,
           document_frozen_at = CASE
             WHEN status IN ('draft', 'scheduled', 'in_progress') THEN now()
             ELSE COALESCE(document_frozen_at, now())
           END,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [params.serviceOrderId, params.tenantId, params.html],
    );
  } else {
    await pool.query(
      `UPDATE public.service_orders
       SET content_html = $3, updated_at = now()
       WHERE id = $1 AND tenant_id = $2`,
      [params.serviceOrderId, params.tenantId, params.html],
    );
  }
}

export async function buildServiceOrderPdfBuffer(params: {
  tenantId: string;
  serviceOrderId: string;
  /** Congela snapshot na primeira geração de PDF (padrão true). */
  freeze?: boolean;
}): Promise<{ buffer: Buffer; filename: string; model: ServiceOrderDocumentModel } | null> {
  const model = await loadServiceOrderDocumentModel(params.tenantId, params.serviceOrderId);
  if (!model) return null;

  const signerRows = await listServiceOrderSigners(params.tenantId, params.serviceOrderId);
  const signers: ServiceOrderPdfSignerOpt[] = signerRows.map((s) => ({
    role: s.role,
    name: s.name,
    signed_at: s.signed_at,
    signature_data: s.signature_data,
  }));

  const logo = await resolveTenantLogoAssets(model.tenant.logo_url);
  const modelWithLogo: ServiceOrderDocumentModel = {
    ...model,
    tenant: {
      ...model.tenant,
      logo_url: logo.htmlSrc,
    },
  };

  const html = buildServiceOrderDocumentHtml(modelWithLogo, { signers });
  await persistServiceOrderDocumentHtml({
    tenantId: params.tenantId,
    serviceOrderId: params.serviceOrderId,
    html,
    freeze: params.freeze !== false,
  });

  const buffer = await renderServiceOrderPdfBuffer(modelWithLogo, {
    signers,
    logoBuffer: logo.buffer,
  });
  const filename = `ordem-servico-${safeFilenamePart(String(model.service_order.number))}.pdf`;
  return { buffer, filename, model: modelWithLogo };
}

/** Modelo + HTML com logo embutida (data URL) para preview no painel. */
export async function buildServiceOrderDocumentForPreview(params: {
  tenantId: string;
  serviceOrderId: string;
}): Promise<{ html: string; model: ServiceOrderDocumentModel } | null> {
  const model = await loadServiceOrderDocumentModel(params.tenantId, params.serviceOrderId);
  if (!model) return null;
  const signerRows = await listServiceOrderSigners(params.tenantId, params.serviceOrderId);
  const signers: ServiceOrderHtmlSignerOpt[] = signerRows.map((s) => ({
    role: s.role,
    name: s.name,
    signed_at: s.signed_at,
    signature_data: s.signature_data,
  }));
  const logo = await resolveTenantLogoAssets(model.tenant.logo_url);
  const modelWithLogo: ServiceOrderDocumentModel = {
    ...model,
    tenant: { ...model.tenant, logo_url: logo.htmlSrc },
  };
  const html = buildServiceOrderDocumentHtml(modelWithLogo, { signers });
  return { html, model: modelWithLogo };
}
