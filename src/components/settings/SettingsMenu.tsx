
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Building, 
  Users, 
  CreditCard, 
  Bell, 
  Settings, 
  PanelLeft, 
  Folder, 
  Tags, 
  Users2,
  MessageSquare, 
  Globe,
  FileText,
  Shield,
  LayoutTemplate,
  Calendar,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SettingSection = 
  | "companyData" 
  | "users" 
  | "teams"
  | "userManagement"
  | "billing" 
  | "notifications" 
  | "security" 
  | "preferences" 
  | "leadsConfig" 
  | "clientGroups"
  | "whatsapp"
  | "chatTemplates"
  | "domain"
  | "messageTemplates"
  | "paymentGateway"
  | "googleCalendar"
  | "agendaAvailability"
  | "chatAttendance"
  | "chatAutomation";

interface SettingsMenuProps {
  activeSection: SettingSection;
  onSelect: (section: SettingSection) => void;
}

interface MenuItem {
  id: SettingSection;
  label: string;
  icon: React.ReactNode;
  category?: string;
  /** Subtítulo dentro da categoria (ex.: Integrações → Mensagens, Web, …). */
  subcategory?: string;
}

const INTEGRATIONS_SUBCATEGORY_ORDER = [
  "Mensagens",
  "Marca e domínio",
  "Modelos (CRM)",
  "Recebimentos",
  "Agenda",
] as const;

const CHAT_AUTOMATION_UI_ENABLED = import.meta.env.VITE_CHAT_AUTOMATION_ENABLED === "true";

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ activeSection, onSelect }) => {
  const location = useLocation();
  const isPaymentsRoute = location.pathname.startsWith("/settings/payments");

  // Definir itens do menu agrupados por categoria
  const menuItems: MenuItem[] = [
    { id: "companyData", label: "Dados da Empresa", icon: <Building className="h-4 w-4" />, category: "Geral" },
    { id: "billing", label: "Cobrança", icon: <CreditCard className="h-4 w-4" />, category: "Geral" },
    { id: "users", label: "Usuários", icon: <Users className="h-4 w-4" />, category: "Usuários e Acesso" },
    { id: "teams", label: "Equipes", icon: <Users2 className="h-4 w-4" />, category: "Usuários e Acesso" },
    { id: "userManagement", label: "Perfis de acesso", icon: <Shield className="h-4 w-4" />, category: "Usuários e Acesso" },
    { id: "notifications", label: "Notificações", icon: <Bell className="h-4 w-4" />, category: "Preferências" },
    { id: "security", label: "Segurança", icon: <Settings className="h-4 w-4" />, category: "Preferências" },
    { id: "preferences", label: "Aparência", icon: <PanelLeft className="h-4 w-4" />, category: "Preferências" },
    { id: "leadsConfig", label: "Configuração de Leads", icon: <Folder className="h-4 w-4" />, category: "CRM" },
    { id: "clientGroups", label: "Grupos de Clientes", icon: <Tags className="h-4 w-4" />, category: "CRM" },
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: <MessageSquare className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Mensagens",
    },
    {
      id: "chatTemplates",
      label: "Templates WhatsApp",
      icon: <LayoutTemplate className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Mensagens",
    },
    {
      id: "chatAttendance",
      label: "Chat e atendimento",
      icon: <MessageSquare className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Mensagens",
    },
    ...(CHAT_AUTOMATION_UI_ENABLED
      ? ([
          {
            id: "chatAutomation" as const,
            label: "Automação do chat (bot)",
            icon: <Bot className="h-4 w-4" />,
            category: "Integrações",
            subcategory: "Mensagens",
          },
        ] as MenuItem[])
      : []),
    {
      id: "domain",
      label: "Domínio",
      icon: <Globe className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Marca e domínio",
    },
    {
      id: "messageTemplates",
      label: "Modelos de mensagem (CRM)",
      icon: <FileText className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Modelos (CRM)",
    },
    {
      id: "paymentGateway",
      label: "Pagamentos",
      icon: <CreditCard className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Recebimentos",
    },
    {
      id: "googleCalendar",
      label: "Google Agenda",
      icon: <Calendar className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Agenda",
    },
    {
      id: "agendaAvailability",
      label: "Disponibilidade da agenda",
      icon: <Calendar className="h-4 w-4" />,
      category: "Integrações",
      subcategory: "Agenda",
    },
  ];

  // Agrupar itens por categoria
  const categorizedItems = menuItems.reduce((acc: Record<string, MenuItem[]>, item) => {
    const category = item.category || "Outros";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  // Ordem das categorias
  const categoryOrder = ["Geral", "Usuários e Acesso", "Preferências", "CRM", "Integrações", "Outros"];

  const integrationSubOrder = INTEGRATIONS_SUBCATEGORY_ORDER as readonly string[];

  const renderMenuButton = (item: MenuItem) => {
    const isPaymentLink = item.id === "paymentGateway";
    const isActive = isPaymentLink ? isPaymentsRoute : activeSection === item.id;
    if (isPaymentLink) {
      return (
        <Button
          key={item.id}
          variant={isActive ? "secondary" : "ghost"}
          className={cn(
            "w-full shrink-0 justify-start max-md:min-h-10 max-md:min-w-[11rem] max-md:text-left",
            isActive && "bg-secondary",
          )}
          asChild
        >
          <Link to="/settings/payments">
            {item.icon}
            <span className="ml-2">{item.label}</span>
          </Link>
        </Button>
      );
    }
    return (
      <Button
        key={item.id}
        variant={activeSection === item.id ? "secondary" : "ghost"}
        className={cn(
          "w-full shrink-0 justify-start max-md:min-h-10 max-md:min-w-[11rem] max-md:text-left",
          activeSection === item.id && "bg-secondary",
        )}
        onClick={() => onSelect(item.id)}
      >
        {item.icon}
        <span className="ml-2">{item.label}</span>
      </Button>
    );
  };

  return (
    <div className="h-full w-full rounded-md border-0 bg-transparent shadow-none md:rounded-md md:border md:border-border md:bg-card md:shadow-sm">
      <div className="p-3 md:p-4">
        {categoryOrder.map(category => {
          const items = categorizedItems[category];
          if (!items) return null;

          return (
            <div key={category} className="mb-6 last:mb-0">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
              {category === "Integrações" ? (
                <div className="space-y-3">
                  {INTEGRATIONS_SUBCATEGORY_ORDER.map((sub) => {
                    const subItems = items.filter((i) => i.subcategory === sub);
                    if (subItems.length === 0) return null;
                    return (
                      <div key={sub}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-1.5 pl-0.5">
                          {sub}
                        </p>
                        <div className="space-y-1">{subItems.map(renderMenuButton)}</div>
                      </div>
                    );
                  })}
                  {(() => {
                    const rest = items.filter(
                      (i) => !i.subcategory || !integrationSubOrder.includes(i.subcategory),
                    );
                    if (rest.length === 0) return null;
                    return (
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 mb-1.5 pl-0.5">
                          Outros
                        </p>
                        <div className="space-y-1">{rest.map(renderMenuButton)}</div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-1">{items.map(renderMenuButton)}</div>
              )}
              {category !== categoryOrder[categoryOrder.length - 1] && (
                <Separator className="my-4" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
