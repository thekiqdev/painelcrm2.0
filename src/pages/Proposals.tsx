import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Loader2, Trash2, Eye, Pencil, ExternalLink, Search, X, Filter } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { proposalsService, type Proposal } from "@/services/proposals";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { formatDateOnlyPtBr } from "@/utils/formatCalendarDate";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import { getStoredProposalPublicUrl } from "@/utils/proposalPublicLinkSession";
import { applyUrlPatch } from "@/lib/listFiltersUrl";

const STATUS_LABELS: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
  invoiced: "Faturada",
};

const STATUS_CLASS: Record<Proposal["status"], string> = {
  draft: "bg-gray-100 text-gray-800",
  sent: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-red-100 text-red-800",
  invoiced: "bg-blue-100 text-blue-800",
};

function proposalCode(id: string): string {
  return `PROP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function tryOpenStoredPublicProposal(proposalId: string): void {
  const u = getStoredProposalPublicUrl(proposalId);
  if (u) {
    window.open(u, "_blank", "noopener,noreferrer");
    return;
  }
  toast.message("Link público indisponível neste navegador", {
    description:
      "Abra o detalhe da proposta, marque como enviada se necessário e gere o link na aba Faturamento. A URL fica guardada nesta sessão após gerar ou copiar.",
  });
}

function parseOwnerFromUrl(raw: string | null): string {
  if (!raw || raw === "all") return "__all__";
  if (raw === "mine") return "__mine__";
  return raw;
}

function parseValidityFromUrl(raw: string | null): string {
  if (raw === "valid" || raw === "expired") return raw;
  return "__all__";
}

function parseConversionFromUrl(raw: string | null): string {
  if (raw === "yes" || raw === "no") return raw;
  return "__all__";
}

const Proposals = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { canCreate, canEditRecord, canDeleteRecord, loading: permLoading } = useModulePermissions();
  const [list, setList] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(() => searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(() => {
    const s = searchParams.get("status");
    if (!s) return "__all__";
    return (Object.keys(STATUS_LABELS) as Proposal["status"][]).includes(s as Proposal["status"])
      ? s
      : "__all__";
  });
  const [clientFilterId, setClientFilterId] = useState<string | null>(() => searchParams.get("client"));
  const [ownerFilter, setOwnerFilter] = useState(() => parseOwnerFromUrl(searchParams.get("owner")));
  const [validityFilter, setValidityFilter] = useState(() => parseValidityFromUrl(searchParams.get("val")));
  const [conversionFilter, setConversionFilter] = useState(() =>
    parseConversionFromUrl(searchParams.get("conv")),
  );
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const q = searchParams.get("q") ?? "";
    const st = searchParams.get("status");
    const nextStatus =
      st && (Object.keys(STATUS_LABELS) as Proposal["status"][]).includes(st as Proposal["status"])
        ? st
        : "__all__";
    const client = searchParams.get("client");
    const owner = parseOwnerFromUrl(searchParams.get("owner"));
    const val = parseValidityFromUrl(searchParams.get("val"));
    const conv = parseConversionFromUrl(searchParams.get("conv"));

    setSearchInput((prev) => (prev !== q ? q : prev));
    setDebouncedQ((prev) => (prev !== q ? q : prev));
    setStatusFilter((prev) => (prev !== nextStatus ? nextStatus : prev));
    setClientFilterId((prev) => (prev !== (client || null) ? client || null : prev));
    setOwnerFilter((prev) => (prev !== owner ? owner : prev));
    setValidityFilter((prev) => (prev !== val ? val : prev));
    setConversionFilter((prev) => (prev !== conv ? conv : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const ownerParam =
      ownerFilter === "__all__" ? null : ownerFilter === "__mine__" ? "mine" : ownerFilter;
    const valParam =
      validityFilter === "__all__" ? null : validityFilter === "valid" ? "valid" : validityFilter === "expired" ? "expired" : null;
    const convParam =
      conversionFilter === "__all__" ? null : conversionFilter === "yes" ? "yes" : conversionFilter === "no" ? "no" : null;

    setSearchParams(
      (prev) =>
        applyUrlPatch(prev, {
          q: debouncedQ.trim() || null,
          status: statusFilter !== "__all__" ? statusFilter : null,
          client: clientFilterId || null,
          owner: ownerParam,
          val: valParam,
          conv: convParam,
        }),
      { replace: true },
    );
  }, [
    debouncedQ,
    statusFilter,
    clientFilterId,
    ownerFilter,
    validityFilter,
    conversionFilter,
    setSearchParams,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const users = await getMyTenantUsers();
        if (!cancelled) setTenantUsers(users);
      } catch {
        if (!cancelled) setTenantUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const listFilters = useMemo(() => {
    const f: Parameters<typeof proposalsService.getProposals>[0] = {};
    if (statusFilter !== "__all__") f.status = statusFilter;
    if (clientFilterId) f.client_id = clientFilterId;
    if (debouncedQ) f.q = debouncedQ;
    if (validityFilter === "valid") f.validity = "valid";
    if (validityFilter === "expired") f.validity = "expired";
    if (conversionFilter === "yes") f.conversion = "yes";
    if (conversionFilter === "no") f.conversion = "no";
    if (ownerFilter === "__mine__" && user?.id) f.owner_user_id = user.id;
    else if (ownerFilter !== "__all__" && ownerFilter !== "__mine__") f.owner_user_id = ownerFilter;
    return f;
  }, [
    statusFilter,
    clientFilterId,
    debouncedQ,
    validityFilter,
    conversionFilter,
    ownerFilter,
    user?.id,
  ]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await proposalsService.getProposals(listFilters);
      setList(data);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar propostas");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [listFilters]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleDelete = async (p: Proposal) => {
    if (!user?.id) return;
    if (!canDeleteRecord("proposals", p.user_id, user.id)) {
      toast.error("Sem permissão para excluir esta proposta");
      return;
    }
    if (!window.confirm(`Excluir a proposta "${p.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await proposalsService.deleteProposal(p.id);
      toast.success("Proposta excluída");
      await loadList();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const clearFilters = () => {
    setSearchInput("");
    setDebouncedQ("");
    setStatusFilter("__all__");
    setClientFilterId(null);
    setOwnerFilter("__all__");
    setValidityFilter("__all__");
    setConversionFilter("__all__");
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const canCreateProposal = canCreate("proposals") && !permLoading;

  const hasActiveFilters =
    searchInput.trim() !== "" ||
    statusFilter !== "__all__" ||
    clientFilterId !== null ||
    ownerFilter !== "__all__" ||
    validityFilter !== "__all__" ||
    conversionFilter !== "__all__";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Propostas / Orçamentos</h1>
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="gap-1 md:hidden">
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters ? <span className="ml-1 h-2 w-2 rounded-full bg-primary" aria-hidden /> : null}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden">
              <SheetHeader className="text-left">
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription>Busca e critérios da lista.</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 px-1 pb-6">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Buscar</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Título ou descrição..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      {(Object.keys(STATUS_LABELS) as Proposal["status"][]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Cliente</Label>
                  <ClientSearchCombobox
                    id="proposals-sheet-client"
                    label=""
                    value={clientFilterId}
                    onChange={setClientFilterId}
                    remoteSearch
                    placeholderTrigger="Qualquer cliente"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Responsável</Label>
                  <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todos</SelectItem>
                      <SelectItem value="__mine__">Minhas propostas</SelectItem>
                      {tenantUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.full_name?.trim() || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Validade</Label>
                  <Select value={validityFilter} onValueChange={setValidityFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="valid">Dentro do prazo / sem data</SelectItem>
                      <SelectItem value="expired">Vencidas (por data)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Faturamento</Label>
                  <Select value={conversionFilter} onValueChange={setConversionFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      <SelectItem value="yes">Com fatura</SelectItem>
                      <SelectItem value="no">Sem fatura</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {hasActiveFilters && (
                  <Button type="button" variant="ghost" className="w-full" onClick={clearFilters}>
                    <X className="mr-2 h-4 w-4" />
                    Limpar filtros
                  </Button>
                )}
                <SheetClose asChild>
                  <Button type="button" className="w-full">
                    Concluir
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate("/proposals/templates")}>
            <FileText className="mr-2 h-4 w-4" />
            Modelos
          </Button>
          <Button disabled={!canCreateProposal} asChild>
            <Link to="/proposals/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova proposta
            </Link>
          </Button>
        </div>
      </div>

      <div className="hidden space-y-3 rounded-lg border bg-card p-4 md:block">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Título ou descrição..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Buscar propostas"
              />
            </div>
          </div>
          <div className="w-full sm:w-[160px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Filtrar por status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                {(Object.keys(STATUS_LABELS) as Proposal["status"][]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cliente</Label>
            <ClientSearchCombobox
              id="proposals-list-client"
              label=""
              value={clientFilterId}
              onChange={setClientFilterId}
              remoteSearch
              placeholderTrigger="Qualquer cliente"
              className="w-full"
            />
          </div>
          <div className="w-full sm:w-[200px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Responsável</Label>
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger aria-label="Filtrar por responsável">
                <SelectValue placeholder="Responsável" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="__mine__">Minhas propostas</SelectItem>
                {tenantUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name?.trim() || u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[170px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Validade</Label>
            <Select value={validityFilter} onValueChange={setValidityFilter}>
              <SelectTrigger aria-label="Filtrar por validade">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="valid">Dentro do prazo / sem data</SelectItem>
                <SelectItem value="expired">Vencidas (por data)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-[180px] space-y-1.5">
            <Label className="text-xs text-muted-foreground">Faturamento</Label>
            <Select value={conversionFilter} onValueChange={setConversionFilter}>
              <SelectTrigger aria-label="Filtrar por fatura vinculada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                <SelectItem value="yes">Com fatura</SelectItem>
                <SelectItem value="no">Sem fatura</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin" />
          <p className="text-sm font-medium text-foreground">Carregando propostas</p>
          <p className="text-xs text-muted-foreground">Estamos preparando sua lista.</p>
        </div>
      ) : list.length === 0 ? (
        <div className="flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-card/50 px-4 py-8 text-center">
          <FileText className="h-7 w-7 text-muted-foreground/80" aria-hidden />
          <p className="text-sm font-medium text-foreground">Nenhuma proposta com estes filtros</p>
          <p className="text-xs text-muted-foreground">Ajuste os filtros ou crie uma nova proposta.</p>
        </div>
      ) : (
        <>
        <div className="hidden rounded-md border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[100px] whitespace-nowrap">Código</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="hidden lg:table-cell">Cliente</TableHead>
                <TableHead className="hidden xl:table-cell max-w-[180px]">Responsável</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="hidden md:table-cell whitespace-nowrap">Validade</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
                <TableHead className="hidden lg:table-cell whitespace-nowrap">Atualizado</TableHead>
                <TableHead className="w-[52px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => {
                const clientLabel = p.client_name?.trim() || (p.client_id ? "Cliente" : "—");
                const canEdit = user?.id ? canEditRecord("proposals", p.user_id, user.id) : false;
                const canDelete = user?.id ? canDeleteRecord("proposals", p.user_id, user.id) : false;
                const goDetail = () => navigate(`/proposals/${p.id}`);
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/60 active:bg-muted/80 transition-colors"
                    onClick={goDetail}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        goDetail();
                      }
                    }}
                    tabIndex={0}
                    role="link"
                    aria-label={`Abrir proposta ${p.title}`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {proposalCode(p.id)}
                    </TableCell>
                    <TableCell className="font-medium max-w-[220px] truncate">{p.title}</TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground max-w-[160px] truncate">
                      {clientLabel}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs text-muted-foreground truncate max-w-[180px]">
                      {p.responsible_email || "—"}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[p.status]}`}
                      >
                        {STATUS_LABELS[p.status]}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {p.valid_until ? formatDateOnlyPtBr(p.valid_until) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm font-medium">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {p.updated_at ? format(new Date(p.updated_at), "dd/MM/yyyy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Abrir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => tryOpenStoredPublicProposal(p.id)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Abrir proposta pública
                          </DropdownMenuItem>
                          {canEdit && (
                            <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar / status
                            </DropdownMenuItem>
                          )}
                          {canDelete && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => void handleDelete(p)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
          {list.map((p) => {
            const clientLabel = p.client_name?.trim() || (p.client_id ? "Cliente" : "—");
            const canEdit = user?.id ? canEditRecord("proposals", p.user_id, user.id) : false;
            const canDelete = user?.id ? canDeleteRecord("proposals", p.user_id, user.id) : false;
            const goDetail = () => navigate(`/proposals/${p.id}`);
            return (
              <div
                key={`m-${p.id}`}
                className="min-h-[8.25rem] rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <button type="button" onClick={goDetail} className="w-full text-left">
                  <p className="font-mono text-xs text-muted-foreground">{proposalCode(p.id)}</p>
                  <p className="mt-1 font-semibold leading-snug">{p.title}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{clientLabel}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.valid_until ? `Validade ${formatDateOnlyPtBr(p.valid_until)}` : "Sem data de validade"}
                    {p.updated_at ? ` · Atual. ${format(new Date(p.updated_at), "dd/MM/yyyy")}` : ""}
                  </p>
                </button>
                <div className="mt-3 flex justify-end border-t border-border/60 pt-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1 px-3">
                        Ações
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}`)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Abrir
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => tryOpenStoredPublicProposal(p.id)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Proposta pública
                      </DropdownMenuItem>
                      {canEdit && (
                        <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}`)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                      )}
                      {canDelete && (
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => void handleDelete(p)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      <div className="text-center">
        <p className="text-sm text-muted-foreground mb-2">Organize propostas nos funis de vendas</p>
        <Button variant="outline" asChild>
          <Link to="/funnel" className="inline-flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            Ver funis
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default Proposals;
