import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { 
  ArrowLeft, 
  User, 
  FileText, 
  CheckSquare, 
  StickyNote,
  Briefcase,
  MessageSquare,
  Calendar,
  DollarSign,
  FileCheck,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ClientSidebarProps {
  clientId: string;
  clientName: string;
  collapsed?: boolean;
}

export const ClientSidebar: React.FC<ClientSidebarProps> = ({
  clientId,
  clientName,
  collapsed = false,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { 
      id: "overview", 
      label: "Visão Geral", 
      icon: User, 
      path: `/clients/${clientId}`,
      description: "Informações principais do cliente"
    },
    { 
      id: "details", 
      label: "Detalhes", 
      icon: FileText, 
      path: `/clients/${clientId}/details`,
      description: "Dados completos do cliente"
    },
    { 
      id: "tasks", 
      label: "Tarefas", 
      icon: CheckSquare, 
      path: `/clients/${clientId}/tasks`,
      description: "Tarefas relacionadas"
    },
    { 
      id: "notes", 
      label: "Anotações", 
      icon: StickyNote, 
      path: `/clients/${clientId}/notes`,
      description: "Notas autoadesivas"
    },
    { 
      id: "opportunities", 
      label: "Oportunidades", 
      icon: Briefcase, 
      path: `/clients/${clientId}/opportunities`,
      description: "Oportunidades de negócio"
    },
    { 
      id: "messages", 
      label: "Mensagens", 
      icon: MessageSquare, 
      path: `/clients/${clientId}/messages`,
      description: "Histórico de conversas"
    },
    { 
      id: "calendar", 
      label: "Agenda", 
      icon: Calendar, 
      path: `/clients/${clientId}/calendar`,
      description: "Eventos e compromissos"
    },
    { 
      id: "finance", 
      label: "Financeiro", 
      icon: DollarSign, 
      path: `/clients/${clientId}/finance`,
      description: "Faturas e pagamentos"
    },
    { 
      id: "contracts", 
      label: "Contratos", 
      icon: FileCheck, 
      path: `/clients/${clientId}/contracts`,
      description: "Contratos e documentos"
    },
    { 
      id: "settings", 
      label: "Configurações", 
      icon: Settings, 
      path: `/clients/${clientId}/settings`,
      description: "Configurações do cliente"
    },
  ];

  const isActive = (path: string) => {
    if (path === `/clients/${clientId}`) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar className="border-r">
      <SidebarContent>
        {/* Header com botão voltar */}
        <SidebarGroup>
          <div className="px-2 py-4 border-b">
            <button
              onClick={() => navigate("/clients")}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "text-muted-foreground"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              {!collapsed && <span>Voltar para Clientes</span>}
            </button>
          </div>
        </SidebarGroup>

        {/* Nome do cliente */}
        <SidebarGroup>
          <div className="px-2 py-3">
            <h2 className={cn(
              "font-semibold text-base truncate",
              collapsed && "sr-only"
            )}>
              {clientName}
            </h2>
            <p className={cn(
              "text-xs text-muted-foreground mt-1",
              collapsed && "sr-only"
            )}>
              Perfil do Cliente
            </p>
          </div>
        </SidebarGroup>

        {/* Menu de navegação */}
        <SidebarGroup>
          <SidebarGroupLabel className={collapsed ? "sr-only" : ""}>
            Menu
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className={cn(
                        "w-full justify-start",
                        active && "bg-accent text-accent-foreground"
                      )}
                    >
                      <button
                        onClick={() => navigate(item.path)}
                        className="flex items-center gap-2 w-full"
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};

export default ClientSidebar;

