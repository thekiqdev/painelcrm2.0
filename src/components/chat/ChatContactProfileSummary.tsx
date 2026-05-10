import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ClientFinancialSummary } from '@/services/clients';
import { clientsService } from '@/services/clients';
import { EMPTY_CLIENT_FINANCIAL_SUMMARY } from '@/utils/clientFinancialSummary';
import {
  Building2,
  CalendarDays,
  CircleCheck,
  Clock3,
  CreditCard,
  ExternalLink,
  Hash,
  Mail,
  Phone,
  Receipt,
  Timer,
  TrendingUp,
  Wallet,
  Pencil,
} from 'lucide-react';

export function formatBrlFromCents(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function FinancialSummaryCardsGrid({
  data,
  density,
}: {
  data: ClientFinancialSummary;
  density: 'default' | 'floating';
}) {
  const ticketDisplay =
    data.invoices_count === 0
      ? formatBrlFromCents(0)
      : data.average_ticket_cents != null && data.average_ticket_cents > 0
        ? formatBrlFromCents(data.average_ticket_cents)
        : formatBrlFromCents(0);

  const proposalCountLabel = (n: number) =>
    `${n} ${n === 1 ? 'proposta' : 'propostas'}`;

  return (
    <div className={cn('grid gap-2', density === 'floating' ? 'grid-cols-2' : 'grid-cols-2')}>
      <FinancialCard
        icon={Receipt}
        iconClassName="bg-violet-500/15 text-violet-700 dark:text-violet-300"
        label="Faturas"
        value={data.invoices_count}
      />
      <FinancialCard
        icon={CreditCard}
        iconClassName="bg-amber-500/15 text-amber-800 dark:text-amber-200"
        label="Em aberto"
        value={formatBrlFromCents(data.open_amount_cents)}
      />
      <FinancialCard
        icon={Wallet}
        iconClassName="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
        label="Pago"
        value={formatBrlFromCents(data.paid_amount_cents)}
      />
      <FinancialCard
        icon={TrendingUp}
        iconClassName="bg-sky-500/15 text-sky-800 dark:text-sky-200"
        label="Ticket médio"
        value={ticketDisplay}
      />
      <FinancialCard
        icon={CircleCheck}
        iconClassName="bg-teal-500/15 text-teal-800 dark:text-teal-200"
        label="Propostas aceitas"
        value={formatBrlFromCents(data.proposals_accepted_amount_cents)}
        detail={proposalCountLabel(data.proposals_accepted_count)}
      />
      <FinancialCard
        icon={Clock3}
        iconClassName="bg-orange-500/15 text-orange-900 dark:text-orange-200"
        label="Propostas pendentes"
        value={formatBrlFromCents(data.proposals_pending_amount_cents)}
        detail={proposalCountLabel(data.proposals_pending_count)}
      />
    </div>
  );
}

function FinancialCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  valueClassName,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
  /** Ex.: quantidade de propostas abaixo do valor */
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/25 px-2.5 py-2 shadow-sm dark:bg-muted/15">
      <div className="flex items-center gap-1.5">
        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/80 shadow-sm', iconClassName)}>
          <Icon className="h-3.5 w-3.5" strokeWidth={2.2} />
        </div>
        <span className="min-w-0 flex-1 text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <p className={cn('mt-1 truncate text-sm font-semibold tabular-nums tracking-tight', valueClassName)}>{value}</p>
      {detail != null && detail !== '' ? (
        <p className="mt-0.5 truncate text-[11px] font-medium tabular-nums text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

export function ChatProfileFinancialSummaryBlock({
  clientId,
  kind,
  density = 'default',
}: {
  clientId: string | null | undefined;
  kind: 'client' | 'lead' | 'unlinked';
  density?: 'default' | 'floating';
}) {
  const hasClientScope = Boolean(clientId && kind === 'client');

  const { data, isLoading } = useQuery({
    queryKey: ['client-financial-summary', clientId],
    queryFn: () => clientsService.getClientFinancialSummary(clientId!),
    enabled: hasClientScope,
    staleTime: 30_000,
    retry: 1,
  });

  const resolvedData: ClientFinancialSummary | undefined = hasClientScope ? data : undefined;

  if (!hasClientScope) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo financeiro</p>
        <p className="text-[11px] text-muted-foreground">Sem dados financeiros ainda</p>
        <FinancialSummaryCardsGrid data={EMPTY_CLIENT_FINANCIAL_SUMMARY} density={density} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo financeiro</p>
        <div className={cn('grid gap-2', density === 'floating' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-2')}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const gridData = resolvedData ?? EMPTY_CLIENT_FINANCIAL_SUMMARY;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo financeiro</p>
      <FinancialSummaryCardsGrid data={gridData} density={density} />
    </div>
  );
}

export type CompactProfileFieldRow = {
  key: string;
  label: string;
  value: string | null;
};

function pickCompactRows(profileFields: CompactProfileFieldRow[], headerPhone: string | null): CompactProfileFieldRow[] {
  const allowed = new Set(['phone', 'email', 'cpf_cnpj', 'company', 'lastInteraction']);
  const norm = (s: string | null | undefined) => (s ?? '').trim();
  const hp = norm(headerPhone);
  return profileFields.filter((row) => {
    if (!allowed.has(row.key)) return false;
    if (row.key === 'phone' && hp && norm(row.value) === hp) return false;
    return true;
  });
}

function RowIcon({ rowKey }: { rowKey: string }) {
  switch (rowKey) {
    case 'phone':
      return <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case 'email':
      return <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case 'cpf_cnpj':
      return <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case 'company':
      return <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    case 'lastInteraction':
      return <Timer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
    default:
      return null;
  }
}

export function ChatProfileContactCompactList({
  profileFields,
  headerPhone,
  className,
  onEditContact,
  canEditProfileFields = false,
}: {
  profileFields: CompactProfileFieldRow[];
  headerPhone: string | null;
  className?: string;
  /** Mesmo fluxo que o botão «Editar» do topo (perfil completo na sidebar). */
  onEditContact?: () => void;
  canEditProfileFields?: boolean;
}) {
  const rows = pickCompactRows(profileFields, headerPhone);
  const showEdit = Boolean(onEditContact && canEditProfileFields);

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Contato</p>
        {showEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Editar contato"
            title="Editar contato"
            onClick={onEditContact}
          >
            <Pencil className="h-4 w-4" strokeWidth={2.2} />
          </Button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">Sem dados para pré-visualização compacta.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row) => {
            const empty = !row.value?.trim();
            return (
              <li key={row.key} className="flex items-start gap-2.5 text-sm">
                <span className="mt-0.5">
                  <RowIcon rowKey={row.key} />
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</span>
                  <p className={cn('truncate leading-snug', empty ? 'text-xs italic text-muted-foreground/90' : 'font-medium')}>
                    {empty ? 'Não informado' : row.value}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ChatProfileIdentitySummaryHeader({
  displayName,
  phoneDisplay,
  avatarUrl,
  initials,
  kind,
  clientSinceLabel,
  showOpenFullProfile,
  onOpenFullProfile,
  canEditProfileFields,
  onEdit,
  density = 'default',
  avatarAccessory,
}: {
  displayName: string;
  phoneDisplay: string | null;
  avatarUrl?: string | null;
  initials: string;
  kind: 'client' | 'lead' | 'unlinked';
  clientSinceLabel?: string | null;
  showOpenFullProfile?: boolean;
  onOpenFullProfile?: () => void;
  canEditProfileFields: boolean;
  onEdit: () => void;
  density?: 'default' | 'floating';
  /** Ex.: botão flutuante sobre o avatar (converter lead / criar lead). */
  avatarAccessory?: React.ReactNode;
}) {
  const badge =
    kind === 'client' ? (
      <Badge className="border-emerald-500/30 bg-emerald-500/12 text-emerald-900 dark:text-emerald-100">Cliente</Badge>
    ) : kind === 'lead' ? (
      <Badge className="border-blue-500/35 bg-blue-500/10 text-blue-900 dark:text-blue-100">Lead</Badge>
    ) : (
      <Badge variant="outline" className="font-normal">
        Sem vínculo
      </Badge>
    );

  const avatarSize = density === 'floating' ? 'h-[72px] w-[72px] text-xl' : 'h-[88px] w-[88px] text-2xl';

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative inline-flex">
        <Avatar className={cn('border border-border/70 shadow-md', avatarSize)}>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="bg-primary/12 font-semibold text-primary">{initials}</AvatarFallback>
        </Avatar>
        {avatarAccessory}
      </div>
      <h2 className="mt-3 w-full truncate px-1 text-base font-semibold leading-tight tracking-tight">{displayName}</h2>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">{badge}</div>
      {phoneDisplay ? <p className="mt-1 text-sm text-muted-foreground">{phoneDisplay}</p> : null}
      {clientSinceLabel ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span>Cliente desde {clientSinceLabel}</span>
        </p>
      ) : null}

      <div className={cn('mt-3 flex w-full flex-wrap items-center justify-center gap-2', density === 'floating' && 'px-0')}>
        {showOpenFullProfile && onOpenFullProfile ? (
          <Button type="button" variant="outline" size="sm" className="h-9 shrink gap-1.5 px-3 text-xs" onClick={onOpenFullProfile}>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" />
            Abrir perfil completo
          </Button>
        ) : null}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-9 shrink gap-1.5 px-3 text-xs"
          disabled={!canEditProfileFields}
          title={!canEditProfileFields ? 'Sem permissão para editar' : 'Editar dados do contato'}
          onClick={onEdit}
        >
          Editar
        </Button>
      </div>
    </div>
  );
}
