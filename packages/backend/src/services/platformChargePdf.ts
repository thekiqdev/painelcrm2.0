/**
 * PDF de cobrança da plataforma (IX9). Rótulos no idioma do tenant; valor na moeda da assinatura.
 */
import PDFDocument from 'pdfkit';
import type { AppLocale } from '../i18n/appLocale.js';

type PdfDoc = InstanceType<typeof PDFDocument>;

const LABELS: Record<AppLocale, { title: string; invoice: string; amount: string; due: string; plan: string; account: string }> = {
  'pt-BR': {
    title: 'Cobrança',
    invoice: 'Fatura',
    amount: 'Valor',
    due: 'Vencimento',
    plan: 'Plano',
    account: 'Conta',
  },
  en: {
    title: 'Charge',
    invoice: 'Invoice',
    amount: 'Amount',
    due: 'Due date',
    plan: 'Plan',
    account: 'Account',
  },
  es: {
    title: 'Cobro',
    invoice: 'Factura',
    amount: 'Importe',
    due: 'Vencimiento',
    plan: 'Plan',
    account: 'Cuenta',
  },
};

export async function buildPlatformChargePdfBuffer(input: {
  locale: AppLocale;
  currency: 'BRL' | 'USD' | 'EUR';
  amountCents: number;
  invoiceNumber: string;
  dueDate: string;
  planLabel: string;
  accountName: string;
  platformName: string;
}): Promise<Buffer> {
  const labels = LABELS[input.locale];
  const intl = input.locale === 'en' ? 'en-US' : input.locale === 'es' ? 'es-ES' : 'pt-BR';
  const amount = (input.amountCents / 100).toLocaleString(intl, {
    style: 'currency',
    currency: input.currency,
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc: PdfDoc = new PDFDocument({ size: 'A4', margin: 52 });
    doc.on('data', (d: Buffer) => chunks.push(d));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.font('Helvetica-Bold').fontSize(18).text(input.platformName, { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(14).text(labels.title, { align: 'center' });
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(12);
    doc.text(`${labels.invoice}: ${input.invoiceNumber || '—'}`);
    doc.moveDown(0.4);
    doc.text(`${labels.amount}: ${amount}`);
    doc.moveDown(0.4);
    doc.text(`${labels.due}: ${input.dueDate || '—'}`);
    doc.moveDown(0.4);
    doc.text(`${labels.plan}: ${input.planLabel || '—'}`);
    doc.moveDown(0.4);
    doc.text(`${labels.account}: ${input.accountName || '—'}`);
    doc.end();
  });
}
