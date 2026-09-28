import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/sonner';
import { importChatbotFlow, type ChatbotFlow } from '@/services/chatbotFlows';
import {
  resolveImportDocumentClient,
  type ChatbotFlowExportDocument,
  type ExportPreview,
  type ForeignImportReport,
} from '../lib/flowPortability';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Se definido, permite opção de substituir o draft deste flow (só formato nativo). */
  replaceTargetFlowId?: string;
  onImported: (flow: ChatbotFlow, mode: 'create' | 'replace_draft') => void;
};

export function ImportFlowDialog({ open, onOpenChange, replaceTargetFlowId, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** Documento já resolvido (nativo); para estrangeiro = adaptado. */
  const [doc, setDoc] = useState<ChatbotFlowExportDocument | null>(null);
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [sourceFormat, setSourceFormat] = useState<
    'painelcrm.chatbot_flow' | 'chatbot.flow_data' | null
  >(null);
  const [createOnly, setCreateOnly] = useState(false);
  const [report, setReport] = useState<ForeignImportReport | null>(null);
  const [name, setName] = useState('');
  const [replaceDraft, setReplaceDraft] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);

  const reset = useCallback(() => {
    setDoc(null);
    setPreview(null);
    setSourceFormat(null);
    setCreateOnly(false);
    setReport(null);
    setName('');
    setReplaceDraft(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        setParsing(true);
        const text = await file.text();
        const raw = JSON.parse(text) as unknown;
        const resolved = resolveImportDocumentClient(raw);
        if (!resolved.ok) {
          toast.error(resolved.error);
          reset();
          return;
        }
        setDoc(resolved.doc);
        setPreview(resolved.preview);
        setSourceFormat(resolved.sourceFormat);
        setCreateOnly(resolved.createOnly);
        setReport(resolved.report);
        setName(resolved.preview.name);
        if (resolved.createOnly) setReplaceDraft(false);
      } catch {
        toast.error('Arquivo JSON inválido');
        reset();
      } finally {
        setParsing(false);
      }
    },
    [reset]
  );

  const handleImport = useCallback(async () => {
    if (!doc) {
      toast.error('Selecione um arquivo');
      return;
    }
    const mode =
      !createOnly && replaceDraft && replaceTargetFlowId ? 'replace_draft' : 'create';
    try {
      setImporting(true);
      // Envia documento já adaptado (painelcrm) — funciona mesmo com BE antigo.
      const result = await importChatbotFlow({
        document: doc,
        mode,
        target_flow_id: mode === 'replace_draft' ? replaceTargetFlowId : undefined,
        name: name.trim() || undefined,
      });
      toast.success(mode === 'create' ? 'Flow importado' : 'Draft substituído');
      onImported(result.flow, mode);
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar');
    } finally {
      setImporting(false);
    }
  }, [
    createOnly,
    doc,
    name,
    onImported,
    onOpenChange,
    replaceDraft,
    replaceTargetFlowId,
    reset,
  ]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar flow</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="flow-json">Arquivo .json</Label>
            <Input
              id="flow-json"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              disabled={parsing}
              onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              Aceita <code>painelcrm.chatbot_flow</code> ou export externo{' '}
              <code>chatbot.flow_data</code> (ex.: Fluxo Safe).
            </p>
          </div>
          {parsing ? <p className="text-sm text-muted-foreground">Analisando…</p> : null}
          {preview ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm space-y-1">
              <p>
                <span className="text-muted-foreground">Formato:</span>{' '}
                {sourceFormat === 'chatbot.flow_data' ? 'Externo (adaptado)' : 'PainelCRM'}
              </p>
              <p>
                <span className="text-muted-foreground">Nome:</span> {preview.name}
              </p>
              <p>
                <span className="text-muted-foreground">Nós:</span> {preview.nodeCount} ·{' '}
                <span className="text-muted-foreground">Conexões:</span> {preview.edgeCount}
              </p>
            </div>
          ) : null}
          {report ? (
            <div className="rounded-md border px-3 py-2 text-xs space-y-2 max-h-48 overflow-y-auto">
              <p className="font-medium text-sm">Relatório da adaptação</p>
              <p>
                Mapeados: {report.mapped.length} · Omitidos: {report.omitted.length} · Religar:{' '}
                {report.needsRelink.length} · Edges quebradas: {report.brokenEdges.length}
                {report.secretsStripped > 0
                  ? ` · Secrets removidos: ${report.secretsStripped}`
                  : ''}
              </p>
              {report.omitted.length > 0 ? (
                <div>
                  <p className="text-muted-foreground">Omitidos</p>
                  <ul className="list-disc pl-4">
                    {report.omitted.slice(0, 12).map((o) => (
                      <li key={o.id}>
                        {o.fromType} <span className="text-muted-foreground">({o.id})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {report.needsRelink.length > 0 ? (
                <div>
                  <p className="text-muted-foreground">Precisam religar IDs</p>
                  <ul className="list-disc pl-4">
                    {report.needsRelink.slice(0, 12).map((o) => (
                      <li key={o.id}>
                        {o.toType || o.fromType}
                        {o.fields?.length ? `: ${o.fields.join(', ')}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {report.brokenEdges.length > 0 ? (
                <div>
                  <p className="text-muted-foreground">Conexões removidas</p>
                  <ul className="list-disc pl-4">
                    {report.brokenEdges.slice(0, 8).map((e) => (
                      <li key={e.id}>
                        {e.id}: {e.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
          {preview ? (
            <div className="space-y-1.5">
              <Label htmlFor="import-name">Nome ao importar</Label>
              <Input
                id="import-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
              />
            </div>
          ) : null}
          {replaceTargetFlowId && !createOnly ? (
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={replaceDraft}
                onCheckedChange={(v) => setReplaceDraft(v === true)}
              />
              <span>
                Substituir o <strong>draft</strong> deste flow (não altera versões publicadas)
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              {createOnly
                ? 'Formato externo: sempre cria um flow novo em rascunho.'
                : 'Por padrão cria um flow novo em rascunho.'}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button disabled={!doc || importing || parsing} onClick={() => void handleImport()}>
            {importing ? 'Importando…' : 'Importar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
