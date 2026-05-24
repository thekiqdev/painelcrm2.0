import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import '@/lib/pdfWorker';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5] as const;

type ContractPdfViewerProps = {
  /** Carrega o PDF (ex.: fetch autenticado ou público). */
  loadPdf: () => Promise<Blob>;
  className?: string;
  /** Altura máxima da área de scroll. */
  maxHeight?: string;
  /** Recarregar quando esta chave mudar (ex.: contract id). */
  reloadKey?: string;
};

/**
 * Visualizador multipágina do PDF real (react-pdf), com zoom e scroll vertical.
 */
export function ContractPdfViewer({
  loadPdf,
  className,
  maxHeight = 'min(80vh, 900px)',
  reloadKey,
}: ContractPdfViewerProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(1);
  const [baseWidth, setBaseWidth] = useState(640);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const scale = ZOOM_STEPS[zoomIndex] ?? 1;
  const pageWidth = Math.round(baseWidth * scale);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setBaseWidth(Math.min(720, Math.max(280, w - 32)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setNumPages(0);
      setObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      try {
        const blob = await loadPdf();
        if (cancelled) return;
        if (!blob.size) throw new Error('PDF vazio ou indisponível.');
        url = URL.createObjectURL(blob);
        setObjectUrl(url);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Falha ao carregar o PDF.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [loadPdf, reloadKey]);

  const onDocumentLoad = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n);
  }, []);

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  );

  if (loading) {
    return (
      <div
        className={cn(
          'flex min-h-[240px] items-center justify-center rounded-lg border bg-muted/30',
          className,
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div
        className={cn(
          'rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive',
          className,
        )}
      >
        {error || 'Não foi possível exibir o documento PDF.'}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-sm">
        <span className="text-xs text-muted-foreground">
          {numPages > 0 ? `${numPages} página${numPages === 1 ? '' : 's'}` : 'Documento PDF'}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={zoomIndex <= 0}
            aria-label="Reduzir zoom"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[3rem] text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={zoomIndex >= ZOOM_STEPS.length - 1}
            aria-label="Aumentar zoom"
            onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className="overflow-auto rounded-lg border bg-neutral-100/80 p-3 sm:p-5 dark:bg-neutral-900/50"
        style={{ maxHeight }}
      >
        <Document
          file={objectUrl}
          onLoadSuccess={onDocumentLoad}
          loading={
            <p className="py-8 text-center text-sm text-muted-foreground">A preparar páginas…</p>
          }
          error={
            <p className="py-8 text-center text-sm text-destructive">Erro ao interpretar o PDF.</p>
          }
        >
          <div className="mx-auto flex w-full max-w-[720px] flex-col items-center gap-6">
            {pageNumbers.map((pageNum) => (
              <div
                key={pageNum}
                className="w-full shadow-md ring-1 ring-border/40 bg-white dark:bg-white"
              >
                <Page
                  pageNumber={pageNum}
                  width={pageWidth}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  loading={
                    <div
                      className="flex items-center justify-center bg-white"
                      style={{ width: pageWidth, height: Math.round(pageWidth * 1.414) }}
                    >
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  }
                />
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  );
}
