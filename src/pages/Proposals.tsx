import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Loader2, Trash2, Eye, Pencil, ExternalLink, Search, X } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate, Link } from "react-router-dom";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import { getStoredProposalPublicUrl } from "@/utils/proposalPublicLinkSession";

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

const Proposals = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate, canEditRecord, canDeleteRecord, loading: permLoading } = useModulePermissions();
  const [list, setList] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("__all__");
  const [clientFilterId, setClientFilterId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<string>("__all__");
  const [validityFilter, setValidityFilter] = useState<string>("__all__");
  const [conversionFilter, setConversionFilter] = useState<string>("__all__");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(searchInput.trim()), 320);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold">Propostas / Orçamentos</h1>

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

      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
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
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Carregando propostas...
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma proposta com estes filtros.</p>
      ) : (
        <div className="rounded-md border bg-card">
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
