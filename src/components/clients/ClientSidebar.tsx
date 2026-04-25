import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { 
  ArrowLeft, 
  User, 
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
      label: "Propostas", 
      icon: Briefcase, 
      path: `/clients/${clientId}/opportunities`,
      description: "Propostas comerciais"
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
    <div className="flex h-full min-h-0 flex-col">
      <SidebarContent className="min-h-0 flex-1">
        {/* Header com botão voltar */}
        <SidebarGroup className="p-0">
          <div className="border-b border-border/70 px-2 pb-1.5 pt-1">
            <button
              type="button"
              onClick={() => navigateBackFromClientProfile(navigate, location)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors",
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
        <SidebarGroup className="p-0">
          <div
            className={cn("flex items-start gap-2.5 px-2 py-2", collapsed && "justify-center px-1")}
            title={collapsed ? clientName : undefined}
          >
            <Avatar className="h-10 w-10 shrink-0">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={clientName} /> : null}
              <AvatarFallback>{avatarInitials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-base truncate">{clientName}</h2>
                {phone ? (
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={phone}>
                    {phone}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </SidebarGroup>

        {/* Navegação mobile: chips horizontais (evita lista longa antes do conteúdo) */}
        <SidebarGroup className="p-0 lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto px-2 pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {menuItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={`m-${item.id}`}
                  type="button"
                  onClick={() =>
                    navigate({
                      pathname: item.path,
                      search: location.search,
                      state: location.state,
                    })
                  }
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </SidebarGroup>

        {/* Navegação desktop */}
        <SidebarGroup className="hidden lg:block">
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

