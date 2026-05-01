import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { contractsService } from "@/services/contracts";
import { clientsService } from "@/services/clients";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Search,
  MoreVertical,
  FileText,
  Download,
  Send,
  Copy,
  Trash2,
  Play,
  Square,
  XCircle,
  Calendar as CalendarIcon,
  Filter,
  Upload,
} from "lucide-react";
import type { Contract, ContractStatus, ContractFilters } from "@/types/contracts";
import { getContractDocumentHtml } from "@/utils/contractDocument";
import { canDeleteContractStatus } from "@/utils/contractStatusUi";
import { applyUrlPatch } from "@/lib/listFiltersUrl";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { prepareContractsFromCsv } from "@/utils/importContractsCsv";

const CONTRACT_STATUS_URL = new Set<ContractStatus | "all">([
  "all",
  "DRAFT",
  "PENDING_SIGNATURE",
  "PARTIALLY_SIGNED",
  "ACTIVE",
  "INACTIVE",
  "EXPIRED",
  "CANCELLED",
]);

function isoDayStart(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  return m ? m[1] : null;
}

function parseFiltersFromSearchParams(sp: URLSearchParams): ContractFilters {
  const st = sp.get("status") ?? "all";
  const status =
    st && CONTRACT_STATUS_URL.has(st as ContractStatus | "all") ? (st as ContractStatus | "all") : "all";
  const dateType = sp.get("dtype") === "validity" ? "validity" : "created";
  const from = sp.get("from");
  const to = sp.get("to");
  const startDate =
    from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T12:00:00`).toISOString() : null;
  const endDate = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T12:00:00`).toISOString() : null;
  return {
    status: status === "all" ? "all" : (status as ContractStatus),
    dateType,
    startDate,
    endDate,
    clientId: null,
    responsibleId: null,
    tags: [],
    search: sp.get("q") ?? "",
  };
}

function parseSortFromSearchParams(sp: URLSearchParams): {
  sortField: "updated_at" | "title" | "contract_number";
  sortDirection: "asc" | "desc";
} {
  const sf = sp.get("sf");
  const sortField =
    sf === "title" || sf === "contract_number" || sf === "updated_at" ? sf : "updated_at";
  const sd = sp.get("sd") === "asc" ? "asc" : "desc";
  return { sortField, sortDirection: sd };
}

