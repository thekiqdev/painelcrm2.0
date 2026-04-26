import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  Plus,
  FileText,
  Loader2,
  Trash2,
  Eye,
  Pencil,
  ExternalLink,
  Search,
  X,
  Filter,
  Send,
  CheckCircle2,
  AlertCircle,
  Layers,
} from "lucide-react";
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
import { getStoredProposalPublicUrl, setStoredProposalPublicUrl } from "@/utils/proposalPublicLinkSession";
import { applyUrlPatch } from "@/lib/listFiltersUrl";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<Proposal["status"], string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired: "Expirada",
  invoiced: "Faturada",
};

const STATUS_CLASS: Record<Proposal["status"], string> = {
  draft: "bg-muted text-muted-foreground border border-border/60",
  sent: "bg-amber-100 text-amber-950 border border-amber-200/80 dark:bg-amber-950/35 dark:text-amber-100 dark:border-amber-800/50",
  accepted: "bg-emerald-100 text-emerald-950 border border-emerald-200/80 dark:bg-emerald-950/35 dark:text-emerald-100 dark:border-emerald-800/50",
  rejected: "bg-red-100 text-red-900 border border-red-200/80 dark:bg-red-950/40 dark:text-red-100 dark:border-red-900/50",
  expired: "bg-red-100 text-red-900 border border-red-200/80 dark:bg-red-950/40 dark:text-red-100 dark:border-red-900/50",
  invoiced: "bg-blue-100 text-blue-950 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-100 dark:border-blue-900/50",
};

function proposalStatusBadgeClass(status: Proposal["status"]): string {
  return cn(
    "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium tabular-nums",
    STATUS_CLASS[status],
  );
}

/** Comparador de datas YYYY-MM-DD (sem horário). */
function isYmdBeforeToday(ymd: string): boolean {
  const t = ymd.trim().slice(0, 10);
  if (t.length < 10) return false;
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  const d = String(today.getDate()).padStart(2, "0");
  const todayStr = `${y}-${m}-${d}`;
  return t < todayStr;
}

function daysUntilYmd(ymd: string): number | null {
  const t = ymd.trim().slice(0, 10);
  if (t.length < 10) return null;
  const [yy, mm, dd] = t.split("-").map(Number);
  const end = new Date(yy, mm - 1, dd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86400000);
}

