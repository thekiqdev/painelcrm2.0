/** Limite de ficheiro no composer (~10 MB). Upload vai à Media Library (multipart), não em JSON base64. */
export const CHAT_OUTGOING_FILE_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const DOC_EXT = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'zip',
  'rar',
  'ppt',
  'pptx',
  'odt',
  'ods',
]);

const DOC_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'text/',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/octet-stream',
];

export type ChatOutgoingFileKind = 'image' | 'document';

export function classifyChatOutgoingFile(file: File): ChatOutgoingFileKind | null {
  const mime = (file.type || '').toLowerCase().trim();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (mime.startsWith('image/')) return 'image';
  if (IMAGE_EXT.has(ext)) return 'image';

  if (DOC_EXT.has(ext)) return 'document';
  for (const p of DOC_MIME_PREFIXES) {
    if (mime.startsWith(p) || mime === p) return 'document';
  }

  return null;
}

export function validateChatOutgoingFileSize(file: File): { ok: true } | { ok: false; message: string } {
  if (file.size > CHAT_OUTGOING_FILE_MAX_BYTES) {
    return { ok: false, message: 'Arquivo excede o limite de tamanho (~10 MB).' };
  }
  return { ok: true };
}

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function inferDocumentMimeForSend(file: File): string {
  const t = file.type?.trim();
  if (t) return t;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}
