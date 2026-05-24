import crypto from 'crypto';
import { saveBuffer, readBuffer, exists } from './media/mediaLocalStorageAdapter.js';

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;

export function getContractPdfMaxBytes(): number {
  const n = parseInt(process.env.CONTRACT_PDF_UPLOAD_MAX_BYTES || '', 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function contractOriginalPdfKey(tenantId: string, contractId: string): string {
  return `contracts-pdf/${tenantId}/${contractId}/original.pdf`;
}

export function contractFrozenPdfKey(tenantId: string, contractId: string): string {
  return `contracts-pdf/${tenantId}/${contractId}/frozen.pdf`;
}

export function contractSignedPdfKey(tenantId: string, contractId: string): string {
  return `contracts-pdf/${tenantId}/${contractId}/signed.pdf`;
}

export async function saveContractOriginalPdf(
  tenantId: string,
  contractId: string,
  buffer: Buffer,
): Promise<{ storageKey: string; sha256: string; pageCount: number | null }> {
  if (buffer.length > getContractPdfMaxBytes()) {
    throw new Error('CONTRACT_PDF_TOO_LARGE');
  }
  if (buffer.length < 100 || buffer.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('CONTRACT_PDF_INVALID');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const storageKey = contractOriginalPdfKey(tenantId, contractId);
  await saveBuffer(storageKey, buffer);
  return { storageKey, sha256, pageCount: null };
}

export async function copyPdfToFrozen(
  tenantId: string,
  contractId: string,
  sourceKey: string,
): Promise<string> {
  const buf = await readBuffer(sourceKey);
  const frozenKey = contractFrozenPdfKey(tenantId, contractId);
  await saveBuffer(frozenKey, buf);
  return frozenKey;
}

export async function readContractPdfByKey(storageKey: string): Promise<Buffer> {
  return readBuffer(storageKey);
}

export async function contractPdfKeyExists(storageKey: string): Promise<boolean> {
  return exists(storageKey);
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
