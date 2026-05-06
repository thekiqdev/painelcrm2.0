import fs from 'fs/promises';
import path from 'path';
import { getMediaStorageRoot } from './mediaConfig.js';

function assertSafeStorageKey(storageKey: string): void {
  const k = String(storageKey || '').trim();
  if (!k) throw new Error('storageKey obrigatório.');
  if (k.includes('..') || k.startsWith('/') || path.isAbsolute(k)) {
    throw new Error('storageKey inválido.');
  }
}

export function resolveAbsolutePath(storageKey: string): string {
  assertSafeStorageKey(storageKey);
  const root = getMediaStorageRoot();
  const abs = path.resolve(root, storageKey);
  const rootAbs = path.resolve(root);
  if (!abs.startsWith(`${rootAbs}${path.sep}`) && abs !== rootAbs) {
    throw new Error('Path traversal bloqueado.');
  }
  return abs;
}

export async function saveBuffer(storageKey: string, buffer: Buffer): Promise<void> {
  const abs = resolveAbsolutePath(storageKey);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buffer);
}

export async function readBuffer(storageKey: string): Promise<Buffer> {
  const abs = resolveAbsolutePath(storageKey);
  return fs.readFile(abs);
}

export async function exists(storageKey: string): Promise<boolean> {
  const abs = resolveAbsolutePath(storageKey);
  try {
    await fs.access(abs);
    return true;
  } catch {
    return false;
  }
}

export async function deleteFile(storageKey: string): Promise<void> {
  const abs = resolveAbsolutePath(storageKey);
  try {
    await fs.unlink(abs);
  } catch (e: unknown) {
    const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as NodeJS.ErrnoException).code) : '';
    if (code !== 'ENOENT') throw e;
  }
}
