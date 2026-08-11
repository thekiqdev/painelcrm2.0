/**
 * Converte erros de upload (nginx 413 HTML, Multer LIMIT_FILE_SIZE, etc.)
 * em mensagem legível para toast — evita mostrar HTML ao utilizador.
 */
export function humanizeMediaUploadError(
  error: unknown,
  opts?: { status?: number; fallback?: string },
): string {
  const fallback = opts?.fallback ?? 'Erro no upload.';
  const status = opts?.status;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error ?? '');
  const lower = raw.toLowerCase();

  if (
    status === 413 ||
    lower.includes('413') ||
    lower.includes('request entity too large') ||
    lower.includes('entity too large')
  ) {
    return 'Arquivo demasiado grande para o servidor. Reduza o tamanho e tente novamente.';
  }

  if (
    lower.includes('arquivo muito grande') ||
    lower.includes('file too large') ||
    lower.includes('limit_file_size') ||
    lower.includes('file size')
  ) {
    return 'Arquivo demasiado grande. Reduza o tamanho e tente novamente.';
  }

  if (/<!doctype\s+html|<html[\s>]|<\/html>/i.test(raw)) {
    return 'Não foi possível enviar o ficheiro (servidor recusou o tamanho ou o formato).';
  }

  const stripped = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return stripped || fallback;
}
