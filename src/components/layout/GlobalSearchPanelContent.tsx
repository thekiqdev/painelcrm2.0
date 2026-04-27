import React, { useMemo } from 'react';
import {
  Building2,
  Calendar,
  FileSearch,
  FileText,
  LayoutGrid,
  MessageCircle,
  Package,
  Receipt,
  Ticket,
} from 'lucide-react';
import { CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchEntityAvatar } from '@/components/layout/SearchEntityAvatar';
import { cn } from '@/lib/utils';
import type { GlobalSearchGroupedResponse } from '@/services/search';

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatBrlFromCents(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(Number(cents))) return '—';
  return brl.format(Number(cents) / 100);
}

function formatBrlDecimal(amount: string | number | null | undefined): string {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : Number(String(amount).replace(',', '.'));
  if (Number.isNaN(n)) return '—';
  return brl.format(n);
}

function formatDateLabel(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('pt-BR');
}

const invoiceStatusPt: Record<string, string> = {
  pending: 'Pendente',
  paid: 'Paga',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
  waiting_payment: 'Aguardando pagamento',
  processing: 'Processando',
};

const proposalStatusPt: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviada',
  accepted: 'Aceita',
  rejected: 'Recusada',
  expired: 'Expirada',
};

const contractStatusPt: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_SIGNATURE: 'Aguardando assinatura',
  PARTIALLY_SIGNED: 'Assinatura parcial',
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
};

const signatureStatePt: Record<string, string> = {
  signed_or_closed: 'Assinado / encerrado',
  awaiting_signature: 'Aguardando assinatura',
  other: '—',
};

const ticketStatusPt: Record<string, string> = {
  new: 'Novo',
  open: 'Aberto',
  pending: 'Pendente',
  waiting_customer: 'Aguardando cliente',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
};

export type GlobalSearchVisibility = {
  clients: boolean;
  leads: boolean;
  invoices: boolean;
  proposals: boolean;
  contracts: boolean;
  tickets: boolean;
  projects: boolean;
  products: boolean;
};

type Props = {
  grouped: GlobalSearchGroupedResponse | null;
  loading: boolean;
  query: string;
  visibility: GlobalSearchVisibility;
  /** `dialog` = mobile / command palette (lista flexível, hints). */
  layout?: 'popover' | 'dialog';
  searchError?: string | null;
  listClassName?: string;
  onOpenHref: (href: string) => void;
  onChatClient?: (clientId: string) => void;
  onChatLead?: (leadId: string) => void;
  onNewInvoiceClient?: (clientId: string) => void;
  onCreateClient?: () => void;
};

