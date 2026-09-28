import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Settings,
  LogOut,
  CreditCard,
  ShieldCheck,
  LifeBuoy,
  Newspaper,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { HeaderNotificationBell } from '@/components/layout/HeaderNotificationBell';

type HeaderProfileClusterProps = {
  displayName: string;
  initials: string;
  headerAvatarSrc: string | null;
  notifUnread: number;
  updatesUnread: number;
  user: {
    email?: string | null;
    can_manage_plan?: boolean;
    is_super_admin?: boolean;
  } | null;
  canView: (moduleId: string) => boolean;
  signOut: () => void;
};

/** Cluster direito do header (tema, notificações, perfil) — estável entre navegações de rota. */
export const HeaderProfileCluster = React.memo(function HeaderProfileCluster({
  displayName,
  initials,
  headerAvatarSrc,
  notifUnread,
  updatesUnread,
  user,
  canView,
  signOut,
}: HeaderProfileClusterProps) {
  const navigate = useNavigate();

  const profileNav = useMemo(
    () => ({
      profile: () => navigate('/profile'),
      updates: () => navigate('/updates'),
      settings: () => navigate('/settings'),
      support: () => navigate('/suporte'),
      plan: () => navigate('/meu-plano'),
      superAdmin: () => navigate('/superadmin'),
    }),
    [navigate],
  );

  return (
    <>
      <ThemeToggle />
      <HeaderNotificationBell unreadCount={notifUnread} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-9 max-w-[min(100%,14rem)] gap-2 rounded-lg px-2 hover:bg-accent/80">
            <Avatar className="h-8 w-8 shrink-0">
              {headerAvatarSrc ? (
                <AvatarImage src={headerAvatarSrc} alt="" className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-crm-primary font-medium text-xs text-white">
                {initials || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="hidden min-w-0 truncate font-medium md:inline">{displayName}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 rounded-xl border-border/60 p-1 shadow-md">
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium leading-tight">{displayName}</p>
            {user?.email ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
            ) : null}
          </div>
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={profileNav.profile}>
            <User className="mr-2 h-4 w-4 shrink-0" />
            <span>Perfil</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer rounded-lg gap-2" onClick={profileNav.updates}>
            <Newspaper className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex-1">Atualizações</span>
            {updatesUnread > 0 ? (
              <span className="flex shrink-0 items-center gap-2">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" title="Novidades não lidas" aria-hidden />
                <Badge
                  variant="secondary"
                  className="h-5 min-w-[1.25rem] justify-center px-1.5 text-[10px] font-medium tabular-nums"
                >
                  {updatesUnread > 99 ? '99+' : updatesUnread}
                </Badge>
              </span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={profileNav.settings}>
            <Settings className="mr-2 h-4 w-4 shrink-0" />
            <span>Configurações</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={profileNav.support}>
            <LifeBuoy className="mr-2 h-4 w-4 shrink-0" />
            <span>Suporte</span>
          </DropdownMenuItem>
          {user?.can_manage_plan && canView('meu_plano') ? (
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={profileNav.plan}>
              <CreditCard className="mr-2 h-4 w-4 shrink-0" />
              <span>Planos</span>
            </DropdownMenuItem>
          ) : null}
          {user?.is_super_admin ? (
            <DropdownMenuItem className="cursor-pointer rounded-lg" onClick={profileNav.superAdmin}>
              <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />
              <span>Super Admin</span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator className="my-1" />
          <DropdownMenuItem
            className="cursor-pointer rounded-lg text-destructive focus:text-destructive"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4 shrink-0" />
            <span>Sair</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
});
