import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button } from '@/components/ui/button';
import { contractsService } from '@/services/contracts';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';
import { FileUp, Loader2 } from 'lucide-react';
import {
  ContractPdfSignatureEditor,
  mapDraftsToApiFields,
  toDraft,
  type PdfEditorSignerRef,
  type PdfFieldDraft,
} from '@/components/contracts/ContractPdfSignatureEditor';
import type { PdfSignerDraft } from '@/components/contracts/ContractPdfSignersPanel';
import type { ContractPdfExtraPage } from '@/types/contractPdfEditor';
import { contractTitleFromPdfFilename } from '@/utils/contractDocument';
import { remapPdfFieldSignerIds } from '@/utils/pdfSignatureFieldSignerIds';

const MAX_MB = 15;

export type ContractPdfSignatureStepHandle = {
  saveDraft: () => Promise<boolean>;
  sendForSignature: () => Promise<boolean>;
  uploadPdf: (file: File) => Promise<void>;
  appendExtraPage: () => Promise<void>;
};

type Props = {
  contractId?: string;
  onContractCreated?: (id: string) => void;
  title: string;
  onTitleChange: (t: string) => void;
  documentLocked: boolean;
  onPdfReadyChange?: (ready: boolean) => void;
  /** Indica se o PDF de origem já está carregado no editor (para rótulo do botão de upload). */
  onPdfLoadedChange?: (loaded: boolean) => void;
  onSaveDraft: (contractId: string) => Promise<void>;
  onSendForSignature: (contractId: string) => Promise<void>;
  saving: boolean;
  canSend: boolean;
  signers: PdfSignerDraft[];
  placementSignerId: string | null;
  onPlacementSignerIdChange: (id: string | null) => void;
  onSyncSigners: (contractId: string) => Promise<PdfSignerDraft[]>;
  fields: PdfFieldDraft[];
  onFieldsChange: React.Dispatch<React.SetStateAction<PdfFieldDraft[]>>;
  /** Apenas editor PDF (chrome no layout pai). */
  editorOnly?: boolean;
  onBack?: () => void;
  sourcePageCount?: number;
  onSourcePageCountChange?: (n: number) => void;
  extraPages?: ContractPdfExtraPage[];
  onExtraPagesChange?: (pages: ContractPdfExtraPage[]) => void;
  currentPage?: number;
  onCurrentPageChange?: (page: number) => void;
  onAppendPageLoadingChange?: (loading: boolean) => void;
};

