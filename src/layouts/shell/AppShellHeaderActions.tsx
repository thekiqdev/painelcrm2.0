import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Users, FileText, FileSearch, ClipboardCheck, CalendarDays, Receipt, Plus,
  TrendingUp, TrendingDown, ArrowLeftRight,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useInAppNotificationBadges } from '@/hooks/useInAppNotificationBadges';
import { normalizeCatalogMediaUrlForBrowser } from '@/services/catalogMediaUpload';
import { HeaderProfileCluster } from '@/components/layout/HeaderProfileCluster';
import { CREATE_MENU_ITEM_CLASS } from './shellConstants';

export const AppShellHeaderActions = React.memo(function AppShellHeaderActions() {
  const { user, profile, signOut } = useAuth();
  const { canView, canCreate, hasPermissionKey } = useModulePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const initials = useMemo(() => {
    const src = profile ?? user;
    const f = (src?.first_name || '').trim().charAt(0);
    const l = (src?.last_name || '').trim().charAt(0);
    const pair = `${f}${l}`.trim();
    if (pair) return pair.toUpperCase();
    const em = (user?.email || '').trim().charAt(0);
    return em ? em.toUpperCase() : 'U';
  }, [profile, user]);

  const displayName = useMemo(() => {
    const src = profile ?? user;
    const name = `${src?.first_name || ''} ${src?.last_name || ''}`.trim();
    if (name) return name;
    return user?.email?.split('@')[0] || 'Usuário';
  }, [profile, user]);

  const headerAvatarSrc = useMemo(() => {
    const raw =
      (profile as { avatar_url?: string | null } | null)?.avatar_url ??
      (user as { avatar_url?: string | null } | null)?.avatar_url;
    if (!raw || !String(raw).trim()) return null;
    try {
      return normalizeCatalogMediaUrlForBrowser(String(raw).trim());
    } catch {
      return String(raw).trim();
    }
  }, [profile, user]);

  const { notifUnread, updatesUnread } = useInAppNotificationBadges();

  const hasClients = useFeatureFlag('clients');
  const hasLeads = useFeatureFlag('leads');
  const hasProposals = useFeatureFlag('proposals');
  const hasContracts = useFeatureFlag('contracts');
  const hasTasks = useFeatureFlag('tasks');
  const hasAgenda = useFeatureFlag('agenda');
  const hasInvoices = useFeatureFlag('invoices');
  const hasExpenses = useFeatureFlag('expenses');

  const showCreateInvoice =
    hasInvoices && canView('billing') && hasPermissionKey('billing.create_invoice');
  const showCreateClient = hasClients && canView('clients') && canCreate('clients');
  const showCreateProposal = hasProposals && canView('proposals') && canCreate('proposals');
  const showCreateContract = hasContracts && canView('contracts') && canCreate('contracts');
  const showCreateTask = hasTasks && canView('tasks') && canCreate('tasks');
  const showCreateAppointment = hasAgenda && canView('agenda') && canCreate('agenda');
  const showCreateFinanceTx =
    hasExpenses && canView('finance') && hasPermissionKey('finance.create_expense');
  const showTransfer = showCreateFinanceTx;
  const showCreateMenu =
    showCreateInvoice ||
    showCreateClient ||
    showCreateProposal ||
    showCreateContract ||
    showCreateTask ||
    showCreateAppointment ||
    showCreateFinanceTx;

  const createMenuContent = useMemo(() => {
    type Row = { tier: number; sort: number; node: React.ReactNode };
    const rows: Row[] = [];
    const onFinance = pathname.startsWith('/finance');

    if (showCreateInvoice) {
      rows.push({
        tier:
          pathname.startsWith('/customer-invoices') || pathname.startsWith('/customer-charges') ? 0 : 1,
        sort: 10,
        node: (
          <DropdownMenuItem key="create-invoice" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/customer-invoices/new')}>
            <Receipt className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova fatura
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateClient) {
      rows.push({
        tier: pathname.startsWith('/clients') ? 0 : 1,
        sort: 20,
        node: (
          <DropdownMenuItem key="create-client" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/clients?new=1')}>
            <Users className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo cliente
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateProposal) {
      rows.push({
        tier: pathname.startsWith('/proposals') ? 0 : 1,
        sort: 30,
        node: (
          <DropdownMenuItem key="create-proposal" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/proposals/new')}>
            <FileText className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova proposta
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateContract) {
      rows.push({
        tier: pathname.startsWith('/contracts') ? 0 : 1,
        sort: 40,
        node: (
          <DropdownMenuItem key="create-contract" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/contracts/new')}>
            <FileSearch className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo contrato
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateTask) {
      rows.push({
        tier: pathname.startsWith('/tasks') ? 0 : 1,
        sort: 50,
        node: (
          <DropdownMenuItem key="create-task" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/tasks?new=1')}>
            <ClipboardCheck className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Nova tarefa
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateAppointment) {
      rows.push({
        tier: pathname.startsWith('/agenda') ? 0 : 1,
        sort: 52,
        node: (
          <DropdownMenuItem key="create-appointment" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/agenda?new=1')}>
            <CalendarDays className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Novo compromisso
          </DropdownMenuItem>
        ),
      });
    }
    if (showCreateFinanceTx) {
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 60,
        node: (
          <DropdownMenuItem key="create-income" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/finance/transactions?new=income')}>
            <TrendingUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Lançar entrada
          </DropdownMenuItem>
        ),
      });
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 61,
        node: (
          <DropdownMenuItem key="create-expense" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/finance/transactions?new=expense')}>
            <TrendingDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Lançar despesa
          </DropdownMenuItem>
        ),
      });
    }
    if (showTransfer) {
      rows.push({
        tier: onFinance ? 0 : 1,
        sort: 80,
        node: (
          <DropdownMenuItem key="create-transfer" className={CREATE_MENU_ITEM_CLASS} onClick={() => navigate('/finance/accounts?transfer=1')}>
            <ArrowLeftRight className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
            Transferir
          </DropdownMenuItem>
        ),
      });
    }

    rows.sort((a, b) => a.tier - b.tier || a.sort - b.sort);
    return rows.map((r) => r.node);
  }, [
    pathname, navigate, showCreateInvoice, showCreateClient, showCreateProposal,
    showCreateContract, showCreateTask, showCreateAppointment, showCreateFinanceTx, showTransfer,
  ]);

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-0.5 sm:gap-1">
      {showCreateMenu ? (
        <DropdownMenu>
          <Tooltip delayDuration={400}>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden h-9 w-9 shrink-0 rounded-lg text-muted-foreground hover:bg-muted/60 hover:text-foreground md:inline-flex"
                  aria-label="Criar novo"
                >
                  <Plus className="h-[1.125rem] w-[1.125rem]" strokeWidth={2.25} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end" className="text-xs font-medium">
              Criar novo
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="min-w-[13.75rem] rounded-xl border-border/50 bg-popover/95 p-1 shadow-md backdrop-blur-sm dark:bg-popover"
          >
            {createMenuContent}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <HeaderProfileCluster
        displayName={displayName}
        initials={initials}
        headerAvatarSrc={headerAvatarSrc}
        notifUnread={notifUnread}
        updatesUnread={updatesUnread}
        user={user}
        canView={canView}
        signOut={signOut}
      />
    </div>
  );
});
