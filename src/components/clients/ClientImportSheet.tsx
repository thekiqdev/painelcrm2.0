import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  activeImportSheet,
  buildClientImportPlan,
  CLIENT_IMPORT_FIELD_OPTIONS,
  suggestColumns,
  type ClientImportColumnMapping,
  type ClientImportField,
  type ClientImportFile,
} from "@/utils/importClientsCsv";

type ClientImportGroup = { id: string; name: string };

type ClientImportSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: ClientImportFile[];
  sessionKey: number;
  groups: ClientImportGroup[];
  running: boolean;
  onActiveSheetChange: (fileId: string, sheetName: string) => void;
  onConfirm: (mappings: ClientImportColumnMapping[]) => void;
};

function sampleValue(file: ClientImportFile, columnIndex: number, sheetName: string): string {
  const sheet = file.sheets.find((item) => item.name === sheetName);
  const value = sheet?.rows.find((row) => (row[columnIndex] ?? "").trim())?.[columnIndex] ?? "";
  const trimmed = value.trim();
  if (trimmed.length <= 42) return trimmed;
  return `${trimmed.slice(0, 42).trimEnd()}…`;
}

export function ClientImportSheet({
  open,
  onOpenChange,
  files,
  sessionKey,
  groups,
  running,
  onActiveSheetChange,
  onConfirm,
}: ClientImportSheetProps) {
  const [mappings, setMappings] = useState<ClientImportColumnMapping[]>([]);

  useEffect(() => {
    if (!sessionKey) return;
    setMappings(files.flatMap((file) => suggestColumns(file)));
    // sessionKey marca uma nova seleção de arquivos; a sugestão usa esses arquivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const plan = useMemo(
    () => buildClientImportPlan(files, mappings, groups),
    [files, mappings, groups],
  );

  const withAddress = plan.prepared.filter((row) => row.address).length;

  const handleSheetChange = (fileId: string, sheetName: string) => {
    onActiveSheetChange(fileId, sheetName);
    const changed = files.find((file) => file.id === fileId);
    if (!changed) return;
    const nextFile = { ...changed, activeSheet: sheetName };
    setMappings((current) => [
      ...current.filter((mapping) => mapping.fileId !== fileId),
      ...suggestColumns(nextFile),
    ]);
  };

  const setField = (mapping: ClientImportColumnMapping, field: ClientImportField) => {
    setMappings((current) =>
      current.map((item) =>
        item.fileId === mapping.fileId &&
        item.sheetName === mapping.sheetName &&
        item.columnIndex === mapping.columnIndex
          ? { ...item, field }
          : item,
      ),
    );
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!running) onOpenChange(next); }}>
      <SheetContent side="right" className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="space-y-1 border-b px-6 py-4 pr-12 text-left">
          <SheetTitle>Mesclar campos</SheetTitle>
          <SheetDescription>
            Cada coluna aponta para um campo do cliente. Colunas com o mesmo nome já vêm no mesmo destino. Altere antes de importar.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4">
          {files.map((file) => {
            const sheet = activeImportSheet(file);
            const columns = mappings.filter(
              (mapping) => mapping.fileId === file.id && mapping.sheetName === (sheet?.name ?? file.activeSheet),
            );
            const phoneColumns = columns.filter((column) => column.field === "phone");
            const hasCpf = columns.some((column) => column.field === "cpf");
            const hasCnpj = columns.some((column) => column.field === "cnpj");
            return (
              <section key={file.id} className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">{file.fileName}</h3>
                  <p className="text-xs text-muted-foreground">
                    {sheet?.rows.length ?? 0} linha(s)
                    {sheet?.truncated ? " · primeiras 5000 linhas" : ""}
                  </p>
                </div>
                {file.sheets.length > 1 ? (
                  <div className="space-y-1.5">
                    <Label>Aba</Label>
                    <Select value={file.activeSheet} onValueChange={(value) => handleSheetChange(file.id, value)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {file.sheets.map((item) => (
                          <SelectItem key={item.name} value={item.name}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                {phoneColumns.length > 1 ? (
                  <p className="text-xs text-muted-foreground">
                    {phoneColumns.map((column) => column.header).join(" e ")} entram em Telefone. Celular prevalece quando estiver preenchido. Mude o destino de uma coluna para usar a outra.
                  </p>
                ) : null}
                {hasCpf && hasCnpj ? (
                  <p className="text-xs text-muted-foreground">
                    CPF e CNPJ ficam separados. Se os dois vierem preenchidos, a cobrança fica no CPF.
                  </p>
                ) : null}
                <div className="space-y-2">
                  {columns.map((column) => {
                    const sample = sheet ? sampleValue(file, column.columnIndex, column.sheetName) : "";
                    return (
                      <div
                        key={`${column.fileId}-${column.sheetName}-${column.columnIndex}`}
                        className="grid grid-cols-1 items-center gap-2 rounded-md border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_190px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{column.header}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {sample || "Sem exemplo nesta coluna"}
                          </p>
                        </div>
                        <Select
                          value={column.field}
                          onValueChange={(value) => setField(column, value as ClientImportField)}
                        >
                          <SelectTrigger className="h-9" aria-label={`Destino de ${column.header}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CLIENT_IMPORT_FIELD_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Prévia</h3>
            {plan.prepared.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma linha com nome ou empresa.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {plan.prepared.slice(0, 3).map((row) => (
                  <li key={`${row.sourceLabel}-${row.lineNumber}-${row.payload.name}`} className="truncate text-muted-foreground">
                    <span className="text-foreground">{row.payload.name}</span>
                    {row.payload.phone ? ` · ${row.payload.phone}` : ""}
                    {row.address?.city ? ` · ${row.address.city}` : ""}
                  </li>
                ))}
              </ul>
            )}
            {plan.skipped.length > 0 ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {plan.skipped.slice(0, 4).map((skip) => (
                  <li key={`${skip.line}-${skip.reason}`}>{skip.reason}</li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <SheetFooter className="flex-col gap-3 border-t px-6 py-4 sm:flex-col sm:space-x-0">
          <p className="text-sm text-muted-foreground">
            {plan.prepared.length} cliente(s)
            {withAddress > 0 ? ` · ${withAddress} com endereço` : ""}
            {files.length > 1 ? " · arquivos unidos pelo código externo" : ""}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" disabled={running} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={running || plan.prepared.length === 0}
              onClick={() => onConfirm(mappings)}
            >
              {running ? "Importando…" : `Importar ${plan.prepared.length}`}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
