import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { Rnd } from 'react-rnd';
import '@/lib/pdfWorker';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ContractSignatureField } from '@/types/contracts';
import { PDF_SIGNER_COLOR_PALETTE, pdfSignerColorIndex } from '@/utils/pdfSignerColors';
import {
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  MousePointerClick,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import { PdfSignatureFieldCard } from '@/components/contracts/PdfSignatureFieldCard';
import { ContractPdfExtraPageView } from '@/components/contracts/ContractPdfExtraPageView';
import type { ContractPdfExtraPage } from '@/types/contractPdfEditor';
import {
  existingRectsFromFields,
  getSignatureFieldPercentSize,
  resolveSignaturePlacement,
} from '@/lib/pdfSignatureLayout';

export type PdfFieldDraft = ContractSignatureField & { _localId: string };

export type PdfEditorSignerRef = {
  id: string;
  name: string;
  role: 'CLIENT' | 'INTERNAL';
  taxId?: string | null;
  email?: string | null;
};

const SIGNATURE_SIZE = getSignatureFieldPercentSize();

function newLocalId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toDraft(f: ContractSignatureField): PdfFieldDraft {
  const draft: PdfFieldDraft = { ...f, _localId: f.id ?? newLocalId() };
  if (draft.field_type === 'signature') {
    if (draft.width < 25) draft.width = SIGNATURE_SIZE.width;
    if (draft.height < 10) draft.height = SIGNATURE_SIZE.height;
  }
  return draft;
}

export function findSignatureFieldForSigner(
  fields: PdfFieldDraft[],
  signerId: string,
): PdfFieldDraft | undefined {
  return fields.find((f) => f.field_type === 'signature' && f.contract_signer_id === signerId);
}

type Props = {
  pdfUrl: string | null;
  pageCount: number;
  /** Páginas do PDF original (sem extras). Default: pageCount. */
  sourcePageCount?: number;
  extraPages?: ContractPdfExtraPage[];
  onExtraPageHtmlChange?: (pageId: string, html: string) => void;
  fields: PdfFieldDraft[];
  onChange: (next: PdfFieldDraft[]) => void;
  readOnly?: boolean;
  signers?: PdfEditorSignerRef[];
  placementSignerId?: string | null;
  onPlacementSignerIdChange?: (id: string | null) => void;
  /** Scroll da página (sem área interna com overflow). */
  naturalScroll?: boolean;
  onAppendPage?: () => Promise<void>;
  appendPageLoading?: boolean;
  /** Oculta botão duplicado quando a sidebar já oferece «Adicionar página». */
  hideToolbarAppend?: boolean;
  currentPage?: number;
  onCurrentPageChange?: (page: number) => void;
};

export function ContractPdfSignatureEditor({
  pdfUrl,
  pageCount,
  sourcePageCount: sourcePageCountProp,
  extraPages = [],
  onExtraPageHtmlChange,
  fields,
  onChange,
  readOnly = false,
  signers = [],
  placementSignerId = null,
  onPlacementSignerIdChange,
  naturalScroll = true,
  onAppendPage,
  appendPageLoading = false,
  hideToolbarAppend = false,
  currentPage: controlledPage,
  onCurrentPageChange,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const [internalPage, setInternalPage] = useState(1);
  const currentPage = controlledPage ?? internalPage;
  const setCurrentPage = onCurrentPageChange ?? setInternalPage;
  const [basePageWidth, setBasePageWidth] = useState(720);
  const [zoom, setZoom] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placementPulse, setPlacementPulse] = useState(false);

  const sourcePages = Math.max(1, sourcePageCountProp ?? (pageCount || 1));
  const pages = Math.max(sourcePages, pageCount || 1, sourcePages + extraPages.length);
  const isExtraPage = currentPage > sourcePages;
  const activeExtraPage = extraPages.find((p) => p.virtual_page === currentPage);
  const pageWidth = Math.round(basePageWidth * zoom);
  const pageHeight = pageWidth * 1.414;
  const canShowPdfCanvas = Boolean(pdfUrl) || isExtraPage;
  const placementSigner = signers.find((s) => s.id === placementSignerId) ?? null;
  const isPlacing = Boolean(placementSignerId && !readOnly);

  const signatureFields = useMemo(
    () => fields.filter((f) => f.field_type === 'signature'),
    [fields],
  );

  const pageFields = useMemo(
    () => signatureFields.filter((f) => f.page === currentPage),
    [signatureFields, currentPage],
  );

  const placedSignerIds = useMemo(
    () => new Set(signatureFields.map((f) => f.contract_signer_id).filter(Boolean)),
    [signatureFields],
  );
  const pendingSigners = signers.filter((s) => !placedSignerIds.has(s.id)).length;

  useEffect(() => {
    if (currentPage > pages) setCurrentPage(pages);
  }, [currentPage, pages]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 720;
      const next = Math.min(960, Math.max(520, w - 56));
      setBasePageWidth(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlacing) return;
    setPlacementPulse(true);
    const t = window.setTimeout(() => setPlacementPulse(false), 600);
    return () => window.clearTimeout(t);
  }, [isPlacing, placementSignerId]);

  const removeField = useCallback(
    (localId: string) => {
      const next = fields.filter((f) => f._localId !== localId);
      onChange(next);
      if (selectedId === localId) setSelectedId(null);
      toast.success('Assinatura removida do documento.');
    },
    [fields, onChange, selectedId],
  );

  const applyPlacement = useCallback(
    (centerX: number, centerY: number, preferPage: number, excludeId?: string) => {
      const resolved = resolveSignaturePlacement({
        pageCount: pages,
        preferPage,
        centerX,
        centerY,
        width: SIGNATURE_SIZE.width,
        height: SIGNATURE_SIZE.height,
        existing: existingRectsFromFields(fields),
        excludeId,
      });
      return resolved;
    },
    [fields, pages],
  );

  const placeOrMoveSignature = useCallback(
    (xPct: number, yPct: number) => {
      if (!placementSigner) return;

      const existing = findSignatureFieldForSigner(fields, placementSigner.id);
      const resolved = applyPlacement(xPct, yPct, currentPage, existing?._localId);

      if (resolved.movedToNextPage && resolved.page !== currentPage) {
        setCurrentPage(resolved.page);
        toast.info(`Assinatura posicionada na página ${resolved.page} (sem espaço na página anterior).`);
      }

      const patch = {
        page: resolved.page,
        x: resolved.x,
        y: resolved.y,
        width: SIGNATURE_SIZE.width,
        height: SIGNATURE_SIZE.height,
      };

      if (existing) {
        onChange(fields.map((f) => (f._localId === existing._localId ? { ...f, ...patch } : f)));
        setSelectedId(existing._localId);
        toast.success('Posição da assinatura atualizada.');
      } else {
        const next: PdfFieldDraft = {
          _localId: newLocalId(),
          ...patch,
          field_type: 'signature',
          signer_type: placementSigner.role,
          contract_signer_id: placementSigner.id,
          required: true,
          label: `Assinatura — ${placementSigner.name}`,
          sort_order: fields.length,
        };
        onChange([...fields, next]);
        setSelectedId(next._localId);
        toast.success('Assinatura posicionada no documento.');
      }

      onPlacementSignerIdChange?.(null);
    },
    [placementSigner, fields, onChange, currentPage, onPlacementSignerIdChange, pages, applyPlacement],
  );

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPlacing) {
      if (e.target === e.currentTarget) setSelectedId(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / pageWidth) * 100;
    const y = ((e.clientY - rect.top) / pageHeight) * 100;
    placeOrMoveSignature(x, y);
  };

  const updateField = useCallback(
    (localId: string, patch: Partial<PdfFieldDraft>) => {
      onChange(fields.map((f) => (f._localId === localId ? { ...f, ...patch } : f)));
    },
    [fields, onChange],
  );

  return (
    <div
      className={cn(
        'flex flex-col',
        naturalScroll ? 'w-full' : 'min-h-0 flex-1 bg-muted/20',
      )}
    >
      <div className="sticky top-[3.25rem] z-20 flex flex-wrap items-center gap-2 border-b border-border/40 bg-background/90 px-3 py-2 backdrop-blur-md sm:top-14">
        <Select value={String(currentPage)} onValueChange={(v) => setCurrentPage(Number(v))}>
          <SelectTrigger className="h-9 w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <SelectItem key={p} value={String(p)}>
                Página {p} de {pages}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={zoom <= 0.75}
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.1))}
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={zoom >= 1.35}
            onClick={() => setZoom((z) => Math.min(1.35, z + 0.1))}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          disabled={currentPage >= pages}
          onClick={() => setCurrentPage((p) => Math.min(pages, p + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="hidden text-xs text-muted-foreground md:inline">
          {signatureFields.length} no PDF · {pendingSigners} pendente{pendingSigners !== 1 ? 's' : ''}
        </span>
        {onAppendPage && !readOnly && !hideToolbarAppend ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn('h-9 gap-1.5', !isPlacing && !selectedId && 'ml-auto')}
            disabled={appendPageLoading || !pdfUrl}
            onClick={() => void onAppendPage()}
          >
            <FilePlus2 className="h-4 w-4" />
            Adicionar página
          </Button>
        ) : null}
        {isPlacing ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="ml-auto gap-1.5 h-9"
            onClick={() => onPlacementSignerIdChange?.(null)}
          >
            <X className="h-4 w-4" />
            Cancelar posicionamento
          </Button>
        ) : selectedId && !readOnly ? (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="ml-auto gap-1.5 h-9"
            onClick={() => removeField(selectedId)}
          >
            <Trash2 className="h-4 w-4" />
            Remover assinatura selecionada
          </Button>
        ) : (
          <p className="ml-auto text-xs text-muted-foreground hidden sm:block">
            Selecione um assinante à esquerda e use «Inserir assinatura»
          </p>
        )}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative w-full',
          naturalScroll
            ? 'min-h-[min(72vh,900px)] py-8 px-4 sm:px-8 md:px-12'
            : 'min-h-0 flex-1 overflow-auto',
        )}
      >
        {!canShowPdfCanvas ? (
          <div className="flex min-h-[min(60vh,560px)] flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-medium text-foreground">Nenhum documento carregado</p>
            <p className="text-sm text-muted-foreground max-w-md">
              Use <strong className="text-foreground">Importar PDF</strong> no topo da página para carregar o
              documento. Depois adicione os assinantes e posicione as assinaturas.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              'relative flex justify-center transition-colors duration-300',
              isPlacing && 'rounded-xl bg-black/20',
            )}
          >
            {/* Overlay de modo posicionamento */}
            {isPlacing && placementSigner ? (
              <div
                className="pointer-events-none fixed inset-0 z-[5] bg-black/20 md:absolute md:inset-0"
                aria-hidden
              />
            ) : null}

            {isPlacing && placementSigner ? (
              <div
                className={cn(
                  'pointer-events-none absolute left-1/2 top-6 z-30 w-[min(92%,420px)] -translate-x-1/2',
                  'rounded-xl border border-primary/40 bg-background shadow-xl px-4 py-3 text-center',
                  'animate-in fade-in slide-in-from-top-2 duration-300',
                  placementPulse && 'ring-2 ring-primary ring-offset-2',
                )}
              >
                <p className="text-sm font-semibold text-primary flex items-center justify-center gap-2">
                  <MousePointerClick className="h-4 w-4 shrink-0" />
                  Clique no documento
                </p>
                <p className="mt-1.5 text-sm text-muted-foreground leading-snug">
                  Posicione a assinatura de{' '}
                  <strong className="text-foreground">{placementSigner.name}</strong> no local desejado.
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Um clique define a posição · Arraste depois para ajustar
                </p>
              </div>
            ) : null}

            <div
              ref={canvasWrapRef}
              className={cn(
                'relative z-10 rounded-sm bg-white shadow-[0_8px_40px_-12px_rgba(0,0,0,0.25)] transition-all duration-300',
                isPlacing && 'ring-4 ring-primary/40 shadow-[0_12px_48px_-8px_rgba(59,130,246,0.35)]',
                placementPulse && isPlacing && 'scale-[1.005]',
              )}
              style={{ width: pageWidth, height: pageHeight }}
              onClick={handleCanvasClick}
              role={isPlacing ? 'button' : undefined}
              aria-label={
                isPlacing
                  ? `Clique para posicionar assinatura de ${placementSigner?.name}`
                  : 'Área do documento PDF'
              }
            >
              {!isExtraPage && pdfUrl ? (
                <Document
                  file={pdfUrl}
                  loading={
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      A carregar PDF…
                    </div>
                  }
                >
                  <Page
                    pageNumber={Math.min(currentPage, sourcePages)}
                    width={pageWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                  />
                </Document>
              ) : isExtraPage ? (
                <div className="absolute inset-0 bg-white" aria-hidden />
              ) : null}

              {isExtraPage && activeExtraPage && onExtraPageHtmlChange ? (
                <ContractPdfExtraPageView
                  html={activeExtraPage.html_snapshot}
                  onChange={(html) => onExtraPageHtmlChange(activeExtraPage.id, html)}
                  readOnly={readOnly}
                  placementMode={isPlacing}
                  pageWidth={pageWidth}
                  pageHeight={pageHeight}
                />
              ) : isExtraPage ? (
                <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground">
                  Página editável não encontrada. Salve o rascunho ou recarregue.
                </div>
              ) : null}

              {/* Campos — desativados durante posicionamento para não interceptar clique */}
              {pageFields.map((f) => {
                const signerKey = f.contract_signer_id ?? '';
                const palette = PDF_SIGNER_COLOR_PALETTE[pdfSignerColorIndex(signerKey)]!;
                const signerRef = signers.find((s) => s.id === f.contract_signer_id);
                const left = (f.x / 100) * pageWidth;
                const top = (f.y / 100) * pageHeight;
                const w = (f.width / 100) * pageWidth;
                const h = (f.height / 100) * pageHeight;
                const isSelected = selectedId === f._localId;
                const fieldInteractive = !readOnly && !isPlacing;

                return (
                  <Rnd
                    key={f._localId}
                    size={{ width: w, height: h }}
                    position={{ x: left, y: top }}
                    bounds="parent"
                    disableDragging={!fieldInteractive}
                    enableResizing={false}
                    style={{ pointerEvents: isPlacing ? 'none' : 'auto', zIndex: isSelected ? 20 : 15 }}
                    onDragStart={(e) => e.stopPropagation()}
                    onDragStop={(_e, d) => {
                      const cx = ((d.x + w / 2) / pageWidth) * 100;
                      const cy = ((d.y + h / 2) / pageHeight) * 100;
                      const resolved = applyPlacement(cx, cy, currentPage, f._localId);
                      if (resolved.movedToNextPage && resolved.page !== currentPage) {
                        setCurrentPage(resolved.page);
                        toast.info(`Campo movido para a página ${resolved.page}.`);
                      }
                      updateField(f._localId, {
                        page: resolved.page,
                        x: resolved.x,
                        y: resolved.y,
                        width: SIGNATURE_SIZE.width,
                        height: SIGNATURE_SIZE.height,
                      });
                    }}
                    onMouseDown={(e: React.MouseEvent) => {
                      e.stopPropagation();
                    }}
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setSelectedId(f._localId);
                    }}
                    className="group"
                  >
                    <div className="relative h-full w-full">
                      <PdfSignatureFieldCard
                        signerName={signerRef?.name ?? 'Assinatura'}
                        taxId={signerRef?.taxId}
                        email={signerRef?.email}
                        status="placed"
                        selected={isSelected}
                        palette={palette}
                      />
                      {fieldInteractive ? (
                        <button
                          type="button"
                          className="absolute -right-2 -top-2 z-10 rounded-full bg-destructive p-1 text-destructive-foreground shadow opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                          aria-label="Remover assinatura"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            removeField(f._localId);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </Rnd>
                );
              })}

              {isPlacing ? (
                <div
                  className="pointer-events-none absolute inset-0 z-[12] cursor-crosshair"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, transparent, transparent 11px, rgba(59,130,246,0.06) 11px, rgba(59,130,246,0.06) 12px)',
                  }}
                />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function mapDraftsToApiFields(drafts: PdfFieldDraft[]): Omit<ContractSignatureField, 'id'>[] {
  const std = getSignatureFieldPercentSize();
  return drafts.map((f, i) => ({
    page: f.page,
    x: Math.round(f.x * 100) / 100,
    y: Math.round(f.y * 100) / 100,
    width:
      f.field_type === 'signature'
        ? Math.round((f.width >= 25 ? f.width : std.width) * 100) / 100
        : Math.round(f.width * 100) / 100,
    height:
      f.field_type === 'signature'
        ? Math.round((f.height >= 10 ? f.height : std.height) * 100) / 100
        : Math.round(f.height * 100) / 100,
    field_type: f.field_type,
    signer_type: f.signer_type,
    contract_signer_id: f.contract_signer_id ?? null,
    required: f.required,
    label: f.label ?? null,
    sort_order: f.sort_order ?? i,
  }));
}
