import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSuperadminPlatformSupportSummary } from '@/hooks/useSuperadminPlatformSupportSummary';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from '@/components/ui/sidebar';
import { superAdminNavGroups } from '@/layouts/superadminNavConfig';

const getNavClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'bg-crm-primary/10 text-crm-primary font-medium shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.22)] dark:bg-crm-primary/18 dark:text-crm-primary dark:shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.35)]'
    : 'hover:bg-muted/50 dark:hover:bg-sidebar-accent/95';

export default function SuperAdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { summary, pendingCount } = useSuperadminPlatformSupportSummary();
  const supportBadgeCount = pendingCount > 0 ? pendingCount : summary?.urgent ? summary.urgent : 0;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-muted/30">
        <Sidebar className="w-64 border-r border-sidebar-border">
          <div className="border-b p-4">
            <h1 className="text-lg font-bold text-crm-primary">Super Admin</h1>
            <p className="mt-1 text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <SidebarContent>
            {superAdminNavGroups.map((group) => (
              <SidebarGroup key={group.id}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <SidebarMenuItem key={`${group.id}-${item.to}`}>
                          <SidebarMenuButton asChild>
                            <NavLink to={item.to} end={item.end === true} className={getNavClass}>
                              <Icon className="mr-2 h-5 w-5 shrink-0" />
                              <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                <span className="truncate">{item.label}</span>
                                {item.to === '/superadmin/platform-support' && supportBadgeCount > 0 ? (
                                  <Badge
                                    variant="outline"
                                    className={
                                      (summary?.urgent ?? 0) > 0
                                        ? 'border-destructive/35 bg-destructive/10 px-1.5 text-[10px] font-semibold text-destructive'
                                        : 'border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200'
                                    }
                                  >
                                    {supportBadgeCount > 99 ? '99+' : supportBadgeCount}
                                  </Badge>
                                ) : null}
                              </span>
                            </NavLink>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </SidebarContent>
          <div className="border-t p-4">
            <Button variant="ghost" className="w-full justify-start" onClick={() => navigate('/dashboard')}>
              Voltar ao painel
            </Button>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start text-muted-foreground"
              onClick={signOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </Sidebar>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  );
}
