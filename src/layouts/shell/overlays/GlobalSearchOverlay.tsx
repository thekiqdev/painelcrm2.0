import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Command, CommandDialog, CommandInput } from '@/components/ui/command';
import { type GlobalSearchVisibility } from '@/components/layout/GlobalSearchPanelContent';
import { GlobalSearchPanelLazy } from '@/components/layout/GlobalSearchPanelLazy';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebouncedGlobalGroupedSearch } from '@/hooks/useGlobalSearch';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/hooks/useFeatureFlag';
import { useModulePermissions } from '@/contexts/ModulePermissionsContext';
import { useFloatingChat } from '@/features/floating-chat';
import { useGlobalSearchSlot } from './GlobalSearchSlotContext';
import { logDevMount } from '@/lib/devMountTiming';

function GlobalSearchRegion() {
  const { setOverlayReady, openCommandOnMount, clearOpenCommandOnMount } = useGlobalSearchSlot();
  const { canView, canCreate } = useModulePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const floatingChatCtx = useFloatingChat();
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [commandSearchQuery, setCommandSearchQuery] = useState('');
  const [desktopSearchInteracted, setDesktopSearchInteracted] = useState(false);
  const [commandSearchInteracted, setCommandSearchInteracted] = useState(false);
  const [desktopSearchFocused, setDesktopSearchFocused] = useState(false);
  const [commandSearchFocused, setCommandSearchFocused] = useState(false);
  const [desktopSearchArmed, setDesktopSearchArmed] = useState(false);
  const [commandSearchArmed, setCommandSearchArmed] = useState(false);
  const [searchBundleArmed, setSearchBundleArmed] = useState(false);

  const armSearchBundle = useCallback(() => {
    setSearchBundleArmed(true);
  }, []);

  useEffect(() => {
    logDevMount('GlobalSearchOverlay');
    setOverlayReady(true);
    if (openCommandOnMount) {
      armSearchBundle();
      setCommandDialogOpen(true);
      clearOpenCommandOnMount();
    }
  }, [setOverlayReady, openCommandOnMount, clearOpenCommandOnMount, armSearchBundle]);

  const { user } = useAuth();

  useEffect(() => {
    setSearchQuery('');
    setCommandSearchQuery('');
    setDesktopSearchInteracted(false);
    setCommandSearchInteracted(false);
    setDesktopSearchFocused(false);
    setCommandSearchFocused(false);
    setDesktopSearchArmed(false);
    setCommandSearchArmed(false);
    setSearchBundleArmed(false);
    setPopoverOpen(false);
    setCommandDialogOpen(false);
  }, [pathname]);

  useEffect(() => {
    const userEmail = (user?.email || '').trim().toLowerCase();
    if (!userEmail) return;
    if (!desktopSearchFocused && !desktopSearchInteracted && searchQuery.trim().toLowerCase() === userEmail) {
      setSearchQuery('');
    }
    if (!commandSearchFocused && !commandSearchInteracted && commandSearchQuery.trim().toLowerCase() === userEmail) {
      setCommandSearchQuery('');
    }
  }, [
    user?.email,
    searchQuery,
    commandSearchQuery,
    desktopSearchFocused,
    commandSearchFocused,
    desktopSearchInteracted,
    commandSearchInteracted,
  ]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        armSearchBundle();
        setCommandDialogOpen(true);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [armSearchBundle]);

  const hasClients = useFeatureFlag('clients');
  const hasLeads = useFeatureFlag('leads');
  const hasProposals = useFeatureFlag('proposals');
  const hasContracts = useFeatureFlag('contracts');
  const hasTickets = useFeatureFlag('tickets');
  const hasProjects = useFeatureFlag('projects');
  const hasProducts = useFeatureFlag('products');
  const hasInvoices = useFeatureFlag('invoices');
  const hasChat = useFeatureFlag('chat');

  const searchTypesCsv = useMemo(() => {
    const parts: string[] = [];
    if (hasClients && canView('clients')) parts.push('clients');
    if (hasLeads && canView('leads')) parts.push('leads');
    if (hasInvoices && canView('billing')) parts.push('invoices');
    if (hasProposals && canView('proposals')) parts.push('proposals');
    if (hasContracts && canView('contracts')) parts.push('contracts');
    if (hasTickets && canView('tickets')) parts.push('tickets');
    if (hasProjects && canView('projects')) parts.push('projects');
    if (hasProducts && canView('products')) parts.push('products');
    return parts.join(',');
  }, [
    hasClients, hasLeads, hasInvoices, hasProposals, hasContracts, hasTickets, hasProjects, hasProducts, canView,
  ]);

  const searchVisibility: GlobalSearchVisibility = useMemo(
    () => ({
      clients: hasClients && canView('clients'),
      leads: hasLeads && canView('leads'),
      invoices: hasInvoices && canView('billing'),
      proposals: hasProposals && canView('proposals'),
      contracts: hasContracts && canView('contracts'),
      tickets: hasTickets && canView('tickets'),
      projects: hasProjects && canView('projects'),
      products: hasProducts && canView('products'),
    }),
    [
      hasClients, hasLeads, hasInvoices, hasProposals, hasContracts, hasTickets, hasProjects, hasProducts, canView,
    ],
  );

  const canChatClients = hasChat && canView('chat');
  const canChatLeads = hasChat && canView('chat');
  const canNewInvoiceFromClient = hasInvoices && canView('billing') && canCreate('billing');
  const canCreateClientFromSearch = hasClients && canView('clients') && canCreate('clients');

  const activeSearchQuery = commandDialogOpen
    ? commandSearchArmed && commandSearchInteracted
      ? commandSearchQuery
      : ''
    : desktopSearchArmed && desktopSearchInteracted
      ? searchQuery
      : '';
  const qTrim = activeSearchQuery.trim();

  const { groupedSearch, searchLoading, searchError } = useDebouncedGlobalGroupedSearch(
    activeSearchQuery,
    searchTypesCsv,
  );

  useEffect(() => {
    if (!searchTypesCsv) {
      setPopoverOpen(false);
      return;
    }
    if (qTrim.length < 2) {
      if (!commandDialogOpen) setPopoverOpen(false);
      return;
    }
    if (!commandDialogOpen) {
      setPopoverOpen(true);
    }
  }, [searchTypesCsv, qTrim, commandDialogOpen]);

  const panelQuery = activeSearchQuery;

  const handleOpenHref = useCallback(
    (href: string) => {
      setPopoverOpen(false);
      setCommandDialogOpen(false);
      setSearchQuery('');
      setCommandSearchQuery('');
      navigate(href);
    },
    [navigate],
  );

  const handleChatClient = useCallback(
    (clientId: string) => {
      setPopoverOpen(false);
      setCommandDialogOpen(false);
      setSearchQuery('');
      setCommandSearchQuery('');
      void floatingChatCtx.openChatForClient(clientId);
    },
    [floatingChatCtx],
  );

  const handleChatLead = useCallback(
    (leadId: string) => {
      setPopoverOpen(false);
      setCommandDialogOpen(false);
      setSearchQuery('');
      setCommandSearchQuery('');
      void floatingChatCtx.openChatForLead(leadId);
    },
    [floatingChatCtx],
  );

  const handleNewInvoiceClient = useCallback(
    (clientId: string) => {
      setPopoverOpen(false);
      setCommandDialogOpen(false);
      setSearchQuery('');
      setCommandSearchQuery('');
      navigate(`/customer-invoices/new?client_id=${encodeURIComponent(clientId)}`);
    },
    [navigate],
  );

  const handleCreateClientFromSearch = useCallback(() => {
    handleOpenHref('/clients?new=1');
  }, [handleOpenHref]);

  const searchPanelEnabled =
    searchBundleArmed && (popoverOpen || commandDialogOpen || desktopSearchArmed || commandSearchArmed);

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        className="mr-2 shrink-0 md:hidden"
        onClick={() => {
          armSearchBundle();
          setCommandDialogOpen(true);
        }}
        aria-label="Buscar"
      >
        <Search className="h-4 w-4" />
      </Button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <div className="relative hidden w-full md:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar clientes, contratos, produtos..."
              value={searchQuery}
              onChange={(e) => {
                if (!desktopSearchFocused || !desktopSearchArmed) return;
                setDesktopSearchInteracted(true);
                setSearchQuery(e.target.value);
              }}
              onPaste={() => {
                if (!desktopSearchArmed) return;
                setDesktopSearchInteracted(true);
              }}
              onFocus={() => setDesktopSearchFocused(true)}
              onBlur={() => setDesktopSearchFocused(false)}
              onMouseDown={() => {
                armSearchBundle();
                setDesktopSearchArmed(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Tab') return;
                if (!desktopSearchArmed) setDesktopSearchArmed(true);
                if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
                  setDesktopSearchInteracted(true);
                }
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setPopoverOpen(false);
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              name="global-search-input"
              className="pl-9 pr-16"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden h-5 -translate-y-1/2 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </PopoverTrigger>
        <PopoverContent
          className="w-[min(36rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] border-border/80 p-0 shadow-lg"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false} className="rounded-lg bg-popover">
            <GlobalSearchPanelLazy
              enabled={searchPanelEnabled}
              layout="popover"
              grouped={groupedSearch}
              loading={searchLoading}
              query={panelQuery}
              visibility={searchVisibility}
              searchError={searchError}
              onOpenHref={handleOpenHref}
              onChatClient={canChatClients ? handleChatClient : undefined}
              onChatLead={canChatLeads ? handleChatLead : undefined}
              onNewInvoiceClient={canNewInvoiceFromClient ? handleNewInvoiceClient : undefined}
              onCreateClient={canCreateClientFromSearch ? handleCreateClientFromSearch : undefined}
            />
          </Command>
        </PopoverContent>
      </Popover>

      <CommandDialog
        open={commandDialogOpen}
        onOpenChange={(open) => {
          setCommandDialogOpen(open);
          if (open) {
            armSearchBundle();
            setCommandSearchQuery('');
            setCommandSearchInteracted(false);
            setCommandSearchFocused(false);
            setCommandSearchArmed(false);
          }
        }}
      >
        <CommandInput
          placeholder="Digite para buscar (mín. 2 caracteres)…"
          value={commandSearchQuery}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          name="global-search-command-input"
          onFocus={() => setCommandSearchFocused(true)}
          onBlur={() => setCommandSearchFocused(false)}
          onMouseDown={() => setCommandSearchArmed(true)}
          onKeyDown={() => setCommandSearchArmed(true)}
          onValueChange={(v) => {
            if (!commandDialogOpen || !commandSearchFocused || !commandSearchArmed) return;
            setCommandSearchInteracted(true);
            setCommandSearchQuery(v);
          }}
        />
        <GlobalSearchPanelLazy
          enabled={searchPanelEnabled}
          layout="dialog"
          grouped={groupedSearch}
          loading={searchLoading}
          query={panelQuery}
          visibility={searchVisibility}
          searchError={searchError}
          onOpenHref={handleOpenHref}
          onChatClient={canChatClients ? handleChatClient : undefined}
          onChatLead={canChatLeads ? handleChatLead : undefined}
          onNewInvoiceClient={canNewInvoiceFromClient ? handleNewInvoiceClient : undefined}
          onCreateClient={canCreateClientFromSearch ? handleCreateClientFromSearch : undefined}
        />
      </CommandDialog>
    </>
  );
}

/** Busca global + command palette — renderizado via portal no slot do header. */
export default function GlobalSearchOverlay() {
  const { slotRef } = useGlobalSearchSlot();
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    if (slotRef?.current) setMounted(true);
  }, [slotRef]);

  if (!mounted || !slotRef?.current) return null;

  return createPortal(
    <>
      <GlobalSearchRegion />
    </>,
    slotRef.current,
  );
}
