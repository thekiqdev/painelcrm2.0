import React, { useMemo } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
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
  History,
  FileText,
  CalendarSync,
  PieChart,
  FolderOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { chatOpenQueryFromClientProfile } from "@/lib/chatListNavigation";
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
  /** Mostrar bloco comercial/financeiro (faturas, assinaturas, resumo financeiro). */
  showBilling?: boolean;
  /** CRM — exibido no topo mobile junto ao nome. */
  clientStatus?: string | null;
  clientCompany?: string | null;
}

type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  description: string;
};

export const ClientSidebar: React.FC<ClientSidebarProps> = ({
  clientId,
  clientName,
  collapsed = false,
  avatarSrc,
  avatarInitials = "?",
  phone,
  backFromChat = false,
  showBilling = false,
  clientStatus,
  clientCompany,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = useMemo((): MenuItem[] => {
    const base = `/clients/${clientId}`;
    const billing: MenuItem[] = showBilling
      ? [
          {
            id: "invoices",
            label: "Faturas",
            icon: FileText,
            path: `${base}/invoices`,
            description: "Faturas e cobranças do cliente",
          },
          {
            id: "subscriptions",
            label: "Assinaturas",
            icon: CalendarSync,
            path: `${base}/subscriptions`,
            description: "Assinaturas CRM",
          },
          {
            id: "finance",
            label: "Financeiro",
            icon: PieChart,
            path: `${base}/finance`,
            description: "Resumo financeiro consolidado",
          },
        ]
      : [];

    return [
      {
        id: "overview",
        label: "Resumo",
        icon: User,
        path: base,
        description: "Visão geral e cadastro",
      },
      ...billing,
      {
        id: "tasks",
        label: "Tarefas",
        icon: CheckSquare,
        path: `${base}/tasks`,
        description: "Tarefas relacionadas",
      },
      {
        id: "opportunities",
        label: "Propostas",
        icon: Briefcase,
        path: `${base}/opportunities`,
        description: "Propostas comerciais",
      },
      {
        id: "contracts",
        label: "Contratos",
        icon: FileCheck,
        path: `${base}/contracts`,
        description: "Contratos e documentos",
      },
      {
        id: "files",
        label: "Arquivos",
        icon: FolderOpen,
        path: `${base}/files`,
        description: "Pastas no Google Drive",
      },
      {
        id: "messages",
        label: "Conversa",
        icon: MessageSquare,
        path: `${base}/messages`,
        description: "WhatsApp com o cliente",
      },
      {
        id: "notes",
        label: "Anotações",
        icon: StickyNote,
        path: `${base}/notes`,
        description: "Notas autoadesivas",
      },
      {
        id: "timeline",
        label: "Timeline",
        icon: History,
        path: `${base}/timeline`,
        description: "Linha do tempo de eventos",
      },
      {
        id: "calendar",
        label: "Agenda",
        icon: Calendar,
        path: `${base}/calendar`,
        description: "Eventos e compromissos",
      },
      {
        id: "settings",
        label: "Configurações",
        icon: Settings,
        path: `${base}/settings`,
        description: "Configurações do cliente",
      },
    ];
  }, [clientId, showBilling]);

  const isActive = (path: string) => {
    if (path === `/clients/${clientId}`) {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const mobileNavItems = useMemo(
    () => menuItems.filter((item) => item.id !== "messages"),
    [menuItems],
  );

  const mobileSecondary =
    [phone?.trim(), clientCompany?.trim()].filter(Boolean).join(" · ") || null;

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
                "text-muted-foreground",
              )}
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{backFromChat ? "Voltar ao chat" : "Voltar para Clientes"}</span>}
            </button>
          </div>
        </SidebarGroup>

        {/* Topo — desktop (sidebar estreita) */}
        <SidebarGroup className="hidden p-0 lg:block">
          <div className={cn("flex items-start gap-2.5 px-2 py-2", collapsed && "justify-center px-1")} title={collapsed ? clientName : undefined}>
            <Avatar className="h-10 w-10 shrink-0">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={clientName} /> : null}
              <AvatarFallback>{avatarInitials}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">{clientName}</h2>
                {phone ? (
                  <p className="mt-1 truncate text-xs text-muted-foreground" title={phone}>
                    {phone}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </SidebarGroup>

        {/* Topo compacto + CTA — mobile */}
        <SidebarGroup className="p-0 lg:hidden">
          <div className="flex items-start gap-2.5 px-2 pb-1 pt-1">
            <Avatar className="h-11 w-11 shrink-0 border border-border/60">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt={clientName} /> : null}
              <AvatarFallback>{avatarInitials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="truncate text-[15px] font-semibold leading-tight">{clientName}</h2>
                <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px] font-medium">
                  {clientStatus?.trim() || "Ativo"}
                </Badge>
              </div>
              {mobileSecondary ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground" title={mobileSecondary}>
                  {mobileSecondary}
                </p>
              ) : null}
            </div>
          </div>
          <div className="px-2 pb-2">
            <Button asChild className="h-10 w-full font-semibold shadow-sm" size="default">
              <Link to={`/chat${chatOpenQueryFromClientProfile(clientId)}`}>
                <MessageSquare className="mr-2 h-4 w-4 shrink-0" />
                Ir para conversa
              </Link>
            </Button>
          </div>
        </SidebarGroup>

        {/* Navegação mobile: chips (sem aba Conversa) */}
        <SidebarGroup className="p-0 lg:hidden">
          <div className="flex gap-1.5 overflow-x-auto px-2 pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mobileNavItems.map((item) => {
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
                  {item.id === "overview" ? "Visão geral" : item.label}
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
                      className={cn("w-full justify-start", active && "bg-accent text-accent-foreground")}
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
                        className="flex w-full items-center gap-2"
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
