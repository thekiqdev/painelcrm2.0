
import React from "react";
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
  UserCog,
  Users2, 
  MessageSquare, 
  Globe,
  FileText,
  Shield
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
  | "collaborators" 
  | "whatsapp" 
  | "domain" 
  | "messageTemplates";

interface SettingsMenuProps {
  activeSection: SettingSection;
  onSelect: (section: SettingSection) => void;
}

interface MenuItem {
  id: SettingSection;
  label: string;
  icon: React.ReactNode;
  category?: string;
}

export const SettingsMenu: React.FC<SettingsMenuProps> = ({ activeSection, onSelect }) => {
  // Definir itens do menu agrupados por categoria
  const menuItems: MenuItem[] = [
    // Usuários e Acesso
    { id: "users", label: "Usuários", icon: <Users className="h-4 w-4" />, category: "Usuários e Acesso" },
    { id: "teams", label: "Equipes", icon: <Users2 className="h-4 w-4" />, category: "Usuários e Acesso" },
    { id: "userManagement", label: "Perfis de acesso", icon: <Shield className="h-4 w-4" />, category: "Usuários e Acesso" },
    // Categoria Geral
    { id: "companyData", label: "Dados da Empresa", icon: <Building className="h-4 w-4" />, category: "Geral" },
    { id: "billing", label: "Cobrança", icon: <CreditCard className="h-4 w-4" />, category: "Geral" },
    
    // Categoria Preferências
    { id: "notifications", label: "Notificações", icon: <Bell className="h-4 w-4" />, category: "Preferências" },
    { id: "security", label: "Segurança", icon: <Settings className="h-4 w-4" />, category: "Preferências" },
    { id: "preferences", label: "Aparência", icon: <PanelLeft className="h-4 w-4" />, category: "Preferências" },
    
    // Categoria CRM
    { id: "leadsConfig", label: "Configuração de Leads", icon: <Folder className="h-4 w-4" />, category: "CRM" },
    { id: "clientGroups", label: "Grupos de Clientes", icon: <Tags className="h-4 w-4" />, category: "CRM" },
    { id: "collaborators", label: "Colaboradores", icon: <Users2 className="h-4 w-4" />, category: "CRM" },
    
    // Categoria Integrações
    { id: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-4 w-4" />, category: "Integrações" },
    { id: "domain", label: "Domínio", icon: <Globe className="h-4 w-4" />, category: "Integrações" },
    { id: "messageTemplates", label: "Modelos de Mensagens", icon: <FileText className="h-4 w-4" />, category: "Integrações" }
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
  const categoryOrder = ["Usuários e Acesso", "Geral", "Preferências", "CRM", "Integrações", "Outros"];

  return (
    <div className="w-full h-full border rounded-md">
      <div className="p-4">
        {categoryOrder.map(category => {
          const items = categorizedItems[category];
          if (!items) return null;
          
          return (
            <div key={category} className="mb-6 last:mb-0">
              <h4 className="text-sm font-medium text-muted-foreground mb-2">{category}</h4>
              <div className="space-y-1">
                {items.map(item => (
                  <Button
                    key={item.id}
                    variant={activeSection === item.id ? "secondary" : "ghost"}
                    className={cn(
                      "w-full justify-start",
                      activeSection === item.id && "bg-secondary"
                    )}
                    onClick={() => onSelect(item.id)}
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Button>
                ))}
              </div>
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