export const ContractPdfSignatureStep = forwardRef<ContractPdfSignatureStepHandle, Props>(
  function ContractPdfSignatureStep(
    {
      contractId: initialContractId,
      title,
      onTitleChange,
      documentLocked,
      onPdfReadyChange,
      onPdfLoadedChange,
      onSaveDraft,
      onSendForSignature,
      onContractCreated,
      saving,
      canSend: _canSend,
      signers,
      placementSignerId,
      onPlacementSignerIdChange,
      onSyncSigners,
      fields,
      onFieldsChange,
      editorOnly = false,
      onBack: _onBack,
      sourcePageCount: controlledSourcePages,
      onSourcePageCountChange,
      extraPages: controlledExtraPages,
      onExtraPagesChange,
      currentPage: controlledCurrentPage,
      onCurrentPageChange,
      onAppendPageLoadingChange,
    },
    ref,
  ) {
    const [contractId, setContractId] = useState(initialContractId ?? '');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pageCount, setPageCount] = useState(1);
    const [internalSourcePages, setInternalSourcePages] = useState(1);
    const [internalExtraPages, setInternalExtraPages] = useState<ContractPdfExtraPage[]>([]);
    const [internalCurrentPage, setInternalCurrentPage] = useState(1);
    const sourcePageCount = controlledSourcePages ?? internalSourcePages;
    const setSourcePageCount = onSourcePageCountChange ?? setInternalSourcePages;
    const extraPages = controlledExtraPages ?? internalExtraPages;
    const setExtraPages = onExtraPagesChange ?? setInternalExtraPages;
    const currentPage = controlledCurrentPage ?? internalCurrentPage;
    const setCurrentPage = onCurrentPageChange ?? setInternalCurrentPage;
    const [uploading, setUploading] = useState(false);
    const [appendingPage, setAppendingPage] = useState(false);
    const [loadingPdf, setLoadingPdf] = useState(false);
    const blobUrlRef = useRef<string | null>(null);
    const onFieldsChangeRef = useRef(onFieldsChange);
    onFieldsChangeRef.current = onFieldsChange;

    const editorSigners: PdfEditorSignerRef[] = useMemo(
      () =>
      signers.map((s) => ({
        id: s.serverId ?? s.localId,
        name: s.name,
        role: s.role,
        taxId: s.tax_id || null,
        email: s.email,
      })),
      [signers],
    );

    const revokeBlob = useCallback(() => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    }, []);

    const loadPdfPreview = useCallback(
      async (id: string) => {
        setLoadingPdf(true);
        try {
          const blob = await contractsService.fetchContractSourcePdfBlob(id);
          revokeBlob();
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setPdfUrl(url);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Erro ao carregar PDF');
          setPdfUrl(null);
        } finally {
          setLoadingPdf(false);
        }
      },
      [revokeBlob],
    );

    useEffect(() => {
      if (!initialContractId) return;
      setContractId(initialContractId);
      let cancelled = false;
      void (async () => {
        try {
          const [sig, editor] = await Promise.all([
            contractsService.getContractSignatureFields(initialContractId),
            contractsService.getContractPdfEditorState(initialContractId).catch(() => null),
          ]);
          if (cancelled) return;
          const drafts = sig.fields.map(toDraft);
          onFieldsChangeRef.current(drafts);
          const src = editor?.source_pdf_page_count ?? sig.pdf_page_count ?? 1;
          setSourcePageCount(src);
          setPageCount(editor?.pdf_page_count ?? sig.pdf_page_count ?? src);
          if (editor?.extra_pages?.length) setExtraPages(editor.extra_pages);
          else setExtraPages([]);
          await loadPdfPreview(initialContractId);
        } catch (e) {
          console.error(e);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [initialContractId, loadPdfPreview]);

    useEffect(() => () => revokeBlob(), [revokeBlob]);

    useEffect(() => {
      onPdfLoadedChange?.(Boolean(pdfUrl));
    }, [pdfUrl, onPdfLoadedChange]);

    useEffect(() => {
      onPdfReadyChange?.(
        Boolean(pdfUrl && signers.length > 0 && fields.some((f) => f.field_type === 'signature')),
      );
    }, [pdfUrl, fields, signers.length, onPdfReadyChange]);

    const persistExtraPages = async (id: string) => {
      await Promise.all(
        extraPages.map((p) =>
          contractsService.patchContractPdfExtraPage(id, p.id, { html_snapshot: p.html_snapshot }),
        ),
      );
    };

    const persistFields = async (id: string, fieldsToSave: PdfFieldDraft[]) => {
      await contractsService.saveContractSignatureFields(id, {
        fields: mapDraftsToApiFields(fieldsToSave),
        pdf_page_count: pageCount,
      });
      if (extraPages.length > 0) await persistExtraPages(id);
    };

    const handleAppendPage = async () => {
      if (!contractId) return;
      setAppendingPage(true);
      onAppendPageLoadingChange?.(true);
      try {
        const res = await contractsService.appendContractPdfPage(contractId);
        setSourcePageCount(res.source_pdf_page_count);
        setPageCount(res.pdf_page_count);
        setExtraPages([...extraPages, res.page]);
        setCurrentPage(res.page.virtual_page);
        toast.success('Página editável adicionada ao final do contrato.');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Falha ao adicionar página');
      } finally {
        setAppendingPage(false);
        onAppendPageLoadingChange?.(false);
      }
    };

    const handleExtraPageHtmlChange = (pageId: string, html: string) => {
      setExtraPages(extraPages.map((p) => (p.id === pageId ? { ...p, html_snapshot: html } : p)));
    };

    const ensureReady = async (): Promise<{ id: string; fields: PdfFieldDraft[] } | null> => {
      if (!contractId) {
        toast.error('Faça upload do PDF primeiro.');
        return null;
      }
      if (signers.length === 0) {
        toast.error('Adicione pelo menos um assinante.');
        return null;
      }
      if (!fields.some((f) => f.field_type === 'signature')) {
        toast.error('Posicione pelo menos um campo de assinatura no PDF.');
        return null;
      }
      const syncedSigners = await onSyncSigners(contractId);
      const remappedFields = remapPdfFieldSignerIds(fields, syncedSigners);
      onFieldsChange(remappedFields);

      const signerKeys = syncedSigners.map((s) => s.serverId ?? s.localId);
      const allPlaced = signerKeys.every((key) =>
        remappedFields.some((f) => f.field_type === 'signature' && f.contract_signer_id === key),
      );
      if (!allPlaced) {
        toast.error('Cada assinante precisa de uma assinatura posicionada no PDF.');
        return null;
      }
      return { id: contractId, fields: remappedFields };
    };

    const saveDraft = async (): Promise<boolean> => {
      const ready = await ensureReady();
      if (!ready) return false;
      try {
        await persistFields(ready.id, ready.fields);
        await onSaveDraft(ready.id);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao salvar';
        toast.error(
          msg === 'Dados inválidos.'
            ? 'Não foi possível salvar os campos do PDF. Tente reposicionar as assinaturas.'
            : msg,
        );
        return false;
      }
    };

    const sendForSignature = async (): Promise<boolean> => {
      const ready = await ensureReady();
      if (!ready) return false;
      try {
        await persistFields(ready.id, ready.fields);
        await onSendForSignature(ready.id);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro ao enviar';
        toast.error(
          msg === 'Dados inválidos.'
            ? 'Não foi possível salvar os campos do PDF antes do envio. Tente reposicionar as assinaturas.'
            : msg,
        );
        return false;
      }
    };

    const handleFile = async (file: File | null) => {
      if (!file || documentLocked) return;
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`PDF deve ter no máximo ${MAX_MB} MB.`);
        return;
      }

      let effectiveTitle = title.trim();
      let titleAutoFilled = false;
      if (!effectiveTitle) {
        const fromFile = contractTitleFromPdfFilename(file.name);
        if (fromFile) {
          effectiveTitle = fromFile;
          onTitleChange(fromFile);
          titleAutoFilled = true;
        }
      }
      if (!effectiveTitle) {
        toast.error('Informe o título do contrato ou use um PDF com nome identificável.');
        return;
      }

      setUploading(true);
      try {
        let id = contractId;
        if (!id) {
          const created = await contractsService.createContract({
            title: effectiveTitle,
            document_kind: 'pdf_signature',
            content_html: '<p>Contrato PDF com assinatura online.</p>',
          });
          id = created.id;
          setContractId(id);
          onContractCreated?.(id);
        }
        if (titleAutoFilled) {
          await contractsService.updateContract(id, { title: effectiveTitle });
        }
        const up = await contractsService.uploadContractPdf(id, file);
        if (up.pdf_page_count) {
          setPageCount(up.pdf_page_count);
          setSourcePageCount(up.pdf_page_count);
        }
        setExtraPages([]);
        setCurrentPage(1);
        await loadPdfPreview(id);
        toast.success(
          titleAutoFilled ? 'PDF carregado — título preenchido pelo nome do arquivo' : 'PDF carregado',
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Falha no upload';
        toast.error(msg);
      } finally {
        setUploading(false);
      }
    };

    useImperativeHandle(
      ref,
      () => ({
        saveDraft,
        sendForSignature,
        uploadPdf: (file: File) => handleFile(file),
        appendExtraPage: handleAppendPage,
      }),
      [contractId, signers, fields, pageCount, title, documentLocked, extraPages],
    );

    if (editorOnly) {
      return (
        <div className="w-full">
          {!documentLocked ? (
            <div className="mb-3 flex justify-end lg:hidden">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 gap-2"
                disabled={uploading || saving}
                asChild
              >
                <label
                  className={cn('cursor-pointer', (uploading || saving) && 'pointer-events-none opacity-60')}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                  {pdfUrl ? 'Substituir PDF' : 'Importar PDF'}
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </Button>
            </div>
          ) : null}
          {loadingPdf ? (
            <div className="flex min-h-[min(60vh,520px)] items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              A carregar documento…
            </div>
          ) : (
            <ContractPdfSignatureEditor
              pdfUrl={pdfUrl}
              pageCount={pageCount}
              sourcePageCount={sourcePageCount}
              extraPages={extraPages}
              onExtraPageHtmlChange={documentLocked ? undefined : handleExtraPageHtmlChange}
              fields={fields}
              onChange={(next) => onFieldsChange(next)}
              readOnly={documentLocked}
              signers={editorSigners}
              placementSignerId={placementSignerId}
              onPlacementSignerIdChange={onPlacementSignerIdChange}
              naturalScroll
              hideToolbarAppend
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
              appendPageLoading={appendingPage}
              onAppendPage={
                documentLocked || !contractId ? undefined : () => handleAppendPage()
              }
            />
          )}
        </div>
      );
    }

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-[min(55vh,680px)] flex-1 flex flex-col">
          {loadingPdf ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              A carregar documento…
            </div>
          ) : (
            <ContractPdfSignatureEditor
              pdfUrl={pdfUrl}
              pageCount={pageCount}
              sourcePageCount={sourcePageCount}
              extraPages={extraPages}
              onExtraPageHtmlChange={documentLocked ? undefined : handleExtraPageHtmlChange}
              fields={fields}
              onChange={(next) => onFieldsChange(next)}
              readOnly={documentLocked}
              signers={editorSigners}
              placementSignerId={placementSignerId}
              onPlacementSignerIdChange={onPlacementSignerIdChange}
              naturalScroll={false}
              currentPage={currentPage}
              onCurrentPageChange={setCurrentPage}
              onAppendPage={
                documentLocked || !contractId ? undefined : () => handleAppendPage()
              }
              appendPageLoading={appendingPage}
            />
          )}
        </div>
      </div>
    );
  },
);
