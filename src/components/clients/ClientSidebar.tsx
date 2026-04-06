import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
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
  Settings,
  History
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { navigateBackFromClientProfile } from "@/utils/clientProfileNavigation";

interface ClientSidebarProps {
  clientId: string;
  clientName: string;
  collapsed?: boolean;
  /** URL resolvida: CRM ou WhatsApp (não persiste no cadastro) */
  avatarSrc?: string | null;
  avatarInitials?: string;
  phone?: string | null;
  /** Perfil aberto a partir do chat (voltar retorna ao chat com conversa). */
  backFromChat?: boolean;
}

export const ClientSidebar: React.FC<ClientSidebarProps> = ({
  clientId,
  clientName,
  collapsed = false,
  avatarSrc,
  avatarInitials = "?",
  phone,
  backFromChat = false,
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
      id: "timeline",
      label: "Timeline",
      icon: History,
      path: `/clients/${clientId}/timeline`,
      description: "Linha do tempo de eventos"
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
    <div className="h-full flex flex-col">
      <SidebarContent className="flex-1">
        {/* Header com botão voltar */}
        <SidebarGroup>
          <div className="px-2 py-4 border-b">
            <button
              type="button"
              onClick={() => navigateBackFromClientProfile(navigate, location)}
              className={cn(
                "flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "text-muted-foreground"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              {!collapsed && (
                <span>{backFromChat ? "Voltar ao chat" : "Voltar para Clientes"}</span>
              )}
            </button>
          </div>
        </SidebarGroup>

        {/* Nome do cliente */}
        <SidebarGroup>
          <div
            className={cn("px-2 py-3 flex gap-3 items-start", collapsed && "justify-center px-1")}
            title={collapsed ? clientName : undefined}
          >
            <Avatar className="h-10 w-10 shrink-0">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={clientName} /> : null}
              <AvatarFallback>{avatarInitials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-base truncate">{clientName}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Perfil do Cliente</p>
                {phone ? (
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={phone}>
                    {phone}
                  </p>
                ) : null}
              </div>
            )}
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
                        type="button"
                        onClick={() =>
                          navigate({
                            pathname: item.path,
                            search: location.search,
                            state: location.state,
                          })
                        }
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
    </div>
  );
};

export default ClientSidebar;

