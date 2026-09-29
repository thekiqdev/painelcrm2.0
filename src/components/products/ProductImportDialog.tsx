import React, { useEffect, useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  decodeWooCsvBuffer,
  prepareWooProductsFromCsv,
  type WooCsvImportPreparedRow,
  type WooCsvImportSkip,
} from "@/utils/importWooProductsCsv";
import {
  runWooProductImport,
  type ProductImportSummary,
} from "@/utils/productImportExecutor";

export type ProductImportProvider = "woocommerce" | "shopify" | "generic";

export type ProductImportFileReady = {
  provider: ProductImportProvider;
  fileName: string;
  text: string;
};

export type ProductImportPreviewReady = ProductImportFileReady & {
  prepared: WooCsvImportPreparedRow[];
  skipped: WooCsvImportSkip[];
};

export type { ProductImportSummary };

type ProviderOption = {
  id: ProductImportProvider;
  label: string;
  hint: string;
  enabled: boolean;
  soonLabel?: string;
};

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    id: "woocommerce",
    label: "WooCommerce (CSV)",
    hint: "Arquivo de exportação: Produtos → Exportar no WooCommerce.",
    enabled: true,
  },
  {
    id: "shopify",
    label: "Shopify",
    hint: "Importação via CSV do Shopify.",
    enabled: false,
    soonLabel: "Em breve",
  },
  {
    id: "generic",
    label: "Outros formatos",
    hint: "Planilha genérica e outras plataformas.",
    enabled: false,
    soonLabel: "Em breve",
  },
];

type Step = "choose" | "preview" | "importing" | "report";

interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileReady?: (args: ProductImportFileReady) => void;
  onPreviewReady?: (args: ProductImportPreviewReady) => void;
  /** Chamado após import com create/update > 0. */
  onImportComplete?: (summary: ProductImportSummary) => void;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isCsvFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt")) return true;
  const type = (file.type || "").toLowerCase();
  return type === "text/csv" || type === "text/plain" || type === "application/vnd.ms-excel";
}

