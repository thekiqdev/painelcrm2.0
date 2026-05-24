import { pdfjs } from 'react-pdf';

/**
 * Worker deve usar a mesma versão do pdfjs que o react-pdf embute (evita 4.8 vs 4.10).
 * `pdfjs.version` vem do pacote alinhado em package.json com react-pdf.
 */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();