function stopCmdkSelect(e: React.MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function totalHits(g: GlobalSearchGroupedResponse | null, v: GlobalSearchVisibility): number {
  if (!g) return 0;
  let n = 0;
  if (v.clients) n += g.clients?.length ?? 0;
  if (v.leads) n += g.leads?.length ?? 0;
  if (v.invoices) n += g.invoices?.length ?? 0;
  if (v.proposals) n += g.proposals?.length ?? 0;
  if (v.contracts) n += g.contracts?.length ?? 0;
  if (v.tickets) n += g.tickets?.length ?? 0;
  if (v.projects) n += g.projects?.length ?? 0;
  if (v.products) n += g.products?.length ?? 0;
  return n;
}

export function GlobalSearchPanelContent({
  grouped,
  loading,
  query,
  visibility,
  layout = 'popover',
  searchError = null,
  listClassName,
  onOpenHref,
  onChatClient,
  onChatLead,
  onNewInvoiceClient,
  onCreateClient,
}: Props) {
  const total = useMemo(() => totalHits(grouped, visibility), [grouped, visibility]);
  const isDialog = layout === 'dialog';
  const avatarSize = isDialog ? 'mobile' : 'desktop';
  const rowPad = isDialog ? 'min-h-[3.25rem] py-3.5' : 'py-3';
  const actionBtn = isDialog ? 'h-10 w-10' : 'h-8 w-8';

  const showEmpty = query.trim().length >= 2 && !loading && total === 0;
  const showShortQueryHint = isDialog && !loading && query.trim().length < 2;

  return (
    <>
      {searchError ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive dark:text-red-200">
          {searchError}
        </div>
      ) : null}
      <CommandList
        className={cn(
          'overflow-y-auto overflow-x-hidden py-1 text-foreground',
          isDialog
            ? 'min-h-0 flex-1 max-h-none bg-background pb-[max(1rem,env(safe-area-inset-bottom))]'
            : 'max-h-[min(70vh,32rem)] bg-popover',
          listClassName,
        )}
      >
        {loading ? (
          <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">Buscando…</div>
        ) : null}
        {showShortQueryHint ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            {query.trim().length === 0
              ? 'Digite para buscar no CRM (mínimo 2 caracteres).'
              : 'Digite pelo menos 2 caracteres para buscar.'}
          </div>
        ) : null}
        {showEmpty ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum resultado encontrado</p>
            {onCreateClient ? (
              <Button type="button" size="sm" variant="secondary" className="rounded-lg" onClick={() => onCreateClient()}>
                Criar cliente
              </Button>
            ) : null}
          </div>
        ) : null}

        {!showEmpty && visibility.clients && grouped && grouped.clients?.length ? (
          <CommandGroup
            heading="Clientes"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.clients.map((c) => (
              <CommandItem
                key={`client-${c.id}`}
                value={`client-${c.id}`}
                onSelect={() => onOpenHref(c.href)}
                className={cn(
                  'cursor-pointer touch-manipulation rounded-lg px-3 aria-selected:bg-muted/80 dark:aria-selected:bg-muted/50',
                  rowPad,
                )}
              >
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <SearchEntityAvatar
                        entity={{ name: c.name, avatar_url: c.avatar_url ?? null, photo: c.photo ?? null }}
                        whatsappAvatarUrl={c.whatsapp_avatar_url ?? null}
                        size={avatarSize}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium leading-tight">{c.name}</span>
                          <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                            Cliente
                          </Badge>
                          {c.status ? (
                            <Badge
                              variant={c.status === 'Ativo' ? 'default' : c.status === 'Inativo' ? 'destructive' : 'outline'}
                              className="h-5 shrink-0 px-1.5 text-[10px] font-medium"
                            >
                              {c.status}
                            </Badge>
                          ) : null}
                        </div>
                        {c.company ? (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                            {c.company}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {c.phone ? <span>{c.phone}</span> : null}
                          {c.email ? <span className="truncate">{c.email}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {onNewInvoiceClient ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn('rounded-md text-muted-foreground hover:text-foreground', actionBtn)}
                          title="Nova fatura"
                          aria-label="Nova fatura"
                          onMouseDown={stopCmdkSelect}
                          onClick={(e) => {
                            stopCmdkSelect(e);
                            onNewInvoiceClient(c.id);
                          }}
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>
                      ) : null}
                      {onChatClient ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={cn('rounded-md text-muted-foreground hover:text-foreground', actionBtn)}
                          title="Chat"
                          aria-label="Abrir chat"
                          onMouseDown={stopCmdkSelect}
                          onClick={(e) => {
                            stopCmdkSelect(e);
                            onChatClient(c.id);
                          }}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.leads && grouped && grouped.leads?.length ? (
          <CommandGroup
            heading="Leads"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.leads.map((l) => (
              <CommandItem
                key={`lead-${l.id}`}
                value={`lead-${l.id}`}
                onSelect={() => onOpenHref(l.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex w-full min-w-0 flex-col gap-2">
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <UserPlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium leading-tight">{l.name}</span>
                          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                            Lead
                          </Badge>
                          {l.status ? (
                            <Badge variant="secondary" className="h-5 max-w-[8rem] shrink-0 truncate px-1.5 text-[10px] font-medium">
                              {l.status}
                            </Badge>
                          ) : null}
                        </div>
                        {l.company ? (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Building2 className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                            {l.company}
                          </p>
                        ) : null}
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {l.phone ? <span>{l.phone}</span> : null}
                          {l.email ? <span className="truncate">{l.email}</span> : null}
                        </div>
                      </div>
                    </div>
                    {onChatLead ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn('shrink-0 rounded-md text-muted-foreground hover:text-foreground', actionBtn)}
                        title="Chat"
                        aria-label="Abrir chat"
                        onMouseDown={stopCmdkSelect}
                        onClick={(e) => {
                          stopCmdkSelect(e);
                          onChatLead(l.id);
                        }}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.invoices && grouped && grouped.invoices?.length ? (
          <CommandGroup
            heading="Faturas"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.invoices.map((inv) => (
              <CommandItem
                key={`inv-${inv.id}`}
                value={`inv-${inv.id}`}
                onSelect={() => onOpenHref(inv.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Receipt className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{inv.invoice_number || 'Sem número'}</span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                        {invoiceStatusPt[String(inv.status).toLowerCase()] ?? inv.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{inv.client_name || '—'}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{formatBrlFromCents(inv.amount_cents)}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 opacity-70" aria-hidden />
                        Venc. {formatDateLabel(inv.due_date)}
                      </span>
                    </div>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.proposals && grouped && grouped.proposals?.length ? (
          <CommandGroup
            heading="Propostas"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.proposals.map((p) => (
              <CommandItem
                key={`prop-${p.id}`}
                value={`prop-${p.id}`}
                onSelect={() => onOpenHref(p.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.title}</span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                        {proposalStatusPt[String(p.status).toLowerCase()] ?? p.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{p.client_name || '—'}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{formatBrlDecimal(p.amount)}</span>
                      <span>Válida até {formatDateLabel(p.valid_until)}</span>
                    </div>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.contracts && grouped && grouped.contracts?.length ? (
          <CommandGroup
            heading="Contratos"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.contracts.map((c) => (
              <CommandItem
                key={`ctr-${c.id}`}
                value={`ctr-${c.id}`}
                onSelect={() => onOpenHref(c.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{c.title || c.contract_number || 'Contrato'}</span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                        {contractStatusPt[String(c.status)] ?? c.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.client_name || '—'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {signatureStatePt[c.signature_state] ?? signatureStatePt.other}
                    </p>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.tickets && grouped && grouped.tickets?.length ? (
          <CommandGroup
            heading="Tickets"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.tickets.map((t) => (
              <CommandItem
                key={`tkt-${t.id}`}
                value={`tkt-${t.id}`}
                onSelect={() => onOpenHref(t.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium tabular-nums">{t.ticket_number || '—'}</span>
                      <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                        {ticketStatusPt[String(t.status).toLowerCase()] ?? t.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm">{t.subject}</p>
                    {t.contact_name ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{t.contact_name}</p>
                    ) : null}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.projects && grouped && grouped.projects?.length ? (
          <CommandGroup
            heading="Projetos"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.projects.map((p) => (
              <CommandItem
                key={`prj-${p.id}`}
                value={`prj-${p.id}`}
                onSelect={() => onOpenHref(p.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <LayoutGrid className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.status ? (
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                          {p.status}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Prazo {formatDateLabel(p.due_date)}
                    </p>
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {!showEmpty && visibility.products && grouped && grouped.products?.length ? (
          <CommandGroup
            heading="Produtos"
            className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {grouped.products.map((p) => (
              <CommandItem
                key={`prd-${p.id}`}
                value={`prd-${p.id}`}
                onSelect={() => onOpenHref(p.href)}
                className="cursor-pointer rounded-lg px-3 py-3 aria-selected:bg-muted/80"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {p.type ? (
                        <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                          {p.type === 'service' ? 'Serviço' : 'Produto'}
                        </Badge>
                      ) : null}
                      {p.status ? (
                        <Badge variant="secondary" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                          {p.status}
                        </Badge>
                      ) : null}
                    </div>
                    {p.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                    ) : null}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </>
  );
}
