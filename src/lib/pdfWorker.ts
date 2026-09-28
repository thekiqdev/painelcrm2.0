import { pdfjs } from 'react-pdf';

/**
 * Worker PDF.js — mesma versão que react-pdf (pdfjs.version / pdfjs-dist no package.json).
 *
 * Em produção o nginx servia `.mjs` como `application/octet-stream`, o que quebra o worker
 * (react-pdf: "Failed to load PDF file"). Usamos CDN com MIME correto; após deploy do nginx
 * com regra para `.mjs`, o bundle local também funciona.
 */
function resolvePdfWorkerSrc(): string {
  if (import.meta.env.PROD) {
    return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  }
  return new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
}

pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc();