export function ProductImportDialog({
  open,
  onOpenChange,
  onFileReady,
  onPreviewReady,
  onImportComplete,
}: ProductImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const baseId = useId();
  const [provider, setProvider] = useState<ProductImportProvider>("woocommerce");
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [reading, setReading] = useState(false);
  const [prepared, setPrepared] = useState<WooCsvImportPreparedRow[]>([]);
  const [skipped, setSkipped] = useState<WooCsvImportSkip[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ProductImportSummary | null>(null);
  const [rehostImages, setRehostImages] = useState(false);
  const [upsertBySku, setUpsertBySku] = useState(true);

  const busy = reading || step === "importing";

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setProvider("woocommerce");
      setFile(null);
      setStep("choose");
      setReading(false);
      setPrepared([]);
      setSkipped([]);
      setProgress({ done: 0, total: 0 });
      setSummary(null);
      setRehostImages(false);
      setUpsertBySku(true);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [open]);

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.id === provider);
  const canContinue = Boolean(selectedProvider?.enabled && file && !busy);

  const handleOpenChange = (next: boolean) => {
    if (!next && busy) return;
    onOpenChange(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.files?.[0] ?? null;
    if (!next) {
      setFile(null);
      return;
    }
    if (!isCsvFile(next)) {
      toast({
        title: "Arquivo inválido",
        description: "Selecione um arquivo .csv exportado do WooCommerce.",
        variant: "destructive",
      });
      e.target.value = "";
      setFile(null);
      return;
    }
    setFile(next);
    setStep("choose");
    setPrepared([]);
    setSkipped([]);
    setSummary(null);
  };

  const handleContinue = async () => {
    if (!file || !selectedProvider?.enabled) return;
    setReading(true);
    try {
      const buf = await file.arrayBuffer();
      const text = decodeWooCsvBuffer(buf);
      if (!text.trim()) {
        toast({
          title: "Arquivo vazio",
          description: "O CSV não contém dados para importar.",
          variant: "destructive",
        });
        return;
      }

      onFileReady?.({ provider, fileName: file.name, text });

      if (provider !== "woocommerce") {
        toast({
          title: "Origem indisponível",
          description: "Esta origem ainda não está habilitada.",
          variant: "destructive",
        });
        return;
      }

      const result = prepareWooProductsFromCsv(text);
      setPrepared(result.prepared);
      setSkipped(result.skipped);
      onPreviewReady?.({
        provider,
        fileName: file.name,
        text,
        prepared: result.prepared,
        skipped: result.skipped,
      });
      setStep("preview");

      if (result.prepared.length === 0) {
        toast({
          title: "Nenhum produto encontrado",
          description:
            result.skipped[0]?.reason ??
            "O arquivo não gerou itens importáveis (simple/variable).",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Erro ao ler/parsear CSV:", err);
      toast({
        title: "Erro ao ler arquivo",
        description:
          err instanceof Error
            ? err.message
            : "Não foi possível processar o CSV (encoding ou formato).",
        variant: "destructive",
      });
    } finally {
      setReading(false);
    }
  };

  const handleCancelImport = () => {
    abortRef.current?.abort();
  };

  const handleImport = async () => {
    if (prepared.length === 0 || busy) return;
    const ac = new AbortController();
    abortRef.current = ac;
    setStep("importing");
    setProgress({ done: 0, total: prepared.length });

    try {
      const nextSummary = await runWooProductImport(prepared, skipped, {
        rehostImages,
        upsertBySku,
        signal: ac.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setSummary(nextSummary);
      setStep("report");

      if (nextSummary.created + nextSummary.updated > 0) {
        onImportComplete?.(nextSummary);
      }

      if (nextSummary.cancelled) {
        toast({
          title: "Importação cancelada",
          description: `${nextSummary.created} criado(s), ${nextSummary.updated} atualizado(s) antes do cancelamento.`,
        });
      } else if (
        nextSummary.created + nextSummary.updated > 0 &&
        nextSummary.failed.length === 0
      ) {
        toast({
          title: "Importação concluída",
          description: `${nextSummary.created} criado(s), ${nextSummary.updated} atualizado(s).`,
        });
      } else if (nextSummary.created + nextSummary.updated > 0) {
        toast({
          title: "Importação parcial",
          description: `${nextSummary.created + nextSummary.updated} ok; ${nextSummary.failed.length} falha(s).`,
        });
      } else {
        toast({
          title: "Nenhum produto importado",
          description: "Veja o relatório de erros.",
          variant: "destructive",
        });
      }
    } catch (err) {
      console.error("Erro na importação:", err);
      setStep("preview");
      toast({
        title: "Erro na importação",
        description: err instanceof Error ? err.message : "Falha inesperada ao importar.",
        variant: "destructive",
      });
    } finally {
      abortRef.current = null;
    }
  };

  const skipPreview = skipped.slice(0, 8);
  const failPreview = summary?.failed.slice(0, 12) ?? [];
  const progressPct =
    progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  const withSku = prepared.filter((p) => normalizeSkuPreview(p.payload.sku)).length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar produtos</DialogTitle>
          <DialogDescription>
            Traga itens do seu catálogo a partir de um arquivo de exportação.
          </DialogDescription>
        </DialogHeader>

        {step === "choose" ? (
          <div className="space-y-5 py-1">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Origem</Label>
              <RadioGroup
                value={provider}
                onValueChange={(v) => setProvider(v as ProductImportProvider)}
                className="gap-2"
              >
                {PROVIDER_OPTIONS.map((opt) => {
                  const itemId = `${baseId}-${opt.id}`;
                  return (
                    <label
                      key={opt.id}
                      htmlFor={itemId}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                        !opt.enabled ? "opacity-60 cursor-not-allowed" : ""
                      } ${provider === opt.id && opt.enabled ? "border-primary bg-muted/40" : ""}`}
                    >
                      <RadioGroupItem
                        value={opt.id}
                        id={itemId}
                        disabled={!opt.enabled}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{opt.label}</span>
                          {opt.soonLabel ? (
                            <span className="text-[11px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                              {opt.soonLabel}
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{opt.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Arquivo CSV</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,.txt,text/plain"
                className="sr-only"
                onChange={handleFileChange}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!selectedProvider?.enabled || busy}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Escolher arquivo
                </Button>
                {file ? (
                  <span className="text-sm text-muted-foreground truncate max-w-[220px]" title={file.name}>
                    {file.name} · {formatBytes(file.size)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Nenhum arquivo selecionado</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                No WooCommerce: Produtos → Exportar → baixe o CSV e selecione aqui.
              </p>
            </div>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="space-y-3 py-2">
            <div className="flex items-start gap-3 rounded-md border bg-muted/30 p-3">
              <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground mt-0.5" />
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium truncate" title={file?.name}>
                  {file?.name ?? "Arquivo"}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{prepared.length}</span> produto(s)
                  prontos
                  {skipped.length > 0 ? (
                    <>
                      {" · "}
                      <span className="font-medium text-foreground">{skipped.length}</span> linha(s)
                      pulada(s)
                    </>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  Inclui simples e variáveis (variações no pai; preço = menor variação).
                </p>
              </div>
            </div>

            <div className="space-y-3 rounded-md border p-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={upsertBySku}
                  onCheckedChange={(v) => setUpsertBySku(v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium block">Atualizar existentes (SKU ou ID Woo)</span>
                  <span className="text-xs text-muted-foreground">
                    Se o ID Woo (`external_id`) ou o SKU já existir, atualiza em vez de duplicar
                    {withSku > 0 ? ` (${withSku} com SKU neste arquivo)` : ""}.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={rehostImages}
                  onCheckedChange={(v) => setRehostImages(v === true)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="text-sm font-medium block">
                    Baixar e hospedar imagens no catálogo
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Copia as URLs do Woo para o storage interno (mais lento; falhas mantêm a URL
                    externa).
                  </span>
                </span>
              </label>
            </div>

            {prepared.length > 0 ? (
              <ul className="max-h-28 overflow-y-auto rounded-md border px-3 py-2 text-sm space-y-1">
                {prepared.slice(0, 10).map((row) => (
                  <li key={`${row.lineNumber}-${row.payload.name}`} className="truncate">
                    L{row.lineNumber}
                    {row.sourceType === "variable" ? " [variável]" : ""}
                    {row.payload.has_variants && row.payload.variants?.length
                      ? ` · ${row.payload.variants.length} variantes`
                      : ""}
                    : {row.payload.name}
                    {row.payload.price != null ? ` — R$ ${row.payload.price.toFixed(2)}` : ""}
                  </li>
                ))}
                {prepared.length > 10 ? (
                  <li className="text-xs text-muted-foreground">… e mais {prepared.length - 10}</li>
                ) : null}
              </ul>
            ) : null}

            {skipPreview.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Pulados (amostra)</p>
                <ul className="max-h-24 overflow-y-auto rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground space-y-1">
                  {skipPreview.map((s, i) => (
                    <li key={`${s.line}-${i}`}>
                      L{s.line}: {s.reason}
                    </li>
                  ))}
                  {skipped.length > skipPreview.length ? (
                    <li>… e mais {skipped.length - skipPreview.length}</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === "importing" ? (
          <div className="space-y-3 py-4">
            <p className="text-sm font-medium">
              Importando {progress.done} / {progress.total}…
              {rehostImages ? " (com download de imagens)" : ""}
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-200"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Você pode cancelar; itens já gravados permanecem.
            </p>
          </div>
        ) : null}

        {step === "report" && summary ? (
          <div className="space-y-3 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
              {summary.cancelled ? (
                <p className="text-amber-700 dark:text-amber-400">Importação cancelada pelo usuário.</p>
              ) : null}
              <p>
                <span className="font-medium text-foreground">{summary.created}</span> criado(s)
                {" · "}
                <span className="font-medium text-foreground">{summary.updated}</span> atualizado(s)
              </p>
              {summary.failed.length > 0 ? (
                <p>
                  <span className="font-medium text-destructive">{summary.failed.length}</span>{" "}
                  falha(s).
                </p>
              ) : null}
              {summary.skipped.length > 0 ? (
                <p className="text-muted-foreground">
                  {summary.skipped.length} linha(s) pulada(s) no parse.
                </p>
              ) : null}
            </div>

            {failPreview.length > 0 ? (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Falhas</p>
                <ul className="max-h-32 overflow-y-auto rounded-md border border-destructive/30 px-3 py-2 text-xs space-y-1">
                  {failPreview.map((f, i) => (
                    <li key={`${f.line}-${i}`}>
                      L{f.line}
                      {f.name ? ` (${f.name})` : ""}: {f.message}
                    </li>
                  ))}
                  {summary.failed.length > failPreview.length ? (
                    <li className="text-muted-foreground">
                      … e mais {summary.failed.length - failPreview.length}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "choose" ? (
            <>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="button" disabled={!canContinue} onClick={() => void handleContinue()}>
                {reading ? "Analisando…" : "Continuar"}
              </Button>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("choose")}>
                Voltar
              </Button>
              <Button
                type="button"
                disabled={prepared.length === 0 || busy}
                onClick={() => void handleImport()}
              >
                Importar {prepared.length > 0 ? prepared.length : ""} produto
                {prepared.length === 1 ? "" : "s"}
              </Button>
            </>
          ) : null}

          {step === "importing" ? (
            <Button type="button" variant="outline" onClick={handleCancelImport}>
              Cancelar importação
            </Button>
          ) : null}

          {step === "report" ? (
            <Button type="button" onClick={() => handleOpenChange(false)}>
              Fechar
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function normalizeSkuPreview(sku?: string): boolean {
  return Boolean(sku?.trim());
}