function proposalCode(id: string): string {
  return `PROP-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function resolveProposalPublicUrl(p: Proposal): string | null {
  const raw = p.public_link_path?.trim();
  if (raw) {
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    const path = raw.startsWith("/") ? raw : `/${raw}`;
    return `${window.location.origin}${path}`;
  }
  return getStoredProposalPublicUrl(p.id) ?? null;
}

/** Abre a página pública da proposta (`/proposal-view/:token`), em nova aba. */
function openProposalPublicPage(p: Proposal): void {
  const url = resolveProposalPublicUrl(p);
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  toast.message("Link público indisponível", {
    description:
      "Esta proposta pode não ter link público ainda. Abra o detalhe e use Publicar proposta (rascunho) ou gere o link na área de faturamento, se aplicável.",
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

function ValidadeTableCell({ p }: { p: Proposal }) {
  const raw = p.valid_until;
  if (!raw) return <span className="text-sm text-muted-foreground">—</span>;
  const dateStr = formatDateOnlyPtBr(raw);
  const past = isYmdBeforeToday(raw);
  const dLeft = daysUntilYmd(raw);
  if (p.status === "expired" || (past && (p.status === "sent" || p.status === "draft"))) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-destructive tabular-nums">{dateStr}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-destructive/90">Vencida</span>
      </div>
    );
  }
  if (p.status === "sent" && dLeft !== null && dLeft >= 0 && dLeft <= 7) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-amber-800 tabular-nums dark:text-amber-300">{dateStr}</span>
        <span className="text-[10px] text-muted-foreground">
          {dLeft === 0 ? "Vence hoje" : `Em ${dLeft} dia(s)`}
        </span>
      </div>
    );
  }
  return <span className="text-sm text-muted-foreground tabular-nums">{dateStr}</span>;
}

const summaryCardActiveRing =
  "ring-2 ring-crm-primary/50 border-crm-primary/35 bg-crm-primary/[0.06]";

const Proposals = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { canCreate, canEditRecord, canDeleteRecord, canProposalSendRecord, loading: permLoading } =
    useModulePermissions();
  const [list, setList] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [publishingProposalId, setPublishingProposalId] = useState<string | null>(null);

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

  const handlePublishProposalFromList = async (p: Proposal) => {
    if (!user?.id) return;
    if (p.status !== "draft") return;
    if (!canProposalSendRecord(p.user_id, user.id)) {
      toast.error("Sem permissão para publicar esta proposta");
      return;
    }
    setPublishingProposalId(p.id);
    try {
      const updated = await proposalsService.updateProposal(p.id, {
        status: "sent",
        sent_date: format(new Date(), "yyyy-MM-dd"),
      });
      const path = updated.public_link_path?.trim();
      if (path) {
        const full = `${window.location.origin}${path.startsWith("/") ? path : `/${path}`}`;
        setStoredProposalPublicUrl(p.id, full);
      }
      toast.success("Proposta publicada. Status atualizado para Enviada; notificações de envio disparadas se configuradas.");
      await loadList();
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === "PROPOSAL_SENT_REQUIRES_PUBLIC_LINK") {
        toast.error(e.message || "Não foi possível gerar o link público.");
      } else {
        toast.error(e instanceof Error ? e.message : "Erro ao publicar");
      }
    } finally {
      setPublishingProposalId(null);
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

  const listStats = useMemo(() => {
    const total = list.length;
    const abertas = list.filter((p) => p.status === "sent").length;
    const aceitas = list.filter((p) => p.status === "accepted" || p.status === "invoiced").length;
    const vencidas = list.filter(
      (p) => p.status === "expired" || (p.valid_until && new Date(p.valid_until) < new Date() && p.status === "sent"),
    ).length;
    return { total, abertas, aceitas, vencidas };
  }, [list]);

  const cardTotalActive = !hasActiveFilters;
  const cardAbertasActive = statusFilter === "sent";
  const cardAceitasActive = statusFilter === "accepted" || statusFilter === "invoiced";
  const cardVencidasActive = validityFilter === "expired";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Propostas</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pipeline comercial: envios, respostas e conversão em faturas.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Button type="button" variant="outline" size="sm" className="sm:h-10" onClick={() => navigate("/proposals/templates")}>
            <FileText className="mr-2 h-4 w-4" />
            Modelos
          </Button>
          {canCreateProposal ? (
            <Button type="button" size="sm" className="sm:h-10" asChild>
              <Link to="/proposals/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova proposta
              </Link>
            </Button>
          ) : (
            <Button type="button" size="sm" className="sm:h-10" disabled>
              <Plus className="mr-2 h-4 w-4" />
              Nova proposta
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 pl-9"
              placeholder="Buscar por título ou descrição"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Buscar propostas"
            />
          </div>
          <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" className="h-10 shrink-0 gap-1.5 px-3 md:hidden">
                <Filter className="h-4 w-4" />
                Filtros
                {hasActiveFilters ? <span className="ml-0.5 h-2 w-2 rounded-full bg-primary" aria-hidden /> : null}
              </Button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[92vh] overflow-y-auto rounded-t-2xl pb-[max(1.25rem,env(safe-area-inset-bottom))] md:hidden"
            >
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

        <div className="hidden md:grid md:grid-cols-4 md:gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filtrar por status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os status</SelectItem>
              {(Object.keys(STATUS_LABELS) as Proposal["status"][]).map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={validityFilter} onValueChange={setValidityFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filtrar por validade">
              <SelectValue placeholder="Validade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Validade: todas</SelectItem>
              <SelectItem value="valid">Dentro do prazo / sem data</SelectItem>
              <SelectItem value="expired">Vencidas (por data)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={conversionFilter} onValueChange={setConversionFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filtrar por faturamento">
              <SelectValue placeholder="Faturamento" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Faturamento: todas</SelectItem>
              <SelectItem value="yes">Com fatura</SelectItem>
              <SelectItem value="no">Sem fatura</SelectItem>
            </SelectContent>
          </Select>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-10 w-full" aria-label="Filtrar por responsável">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos os responsáveis</SelectItem>
              <SelectItem value="__mine__">Minhas propostas</SelectItem>
              {tenantUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name?.trim() || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden min-w-0 md:block">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Cliente</Label>
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
        {hasActiveFilters ? (
          <div className="hidden justify-end md:flex">
            <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={clearFilters}>
              <X className="mr-1.5 h-4 w-4" />
              Limpar filtros
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card
          className={cn(
            "cursor-pointer border shadow-sm transition-all hover:bg-muted/40",
            cardTotalActive && summaryCardActiveRing,
          )}
          onClick={() => clearFilters()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              clearFilters();
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Total (lista)</p>
              <Layers className="h-4 w-4 shrink-0 text-muted-foreground opacity-70" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{listStats.total}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">Limpar filtros e ver tudo</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "cursor-pointer border shadow-sm transition-all hover:bg-muted/40",
            cardAbertasActive && summaryCardActiveRing,
          )}
          onClick={() => {
            setStatusFilter("sent");
            setValidityFilter("__all__");
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter("sent");
              setValidityFilter("__all__");
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Abertas</p>
              <Send className="h-4 w-4 shrink-0 text-amber-600/85" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{listStats.abertas}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">Enviadas aguardando resposta</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "cursor-pointer border shadow-sm transition-all hover:bg-muted/40",
            cardAceitasActive && summaryCardActiveRing,
          )}
          onClick={() => {
            setStatusFilter("accepted");
            setValidityFilter("__all__");
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setStatusFilter("accepted");
              setValidityFilter("__all__");
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Aceitas / ganhas</p>
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600/80" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{listStats.aceitas}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">Aceitas e faturadas nesta lista</p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "cursor-pointer border shadow-sm transition-all hover:bg-muted/40",
            cardVencidasActive && summaryCardActiveRing,
          )}
          onClick={() => {
            setValidityFilter("expired");
            setStatusFilter("__all__");
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setValidityFilter("expired");
              setStatusFilter("__all__");
            }
          }}
        >
          <CardContent className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">Vencidas</p>
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600/75" aria-hidden />
            </div>
            <p className="mt-1.5 text-xl font-semibold tabular-nums tracking-tight">{listStats.vencidas}</p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">Por data ou status expirado</p>
          </CardContent>
        </Card>
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
        <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[88px] whitespace-nowrap text-xs font-medium text-muted-foreground">
                  Código
                </TableHead>
                <TableHead className="min-w-[200px] text-xs font-medium text-muted-foreground">Proposta</TableHead>
                <TableHead className="hidden lg:table-cell min-w-[140px] text-xs font-medium text-muted-foreground">
                  Cliente
                </TableHead>
                <TableHead className="hidden xl:table-cell max-w-[200px] text-xs font-medium text-muted-foreground">
                  Responsável
                </TableHead>
                <TableHead className="whitespace-nowrap text-xs font-medium text-muted-foreground">Status</TableHead>
                <TableHead className="hidden md:table-cell w-[118px] whitespace-nowrap text-xs font-medium text-muted-foreground">
                  Validade
                </TableHead>
                <TableHead className="text-right whitespace-nowrap text-xs font-medium text-muted-foreground">
                  Valor
                </TableHead>
                <TableHead className="hidden lg:table-cell w-[108px] whitespace-nowrap text-xs font-medium text-muted-foreground">
                  Atualizado
                </TableHead>
                <TableHead className="w-[120px] text-right text-xs font-medium text-muted-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((p) => {
                const clientLabel = p.client_name?.trim() || (p.client_id ? "Cliente CRM" : p.lead_id ? "Lead" : "—");
                const clientHint = p.lead_id && !p.client_id ? "Lead comercial" : p.client_id && p.client_name?.trim() ? "Cliente CRM" : null;
                const canEdit = user?.id ? canEditRecord("proposals", p.user_id, user.id) : false;
                const canDelete = user?.id ? canDeleteRecord("proposals", p.user_id, user.id) : false;
                const canPublishDraftRow =
                  p.status === "draft" && user?.id && canProposalSendRecord(p.user_id, user.id);
                const goDetail = () => navigate(`/proposals/${p.id}`);
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
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
                    <TableCell className="align-top font-mono text-[11px] text-muted-foreground/80 whitespace-nowrap">
                      {proposalCode(p.id)}
                    </TableCell>
                    <TableCell className="align-top max-w-[280px]">
                      <span className="line-clamp-2 font-semibold text-sm text-foreground leading-snug">{p.title}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell align-top max-w-[200px]">
                      <span className="block truncate text-sm text-foreground">{clientLabel}</span>
                      {clientHint ? (
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{clientHint}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell align-top max-w-[200px]">
                      <span className="block truncate text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">Resp. </span>
                        {p.responsible_email || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top">
                      <span className={proposalStatusBadgeClass(p.status)}>{STATUS_LABELS[p.status]}</span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell align-top">
                      <ValidadeTableCell p={p} />
                    </TableCell>
                    <TableCell className="align-top text-right text-base font-semibold tabular-nums text-foreground">
                      {formatCurrency(p.amount)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell align-top text-[11px] text-muted-foreground/75 whitespace-nowrap tabular-nums">
                      {p.updated_at ? format(new Date(p.updated_at), "dd/MM/yy HH:mm") : "—"}
                    </TableCell>
                    <TableCell className="text-right align-top" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            aria-label="Ações da proposta"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="text-xs">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Abrir
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openProposalPublicPage(p)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Abrir proposta pública
                          </DropdownMenuItem>
                          {canPublishDraftRow && (
                            <DropdownMenuItem
                              disabled={publishingProposalId === p.id}
                              onClick={(e) => {
                                e.preventDefault();
                                void handlePublishProposalFromList(p);
                              }}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              Publicar proposta
                            </DropdownMenuItem>
                          )}
                          {canEdit && (
                            <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}/edit`)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Editar proposta
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
            const canPublishDraftRow =
              p.status === "draft" && user?.id && canProposalSendRecord(p.user_id, user.id);
            const goDetail = () => navigate(`/proposals/${p.id}`);
            return (
              <div
                key={`m-${p.id}`}
                className="min-h-[9.5rem] rounded-2xl border border-border bg-card p-4 shadow-sm"
              >
                <button type="button" onClick={goDetail} className="w-full text-left">
                  <p className="font-mono text-xs text-muted-foreground">{proposalCode(p.id)}</p>
                  <p className="mt-1 font-semibold leading-snug">{p.title}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{clientLabel}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className={proposalStatusBadgeClass(p.status)}>{STATUS_LABELS[p.status]}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatCurrency(p.amount)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {p.valid_until ? `Validade ${formatDateOnlyPtBr(p.valid_until)}` : "Sem data de validade"}
                    {p.updated_at ? ` · Atual. ${format(new Date(p.updated_at), "dd/MM/yyyy")}` : ""}
                  </p>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                  <Button variant="default" size="sm" className="h-9 px-3" onClick={() => openProposalPublicPage(p)}>
                    Abrir proposta
                  </Button>
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
                      <DropdownMenuItem onClick={() => openProposalPublicPage(p)}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Proposta pública
                      </DropdownMenuItem>
                      {canPublishDraftRow && (
                        <DropdownMenuItem
                          disabled={publishingProposalId === p.id}
                          onClick={(e) => {
                            e.preventDefault();
                            void handlePublishProposalFromList(p);
                          }}
                        >
                          <Send className="mr-2 h-4 w-4" />
                          Publicar proposta
                        </DropdownMenuItem>
                      )}
                      {canEdit && (
                        <DropdownMenuItem onClick={() => navigate(`/proposals/${p.id}/edit`)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar proposta
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