const Contracts = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { canDeleteRecord, canCreate, loading: contractsPermLoading } = useModulePermissions();
  const canCreateContractShortcut = canCreate("contracts") && !contractsPermLoading;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<ContractFilters>(() => parseFiltersFromSearchParams(searchParams));
  const [sortField, setSortField] = useState<"updated_at" | "title" | "contract_number">(
    () => parseSortFromSearchParams(searchParams).sortField,
  );
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(
    () => parseSortFromSearchParams(searchParams).sortDirection,
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const contractsCsvInputRef = useRef<HTMLInputElement>(null);
  const [contractsCsvImportRunning, setContractsCsvImportRunning] = useState(false);
  const [contractsCsvImportDialogOpen, setContractsCsvImportDialogOpen] = useState(false);
  const [contractsCsvImportSummary, setContractsCsvImportSummary] = useState<{
    created: number;
    activated: number;
    failed: { line: number; message: string }[];
    warnings: string[];
  } | null>(null);

  const loadContracts = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);

      const data = await contractsService.getContracts({
        status: filters.status !== "all" ? filters.status : undefined,
        clientId: filters.clientId || undefined,
        responsibleId: filters.responsibleId || undefined,
        startDate: filters.startDate || undefined,
        endDate: filters.endDate || undefined,
        search: filters.search || undefined,
        sortField: sortField,
        sortDirection: sortDirection,
      });

      setContracts(data);
    } catch (error) {
      console.error("Error loading contracts:", error);
      toast.error("Erro ao carregar contratos");
    } finally {
      setLoading(false);
    }
  }, [user, filters, sortField, sortDirection]);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const handleBulkAction = async (action: 'activate' | 'inactivate' | 'cancel' | 'duplicate') => {
    if (selectedIds.length === 0) {
      toast.error('Selecione pelo menos um contrato');
      return;
    }

    try {
      if (action === 'duplicate') {
        for (const id of selectedIds) {
          const original = contracts.find(c => c.id === id);
          if (original) {
            await contractsService.createContract({
              title: `${original.title} (Cópia)`,
              client_id: original.client_id || undefined,
              responsible_id: original.responsible_id || undefined,
              status: 'DRAFT',
              content: original.content || undefined,
              content_html: getContractDocumentHtml(original) || undefined,
              tags: original.tags,
            });
          }
        }
        toast.success('Contratos duplicados com sucesso');
      } else {
        const statusMap = {
          activate: 'ACTIVE',
          inactivate: 'INACTIVE',
          cancel: 'CANCELLED',
        };

        for (const id of selectedIds) {
          await contractsService.updateContract(id, {
            status: statusMap[action] as ContractStatus,
          });
        }
        toast.success('Contratos atualizados com sucesso');
      }

      setSelectedIds([]);
      loadContracts();
    } catch (error) {
      console.error('Error in bulk action:', error);
      toast.error('Erro ao executar ação em massa');
    }
  };

  const getStatusBadge = (status: ContractStatus) => {
    const variants: Record<ContractStatus, { color: string; label: string }> = {
      DRAFT: {
        color: "border-gray-300/70 bg-gray-500/10 text-gray-800 dark:border-gray-700/60 dark:bg-gray-900/40 dark:text-gray-100",
        label: "Rascunho",
      },
      PENDING_SIGNATURE: {
        color: "border-amber-400/70 bg-amber-500/15 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
        label: "Pendente",
      },
      PARTIALLY_SIGNED: {
        color: "border-blue-400/70 bg-blue-500/15 text-blue-900 dark:border-blue-700/60 dark:bg-blue-950/40 dark:text-blue-100",
        label: "Parcial",
      },
      ACTIVE: {
        color: "border-emerald-400/70 bg-emerald-500/15 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100",
        label: "Ativo",
      },
      INACTIVE: {
        color: "border-zinc-300/70 bg-zinc-500/10 text-zinc-800 dark:border-zinc-700/60 dark:bg-zinc-900/40 dark:text-zinc-100",
        label: "Inativo",
      },
      EXPIRED: {
        color: "border-rose-400/70 bg-rose-500/15 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-100",
        label: "Expirado",
      },
      CANCELLED: {
        color: "border-rose-500/70 bg-rose-500/20 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/45 dark:text-rose-100",
        label: "Cancelado",
      },
    };

    const { color, label } = variants[status];
    return (
      <Badge variant="outline" className={color}>
        {label}
      </Badge>
    );
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const canDeleteContractInUi = (contract: Contract): boolean =>
    canDeleteContractStatus(contract.status) &&
    canDeleteRecord("contracts", contract.responsible_id || contract.user_id, user?.id);

  const handleDeleteContract = async (contract: Contract) => {
    if (!canDeleteContractInUi(contract)) return;
    if (!confirm(`Excluir definitivamente o contrato "${contract.title}"?`)) return;
    try {
      await contractsService.deleteContract(contract.id);
      toast.success("Contrato excluído com sucesso");
      await loadContracts();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao excluir contrato";
      toast.error(msg);
    }
  };

  useEffect(() => {
    const next = parseFiltersFromSearchParams(searchParams);
    const { sortField: sf, sortDirection: sd } = parseSortFromSearchParams(searchParams);
    setFilters((prev) => {
      const same =
        prev.status === next.status &&
        prev.dateType === next.dateType &&
        isoDayStart(prev.startDate) === isoDayStart(next.startDate) &&
        isoDayStart(prev.endDate) === isoDayStart(next.endDate) &&
        prev.search.trim() === next.search.trim() &&
        prev.clientId === next.clientId &&
        prev.responsibleId === next.responsibleId;
      return same ? prev : next;
    });
    setSortField((prev) => (prev !== sf ? sf : prev));
    setSortDirection((prev) => (prev !== sd ? sd : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setSearchParams(
      (prev) =>
        applyUrlPatch(prev, {
          q: filters.search.trim() || null,
          status: filters.status !== "all" ? filters.status : null,
          dtype: filters.dateType !== "created" ? filters.dateType : null,
          from: isoDayStart(filters.startDate),
          to: isoDayStart(filters.endDate),
          sf: sortField !== "updated_at" ? sortField : null,
          sd: sortDirection !== "desc" ? sortDirection : null,
        }),
      { replace: true },
    );
  }, [filters, sortField, sortDirection, setSearchParams]);

  const toggleSelectAll = () => {
    if (selectedIds.length === contracts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contracts.map(c => c.id));
    }
  };

  const handleContractsCsvChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !canCreateContractShortcut) return;

    setContractsCsvImportRunning(true);
    try {
      const text = await file.text();
      const clients = await clientsService.getClients();
      const { prepared, skipped } = prepareContractsFromCsv(text, clients);
      const failed: { line: number; message: string }[] = skipped.map((s) => ({
        line: s.line,
        message: s.reason,
      }));
      const warnings: string[] = [];
      let created = 0;
      let activated = 0;
      const BATCH = 3;

      for (let i = 0; i < prepared.length; i += BATCH) {
        const chunk = prepared.slice(i, i + BATCH);
        await Promise.all(
          chunk.map(async (row) => {
            try {
              if (row.warn) warnings.push(`Linha ${row.lineNumber}: ${row.warn}`);
              const result = await contractsService.createContract(row.createPayload);
              created++;
              const id = result?.id;
              if (row.activateAfterCreate && id) {
                try {
                  await contractsService.updateContract(id, { status: "ACTIVE" });
                  activated++;
                } catch (errAct) {
                  failed.push({
                    line: row.lineNumber,
                    message:
                      errAct instanceof Error
                        ? `Criado, mas falhou ao ativar: ${errAct.message}`
                        : "Criado, mas falhou ao marcar como ativo.",
                  });
                }
              }
            } catch (err) {
              failed.push({
                line: row.lineNumber,
                message: err instanceof Error ? err.message : "Erro ao criar contrato",
              });
            }
          }),
        );
      }

      await loadContracts();
      setContractsCsvImportSummary({ created, activated, failed, warnings });
      if (failed.length > 0 || warnings.length > 0 || created === 0) {
        setContractsCsvImportDialogOpen(true);
      }

      if (created > 0 && failed.length === 0) {
        toast.success(
          `${created} contrato(s) importado(s)` +
            (activated > 0 ? ` (${activated} como ativo).` : "."),
        );
      } else if (created > 0) {
        toast.warning(`${created} criado(s); algumas linhas falharam — ver relatório.`);
      } else if (skipped.length > 0 || failed.length > 0) {
        toast.error("Nenhum contrato criado ou arquivo inválido.");
      } else {
        toast.message("Nenhuma linha válida para importar.");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Falha ao ler o CSV.");
    } finally {
      setContractsCsvImportRunning(false);
    }
  };

  const filtersDirty =
    filters.status !== "all" ||
    filters.startDate != null ||
    filters.endDate != null ||
    filters.search.trim() !== "";

  return (
    <div className="space-y-6">
      <input
        ref={contractsCsvInputRef}
        type="file"
        accept=".csv,text/csv,.txt"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={handleContractsCsvChange}
      />
      <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden">
          <SheetHeader className="text-left">
            <SheetTitle>Filtros</SheetTitle>
            <SheetDescription>Status, período e depois aplicar à lista.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-4 px-1 pb-4">
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value as ContractStatus | "all" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="DRAFT">Rascunho</SelectItem>
                <SelectItem value="PENDING_SIGNATURE">Pendente</SelectItem>
                <SelectItem value="PARTIALLY_SIGNED">Parcial</SelectItem>
                <SelectItem value="ACTIVE">Ativo</SelectItem>
                <SelectItem value="INACTIVE">Inativo</SelectItem>
                <SelectItem value="EXPIRED">Expirado</SelectItem>
                <SelectItem value="CANCELLED">Cancelado</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.dateType}
              onValueChange={(value) => setFilters({ ...filters, dateType: value as "created" | "validity" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Data de Criação</SelectItem>
                <SelectItem value="validity">Período de Vigência</SelectItem>
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.startDate ? format(new Date(filters.startDate), "P", { locale: ptBR }) : "Data Início"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.startDate ? new Date(filters.startDate) : undefined}
                  onSelect={(date) => setFilters({ ...filters, startDate: date ? date.toISOString() : null })}
                />
              </PopoverContent>
            </Popover>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {filters.endDate ? format(new Date(filters.endDate), "P", { locale: ptBR }) : "Data Fim"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={filters.endDate ? new Date(filters.endDate) : undefined}
                  onSelect={(date) => setFilters({ ...filters, endDate: date ? date.toISOString() : null })}
                />
              </PopoverContent>
            </Popover>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setFilters({
                  status: "all",
                  dateType: "created",
                  startDate: null,
                  endDate: null,
                  clientId: null,
                  responsibleId: null,
                  tags: [],
                  search: "",
                })
              }
            >
              Limpar filtros
            </Button>
            <SheetClose asChild>
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  void loadContracts();
                }}
              >
                Aplicar e fechar
              </Button>
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Contratos"
          secondaryActions={[
            {
              icon: (
                <span className="relative inline-flex">
                  <Filter className="h-4 w-4" aria-hidden />
                  {filtersDirty ? (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
                  ) : null}
                </span>
              ),
              ariaLabel: "Filtros",
              onClick: () => setFilterSheetOpen(true),
            },
            {
              icon: <FileText className="h-4 w-4" aria-hidden />,
              ariaLabel: "Modelos de contrato",
              onClick: () => navigate("/contracts/templates"),
            },
          ]}
          secondarySlot={
            canCreateContractShortcut ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 touch-manipulation text-muted-foreground hover:text-foreground"
                disabled={contractsCsvImportRunning}
                aria-label="Importar contratos (CSV)"
                onClick={() => contractsCsvInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
              </Button>
            ) : null
          }
          primaryAction={{
            label: "Novo contrato",
            icon: <Plus className="h-4 w-4" aria-hidden />,
            onClick: () => navigate("/contracts/new"),
            disabled: !canCreateContractShortcut,
          }}
        />
      </div>

      <div className="hidden md:flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Contratos</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/contracts/templates")}>
            <FileText className="mr-2 h-4 w-4" />
            Modelos
          </Button>
          {canCreateContractShortcut ? (
            <Button
              type="button"
              variant="outline"
              disabled={contractsCsvImportRunning}
              onClick={() => contractsCsvInputRef.current?.click()}
              className="gap-2"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Importar
            </Button>
          ) : null}
          <Button disabled={!canCreateContractShortcut} onClick={() => navigate("/contracts/new")}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Contrato
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap">
        {canCreateContractShortcut ? (
          <Button type="button" size="sm" variant="secondary" className="shrink-0 rounded-full" onClick={() => navigate("/contracts/new")}>
            Novo contrato
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={filters.status === "PENDING_SIGNATURE" ? "default" : "outline"}
          className="shrink-0 rounded-full"
          onClick={() => setFilters((f) => ({ ...f, status: "PENDING_SIGNATURE" }))}
        >
          Aguardando assinatura
        </Button>
        <Button
          type="button"
          size="sm"
          variant={filters.status === "EXPIRED" ? "default" : "outline"}
          className="shrink-0 rounded-full"
          onClick={() => setFilters((f) => ({ ...f, status: "EXPIRED" }))}
        >
          Ver vencidos
        </Button>
        <Button type="button" size="sm" variant="outline" className="shrink-0 rounded-full" onClick={() => navigate("/contracts/templates")}>
          Templates
        </Button>
      </div>

      {/* Filters — desktop */}
      <div className="hidden space-y-4 rounded-lg border bg-card p-4 md:block">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filtros</span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            value={filters.status}
            onValueChange={(value) => setFilters({ ...filters, status: value as ContractStatus | 'all' })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="DRAFT">Rascunho</SelectItem>
              <SelectItem value="PENDING_SIGNATURE">Pendente</SelectItem>
              <SelectItem value="PARTIALLY_SIGNED">Parcial</SelectItem>
              <SelectItem value="ACTIVE">Ativo</SelectItem>
              <SelectItem value="INACTIVE">Inativo</SelectItem>
              <SelectItem value="EXPIRED">Expirado</SelectItem>
              <SelectItem value="CANCELLED">Cancelado</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.dateType}
            onValueChange={(value) => setFilters({ ...filters, dateType: value as 'created' | 'validity' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created">Data de Criação</SelectItem>
              <SelectItem value="validity">Período de Vigência</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.startDate ? format(new Date(filters.startDate), 'P', { locale: ptBR }) : 'Data Início'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.startDate ? new Date(filters.startDate) : undefined}
                onSelect={(date) => setFilters({ ...filters, startDate: date ? date.toISOString() : null })}
              />
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.endDate ? format(new Date(filters.endDate), 'P', { locale: ptBR }) : 'Data Fim'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.endDate ? new Date(filters.endDate) : undefined}
                onSelect={(date) => setFilters({ ...filters, endDate: date ? date.toISOString() : null })}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadContracts}>
            Aplicar Filtros
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setFilters({
              status: 'all',
              dateType: 'created',
              startDate: null,
              endDate: null,
              clientId: null,
              responsibleId: null,
              tags: [],
              search: '',
            })}
          >
            Limpar
          </Button>
        </div>
      </div>

      {/* Search and Bulk Actions */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
        <div className="relative w-full md:max-w-md md:flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título, número ou cliente..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && loadContracts()}
            className="pl-10"
          />
        </div>

        {selectedIds.length > 0 && (
          <div className="hidden flex-wrap gap-2 md:flex">
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('activate')}>
              <Play className="mr-2 h-4 w-4" />
              Ativar ({selectedIds.length})
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('inactivate')}>
              <Square className="mr-2 h-4 w-4" />
              Inativar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('cancel')}>
              <XCircle className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkAction('duplicate')}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
          </div>
        )}
      </div>

      {/* Table — desktop */}
      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedIds.length === contracts.length && contracts.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('contract_number')}
              >
                Nº Contrato {sortField === 'contract_number' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('title')}
              >
                Título {sortField === 'title' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Início</TableHead>
              <TableHead>Fim</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('updated_at')}
              >
                Atualizado {sortField === 'updated_at' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="w-12">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="text-muted-foreground">
                    Nenhum contrato encontrado.
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow
                  key={contract.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(contract.id)}
                      onClick={(e) => e.stopPropagation()}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedIds([...selectedIds, contract.id]);
                        } else {
                          setSelectedIds(selectedIds.filter(id => id !== contract.id));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="font-mono">{contract.contract_number}</TableCell>
                  <TableCell className="font-medium">{contract.title}</TableCell>
                  <TableCell className="max-w-[220px] truncate" title={contract.client_name || "—"}>
                    {contract.client_name || "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate" title={contract.responsible_display_name || contract.creator_display_name || "—"}>
                    {contract.responsible_display_name || contract.creator_display_name || "—"}
                  </TableCell>
                  <TableCell>{getStatusBadge(contract.status)}</TableCell>
                  <TableCell>
                    {contract.start_date ? format(new Date(contract.start_date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {contract.end_date ? format(new Date(contract.end_date), 'dd/MM/yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {format(new Date(contract.updated_at), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`)}>
                          <FileText className="mr-2 h-4 w-4" />
                          Ver/Editar
                        </DropdownMenuItem>
                        {contract.status === 'DRAFT' && (
                          <DropdownMenuItem
                            onClick={() => navigate(`/contracts/${contract.id}/edit`)}
                          >
                            <Send className="mr-2 h-4 w-4" />
                            Editar e enviar para assinatura
                          </DropdownMenuItem>
                        )}
                        {String(contract.content_snapshot_html || "").trim() && (
                          <DropdownMenuItem
                            onClick={() => void contractsService.downloadContractPdf(contract.id)}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Baixar PDF
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={async () => {
                            try {
                              const nc = await contractsService.createContract({
                                title: `${contract.title} (Cópia)`,
                                client_id: contract.client_id || undefined,
                                responsible_id: contract.responsible_id || undefined,
                                template_id: contract.template_id || undefined,
                                status: 'DRAFT',
                                content: contract.content || undefined,
                                content_html: getContractDocumentHtml(contract) || undefined,
                                tags: contract.tags,
                                variables: contract.variables,
                              });
                              toast.success('Contrato duplicado');
                              navigate(`/contracts/${nc.id}`, {
                                state: nc.public_view?.token
                                  ? { publicView: { token: nc.public_view.token } }
                                  : undefined,
                              });
                              loadContracts();
                            } catch (e) {
                              console.error(e);
                              toast.error('Erro ao duplicar contrato');
                            }
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicar
                        </DropdownMenuItem>
                        {canDeleteContractInUi(contract) && (
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => void handleDeleteContract(contract)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir contrato
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {loading ? (
          <div className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
            <FileText className="h-7 w-7 text-muted-foreground/80" aria-hidden />
            <p className="text-sm font-medium text-foreground">Carregando contratos</p>
            <p className="text-xs text-muted-foreground">Aguarde um instante.</p>
          </div>
        ) : contracts.length === 0 ? (
          <div className="flex min-h-[11rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
            <FileText className="h-7 w-7 text-muted-foreground/80" aria-hidden />
            <p className="text-sm font-medium text-foreground">Nenhum contrato encontrado</p>
            <p className="text-xs text-muted-foreground">Revise os filtros ou crie um novo contrato.</p>
          </div>
        ) : (
          contracts.map((contract) => (
            <div
              key={`m-${contract.id}`}
              className="min-h-[9.5rem] rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <button
                type="button"
                onClick={() => navigate(`/contracts/${contract.id}`)}
                className="w-full text-left"
              >
                <p className="font-mono text-xs text-muted-foreground">{contract.contract_number}</p>
                <p className="mt-1 font-semibold leading-snug">{contract.title}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {contract.client_name || "—"}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  {getStatusBadge(contract.status)}
                  {contract.total_value != null && contract.total_value > 0 ? (
                    <span className="text-sm font-semibold tabular-nums">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: contract.currency || "BRL" }).format(
                        contract.total_value,
                      )}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Início {contract.start_date ? format(new Date(contract.start_date), "dd/MM/yyyy") : "—"}</span>
                  <span>Fim {contract.end_date ? format(new Date(contract.end_date), "dd/MM/yyyy") : "—"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Atual. {format(new Date(contract.updated_at), "dd/MM/yyyy HH:mm")}
                </p>
              </button>
              <div className="mt-3 flex justify-end border-t border-border/60 pt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1 px-3">
                      Ações
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}`)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Ver / editar
                    </DropdownMenuItem>
                    {contract.status === "DRAFT" && (
                      <DropdownMenuItem onClick={() => navigate(`/contracts/${contract.id}/edit`)}>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar assinatura
                      </DropdownMenuItem>
                    )}
                    {String(contract.content_snapshot_html || "").trim() && (
                      <DropdownMenuItem onClick={() => void contractsService.downloadContractPdf(contract.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        PDF
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={async () => {
                        try {
                          const nc = await contractsService.createContract({
                            title: `${contract.title} (Cópia)`,
                            client_id: contract.client_id || undefined,
                            responsible_id: contract.responsible_id || undefined,
                            template_id: contract.template_id || undefined,
                            status: "DRAFT",
                            content: contract.content || undefined,
                            content_html: getContractDocumentHtml(contract) || undefined,
                            tags: contract.tags,
                            variables: contract.variables,
                          });
                          toast.success("Contrato duplicado");
                          navigate(`/contracts/${nc.id}`, {
                            state: nc.public_view?.token
                              ? { publicView: { token: nc.public_view.token } }
                              : undefined,
                          });
                          loadContracts();
                        } catch (e) {
                          console.error(e);
                          toast.error("Erro ao duplicar contrato");
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicar
                    </DropdownMenuItem>
                    {canDeleteContractInUi(contract) && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void handleDeleteContract(contract)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Excluir
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))
        )}
      </div>

      <Dialog open={contractsCsvImportDialogOpen} onOpenChange={setContractsCsvImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importação de contratos (CSV)</DialogTitle>
            <DialogDescription>Resumo do ficheiro enviado.</DialogDescription>
          </DialogHeader>
          {contractsCsvImportSummary ? (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">{contractsCsvImportSummary.created}</span> contrato(s)
                criado(s).
                {contractsCsvImportSummary.activated > 0 ? (
                  <>
                    {" "}
                    <span className="font-medium text-foreground">{contractsCsvImportSummary.activated}</span> marcado(s)
                    como <strong>Ativo</strong> (coluna Assinatura = assinado).
                  </>
                ) : null}
              </p>
              {contractsCsvImportSummary.warnings.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">Avisos</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {contractsCsvImportSummary.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {contractsCsvImportSummary.failed.length > 0 ? (
                <ScrollArea className="h-[200px] rounded-md border p-3">
                  <ul className="space-y-1.5 text-xs">
                    {contractsCsvImportSummary.failed.map((f, i) => (
                      <li key={`${f.line}-${i}`}>
                        Linha {f.line}: {f.message}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setContractsCsvImportDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contracts;
