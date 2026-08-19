import React, { Suspense } from 'react';
import { LogOut, Menu } from 'lucide-react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { PartnerPanelProvider, usePartnerPanel } from './PartnerPanelContext';
import {
  isPartnerNavActive,
  partnerAdminNavGroups,
  partnerSellerNavItems,
} from './partnerNavConfig';

function PartnerNavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const { me, isAdmin } = usePartnerPanel();
  const { pathname } = useLocation();

  if (!me) return null;

  if (!isAdmin) {
    return (
      <nav className={cn('flex flex-col gap-1', className)} aria-label="Painel do revendedor">
        {partnerSellerNavItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={() =>
              cn(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isPartnerNavActive(pathname, to, end)
                  ? 'bg-crm-primary/12 text-crm-primary shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.2)]'
                  : 'text-muted-foreground hover:bg-muted/80'
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            {label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className={cn('flex flex-col gap-4', className)} aria-label="Painel do revendedor">
      {partnerAdminNavGroups.map((group) => (
        <div key={group.id} className="space-y-1">
          {group.id !== 'home' ? (
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          ) : null}
          {group.items.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              className={() =>
                cn(
                  'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isPartnerNavActive(pathname, to, end)
                    ? 'bg-crm-primary/12 text-crm-primary shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.2)]'
                    : 'text-muted-foreground hover:bg-muted/80'
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function PartnerHorizontalTabs() {
  const { isAdmin } = usePartnerPanel();
  const items = isAdmin
    ? partnerAdminNavGroups.flatMap((g) => g.items)
    : partnerSellerNavItems;

  return (
    <nav
      className={cn(
        'flex gap-1 rounded-lg border bg-card/80 p-1 shadow-sm md:hidden',
        'flex-nowrap overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]',
        'scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
      )}
      aria-label="Seções do painel"
    >
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-2 text-xs font-medium transition-colors',
              isActive
                ? 'bg-crm-primary/12 text-crm-primary shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.2)]'
                : 'text-muted-foreground hover:bg-muted/80'
            )
          }
        >
          <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function PartnerLayoutInner() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { me, loading, error } = usePartnerPanel();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetHeader className="border-b px-4 py-3 text-left">
                  <SheetTitle className="text-base">Painel do Revendedor</SheetTitle>
                </SheetHeader>
                <div className="p-3">
                  <PartnerNavLinks onNavigate={() => setMobileOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-primary/90">
                White Label
              </p>
              <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">
                Painel do Revendedor
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                Gerencie sua marca, vendas, clientes e configurações do seu canal.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {me ? (
              <Badge variant="outline" className="hidden sm:inline-flex">
                {me.role === 'partner_admin' ? 'Admin' : 'Vendedor'}
              </Badge>
            ) : null}
            <span className="hidden max-w-[160px] truncate text-xs text-muted-foreground lg:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
              CRM
            </Button>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} title="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-4 md:px-6 md:py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <div className="sticky top-[5.5rem] rounded-lg border bg-card/80 p-3 shadow-sm">
            {me?.profile.product_name ? (
              <p className="mb-3 truncate px-3 text-xs font-medium text-foreground">
                {me.profile.public_name || me.profile.product_name}
              </p>
            ) : null}
            <PartnerNavLinks />
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-4 md:space-y-6">
          <PartnerHorizontalTabs />
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Skeleton className="h-[72px] rounded-xl" />
                <Skeleton className="h-[72px] rounded-xl" />
                <Skeleton className="h-[72px] rounded-xl" />
                <Skeleton className="h-[72px] rounded-xl" />
              </div>
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <h2 className="text-base font-semibold">Acesso ao canal</h2>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="py-12 text-center text-sm text-muted-foreground">
                  Carregando seção…
                </div>
              }
            >
              <Outlet />
            </Suspense>
          )}
        </main>
      </div>
    </div>
  );
}

export default function PartnerLayout() {
  return (
    <PartnerPanelProvider>
      <PartnerLayoutInner />
    </PartnerPanelProvider>
  );
}
