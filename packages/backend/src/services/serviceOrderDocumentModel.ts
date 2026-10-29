/**
 * OS-S3 — modelo de documento A4 (dados resolvidos para HTML/PDF).
 */
import { pool } from '../utils/db.js';
import {
  getServiceOrderById,
  normalizeServiceOrderEquipmentList,
  type ServiceOrderEquipmentItem,
  type ServiceOrderItemRow,
} from './serviceOrdersService.js';

export type ServiceOrderDocLine = {
  index: number;
  name: string;
  unit: string;
  quantity: number;
  unit_price_cents: number;
  subtotal_cents: number;
};

export type ServiceOrderDocumentModel = {
  tenant: {
    name: string;
    document: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    city_uf: string | null;
    postal_code: string | null;
    responsible_name: string | null;
    logo_url: string | null;
  };
  service_order: {
    id: string;
    number: number;
    number_label: string;
    status: string;
    issued_at_formatted: string;
    period_start_formatted: string;
    period_end_formatted: string;
    observations: string | null;
    currency: string;
    total_services_cents: number;
    total_products_cents: number;
    total_cents: number;
    document_frozen_at: string | null;
  };
  client: {
    name: string;
    trade_name: string | null;
    document: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city_uf: string | null;
    postal_code: string | null;
  };
  equipment: ServiceOrderEquipmentItem[];
  services: ServiceOrderDocLine[];
  products: ServiceOrderDocLine[];
};

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function formatCentsBr(cents: number): string {
  return (Math.max(0, cents) / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMoneyLabel(cents: number, currency = 'BRL'): string {
  if (currency === 'BRL') return `R$ ${formatCentsBr(cents)}`;
  return `${currency} ${formatCentsBr(cents)}`;
}

function formatDatePt(iso: string | null | undefined): string {
  if (!iso) return '____/____/________';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '____/____/________';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatDateTimePt(iso: string | null | undefined): string {
  if (!iso) return '____/____/________ - ____:____';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '____/____/________ - ____:____';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatQty(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mapLines(items: ServiceOrderItemRow[], kind: 'service' | 'product'): ServiceOrderDocLine[] {
  return items
    .filter((i) => i.kind === kind)
    .map((it, idx) => ({
      index: idx + 1,
      name: it.name,
      unit: it.unit || 'UN',
      quantity: Number(it.quantity) || 0,
      unit_price_cents: Number(it.unit_price_cents) || 0,
      subtotal_cents: Number(it.subtotal_cents) || 0,
    }));
}

export async function loadServiceOrderDocumentModel(
  tenantId: string,
  serviceOrderId: string,
): Promise<ServiceOrderDocumentModel | null> {
  const order = await getServiceOrderById(tenantId, serviceOrderId);
  if (!order) return null;

  const tenantRes = await pool.query<{
    name: string;
    cpf_cnpj: string | null;
    company_whatsapp: string | null;
    company_address_line: string | null;
    company_city: string | null;
    company_state: string | null;
    company_postal_code: string | null;
    logo_light_url: string | null;
    logo_url: string | null;
  }>(
    `SELECT name, cpf_cnpj, company_whatsapp, company_address_line, company_city, company_state,
            company_postal_code, logo_light_url, logo_url
     FROM public.tenants WHERE id = $1 LIMIT 1`,
    [tenantId],
  );
  const t = tenantRes.rows[0];

  const creatorRes = await pool.query<{
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  }>(
    `SELECT p.first_name, p.last_name, u.email
     FROM public.users u
     LEFT JOIN public.profiles p ON p.id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [order.created_by],
  );
  const creator = creatorRes.rows[0];
  const responsibleName = [creator?.first_name, creator?.last_name].filter(Boolean).join(' ').trim()
    || creator?.email
    || null;

  const snap = asRecord(order.client_snapshot);
  const addr = asRecord(order.execution_address);
  const equipmentList = normalizeServiceOrderEquipmentList(order.equipment) ?? [];

  const cityUf = [str(t?.company_city), str(t?.company_state)].filter(Boolean).join('/') || null;

  const services = mapLines(order.items, 'service');
  const products = mapLines(order.items, 'product');

  return {
    tenant: {
      name: t?.name || 'Empresa',
      document: str(t?.cpf_cnpj),
      phone: str(t?.company_whatsapp),
      email: str(creator?.email),
      address: str(t?.company_address_line),
      city_uf: cityUf,
      postal_code: str(t?.company_postal_code),
      responsible_name: responsibleName,
      logo_url: str(t?.logo_light_url) || str(t?.logo_url),
    },
    service_order: {
      id: order.id,
      number: order.service_order_number,
      number_label: `ORDEM DE SERVIÇO Nº ${order.service_order_number}`,
      status: order.status,
      issued_at_formatted: formatDatePt(order.document_frozen_at || order.created_at),
      period_start_formatted: formatDateTimePt(order.period_start_at),
      period_end_formatted: formatDateTimePt(order.period_end_at),
      observations: order.observations,
      currency: order.currency || 'BRL',
      total_services_cents: Number(order.total_services_cents) || 0,
      total_products_cents: Number(order.total_products_cents) || 0,
      total_cents: Number(order.total_cents) || 0,
      document_frozen_at: order.document_frozen_at,
    },
    client: {
      name: str(snap.name) || order.client_name || 'Cliente',
      trade_name: str(snap.trade_name) || str(snap.company),
      document: str(snap.document) || str(snap.cpf_cnpj),
      email: str(snap.email),
      phone: str(snap.phone) || str(snap.whatsapp),
      address: str(addr.line) || str(snap.address),
      city_uf: str(addr.city_uf) || str(snap.city_uf),
      postal_code: str(addr.postal_code) || str(snap.postal_code),
    },
    equipment: equipmentList,
    services,
    products,
  };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function qtyLabel(n: number): string {
  return formatQty(n);
}

function moneyCell(cents: number): string {
  return formatCentsBr(cents);
}

export type ServiceOrderHtmlSignerOpt = {
  role: string;
  name: string;
  signed_at?: string | null;
  signature_data?: Record<string, unknown> | null;
};

/**
 * Snapshots antigos gravavam logo + `<p class="os-brand">`.
 * Com logo presente, remove o nome textual da empresa.
 */
export function stripServiceOrderBrandNameWhenLogoPresent(html: string): string {
  const raw = String(html || '');
  if (!raw) return raw;
  if (!/\bos-logo\b/i.test(raw)) return raw;
  return raw.replace(/<p\b[^>]*\bos-brand\b[^>]*>[\s\S]*?<\/p>/gi, '');
}

/**
 * HTML interno do documento (corpo da folha A4) — preview SPA + snapshot.
 */
export function buildServiceOrderDocumentHtml(
  model: ServiceOrderDocumentModel,
  opts?: { signers?: ServiceOrderHtmlSignerOpt[] },
): string {
  const e = escapeHtml;
  const tenantAddr = [model.tenant.address, model.tenant.city_uf, model.tenant.postal_code ? `CEP: ${model.tenant.postal_code}` : null]
    .filter(Boolean)
    .join(' · ');

  const servicesRows = model.services
    .map(
      (r) => `<tr>
        <td style="text-align:center">${r.index}</td>
        <td>${e(r.name)}</td>
        <td style="text-align:right">${qtyLabel(r.quantity)}</td>
        <td style="text-align:right">${moneyCell(r.unit_price_cents)}</td>
        <td style="text-align:right">${moneyCell(r.subtotal_cents)}</td>
      </tr>`,
    )
    .join('');

  const productsRows = model.products
    .map(
      (r) => `<tr>
        <td style="text-align:center">${r.index}</td>
        <td>${e(r.name)}</td>
        <td style="text-align:center">${e(r.unit)}</td>
        <td style="text-align:right">${qtyLabel(r.quantity)}</td>
        <td style="text-align:right">${moneyCell(r.unit_price_cents)}</td>
        <td style="text-align:right">${moneyCell(r.subtotal_cents)}</td>
      </tr>`,
    )
    .join('');

  const servicesQty = model.services.reduce((a, r) => a + r.quantity, 0);
  const productsQty = model.products.reduce((a, r) => a + r.quantity, 0);

  const equipmentBlock = model.equipment.length
    ? `<section class="os-section">
        <h2 class="os-section-title">${model.equipment.length > 1 ? 'Equipamentos' : 'Equipamento'}</h2>
        ${model.equipment
          .map((eq, idx) => {
            const title =
              model.equipment.length > 1
                ? `<div class="os-lbl" style="margin:8px 0 4px">Equipamento ${idx + 1}</div>`
                : '';
            return `${title}
        <div class="os-grid">
          <div><span class="os-lbl">Nome / marca:</span> ${e([eq.name, eq.brand].filter(Boolean).join(' ') || '—')}</div>
          <div><span class="os-lbl">Modelo / série:</span> ${e([eq.model, eq.serial].filter(Boolean).join(' / ') || '—')}</div>
        </div>
        ${
          eq.defects
            ? `<div style="margin-top:6px"><span class="os-lbl">Defeitos:</span><div>${e(eq.defects)}</div></div>`
            : ''
        }`;
          })
          .join('')}
      </section>`
    : '';

  const hasLogo = Boolean(model.tenant.logo_url);
  const logoHtml = hasLogo
    ? `<img class="os-logo" alt="Logo" src="${e(model.tenant.logo_url!)}" style="max-height:56px;max-width:180px;object-fit:contain" />`
    : '';
  const brandNameHtml = hasLogo ? '' : `<p class="os-brand">${e(model.tenant.name)}</p>`;

  const built = `
<article class="os-a4-doc">
  <header class="os-header">
    <div class="os-header-brand">
      ${logoHtml}
      ${brandNameHtml}
      <div class="os-meta">
        ${model.tenant.phone ? `<div>${e(model.tenant.phone)}</div>` : ''}
        ${model.tenant.email ? `<div>${e(model.tenant.email)}</div>` : ''}
        ${model.tenant.document ? `<div>CNPJ: ${e(model.tenant.document)}</div>` : ''}
        ${model.tenant.responsible_name ? `<div>Responsável: ${e(model.tenant.responsible_name)}</div>` : ''}
        ${tenantAddr ? `<div>${e(tenantAddr)}</div>` : ''}
      </div>
    </div>
  </header>

  <div class="os-title-row">
    <h1>${e(model.service_order.number_label)}</h1>
    <span>${e(model.service_order.issued_at_formatted)}</span>
  </div>

  <section class="os-section">
    <h2 class="os-section-title">Período de execução</h2>
    <div class="os-grid">
      <div><span class="os-lbl">Entrada:</span> ${e(model.service_order.period_start_formatted)}</div>
      <div><span class="os-lbl">Saída:</span> ${e(model.service_order.period_end_formatted)}</div>
    </div>
  </section>

  <section class="os-section">
    <h2 class="os-section-title">Dados do cliente</h2>
    <div class="os-grid">
      <div><span class="os-lbl">Razão social:</span> ${e(model.client.name)}</div>
      <div><span class="os-lbl">Nome fantasia:</span> ${e(model.client.trade_name || '—')}</div>
      <div><span class="os-lbl">CNPJ/CPF:</span> ${e(model.client.document || '—')}</div>
      <div><span class="os-lbl">Endereço:</span> ${e(model.client.address || '—')}</div>
      <div><span class="os-lbl">CEP:</span> ${e(model.client.postal_code || '—')}</div>
      <div><span class="os-lbl">Cidade/UF:</span> ${e(model.client.city_uf || '—')}</div>
      <div><span class="os-lbl">Telefone:</span> ${e(model.client.phone || '—')}</div>
      <div><span class="os-lbl">E-mail:</span> ${e(model.client.email || '—')}</div>
    </div>
  </section>

  ${equipmentBlock}

  <section class="os-section">
    <h2 class="os-section-title">Serviços</h2>
    <table class="os-table">
      <thead><tr><th>Item</th><th>Nome</th><th>Qtd.</th><th>Vr. unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${servicesRows || '<tr><td colspan="5">—</td></tr>'}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td style="text-align:right">${qtyLabel(servicesQty)}</td><td></td><td style="text-align:right">${moneyCell(model.service_order.total_services_cents)}</td></tr></tfoot>
    </table>
  </section>

  <section class="os-section">
    <h2 class="os-section-title">Produtos</h2>
    <table class="os-table">
      <thead><tr><th>Item</th><th>Nome</th><th>Und.</th><th>Qtd.</th><th>Vr. unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${productsRows || '<tr><td colspan="6">—</td></tr>'}</tbody>
      <tfoot><tr><td colspan="3">TOTAL</td><td style="text-align:right">${qtyLabel(productsQty)}</td><td></td><td style="text-align:right">${moneyCell(model.service_order.total_products_cents)}</td></tr></tfoot>
    </table>
  </section>

  <div class="os-totals">
    <div>PRODUTOS: ${moneyCell(model.service_order.total_products_cents)}</div>
    <div>SERVIÇOS: ${moneyCell(model.service_order.total_services_cents)}</div>
    <div class="os-grand">TOTAL: ${e(formatMoneyLabel(model.service_order.total_cents, model.service_order.currency))}</div>
  </div>

  <section class="os-section">
    <h2 class="os-section-title">Observações</h2>
    <div class="os-obs">${e(model.service_order.observations || '')}</div>
  </section>

  ${(() => {
    const clientSig = opts?.signers?.find((s) => s.role === 'client');
    const techSig = opts?.signers?.find((s) => s.role === 'technician');
    const png = (s?: ServiceOrderHtmlSignerOpt) => {
      const b64 = s?.signature_data?.signature_image_png_base64;
      if (typeof b64 !== 'string' || !b64.trim()) return null;
      return b64;
    };
    const clientPng = png(clientSig);
    const techPng = png(techSig);
    const clientBlock = clientPng
      ? `<img alt="Assinatura do cliente" src="data:image/png;base64,${clientPng}" style="max-height:48px;max-width:100%" /><div>${e(clientSig?.name || 'Cliente')}</div>`
      : `<div class="os-sig-line"></div><div>Assinatura do cliente</div>`;
    const techBlock = techPng
      ? `<img alt="Assinatura do técnico" src="data:image/png;base64,${techPng}" style="max-height:48px;max-width:100%" /><div>${e(techSig?.name || 'Técnico')}</div>`
      : `<div class="os-sig-line"></div><div>Assinatura do técnico</div>`;
    return `<div class="os-signs">
    <div class="os-sig">${clientBlock}</div>
    <div class="os-sig">${techBlock}</div>
  </div>`;
  })()}
</article>`.trim();

  return stripServiceOrderBrandNameWhenLogoPresent(built);
}

export { formatCentsBr, formatQty };
