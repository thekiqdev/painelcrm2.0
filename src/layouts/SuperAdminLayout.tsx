import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  Flag,
  LogOut,
  ScrollText,
  BarChart3,
  UserCog,
  Bell,
  CreditCard,
  Settings2,
  Building2,
  Repeat2,
  Receipt,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
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

const getNavClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? 'bg-crm-primary/10 text-crm-primary font-medium shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.22)] dark:bg-crm-primary/18 dark:text-crm-primary dark:shadow-[inset_0_0_0_1px_hsl(221_83%_53%/0.35)]'
    : 'hover:bg-muted/50 dark:hover:bg-sidebar-accent/95';

export default function SuperAdminLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-muted/30">
        <Sidebar className="w-64 border-r border-sidebar-border">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold text-crm-primary">Super Admin</h1>
          <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
        </div>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Painel</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin" end className={getNavClass}>
                      <LayoutDashboard className="mr-2 h-5 w-5" />
                      <span>Dashboard</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/plans" className={getNavClass}>
                      <Package className="mr-2 h-5 w-5" />
                      <span>Planos</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/clients" className={getNavClass}>
                      <Users className="mr-2 h-5 w-5" />
                      <span>Empresas</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/platform-billings" className={getNavClass}>
                      <Receipt className="mr-2 h-5 w-5" />
                      <span>Cobranças da plataforma</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/features" className={getNavClass}>
                      <Flag className="mr-2 h-5 w-5" />
                      <span>Features</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/audit" className={getNavClass}>
                      <ScrollText className="mr-2 h-5 w-5" />
                      <span>Auditoria</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/reports" className={getNavClass}>
                      <BarChart3 className="mr-2 h-5 w-5" />
                      <span>Relatórios</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/users" className={getNavClass}>
                      <UserCog className="mr-2 h-5 w-5" />
                      <span>Super Admins</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/notifications" className={getNavClass}>
                      <Bell className="mr-2 h-5 w-5" />
                      <span>Notificações</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Configurações</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/pagamentos" className={getNavClass}>
                      <CreditCard className="mr-2 h-5 w-5" />
                      <span>Pagamentos</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/platform-notifications" className={getNavClass}>
                      <Building2 className="mr-2 h-5 w-5" />
                      <span>Notificações da plataforma</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/notifications-engine" className={getNavClass}>
                      <Settings2 className="mr-2 h-5 w-5" />
                      <span>Motor CRM (tenants)</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink to="/superadmin/subscription-cycles" className={getNavClass}>
                      <Repeat2 className="mr-2 h-5 w-5" />
                      <span>Ciclos de assinatura</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <div className="p-4 border-t">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => navigate('/dashboard')}
          >
            Voltar ao painel
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start mt-2 text-muted-foreground"
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
