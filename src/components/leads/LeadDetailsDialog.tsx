
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit } from "lucide-react";

// Import our sub-components
import LeadTasksTab from "./tabs/LeadTasksTab";
import LeadNotesTab from "./tabs/LeadNotesTab";
import LeadOpportunitiesTab from "./tabs/LeadOpportunitiesTab";
import { chatService } from "@/services/chat";
import { resolveProfileAvatarUrl } from "@/utils/chatIdentityDisplay";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface LeadDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  lead: any | null;
  tasks: any[];
  getStatusVariant: (status: string) => { color: string };
  onEditLead: (lead: any) => void;
  onTabChange: (tab: string) => void;
  activeTab: string;
  onConvertToClient: () => void;
  onAddTask: (values: any) => void;
  onUpdateTaskStatus: (taskId: string, status: string) => void;
  onSaveNote: (values: { content: string }) => void;
}

const LeadDetailsDialog: React.FC<LeadDetailsDialogProps> = ({
  isOpen,
  onClose,
  lead,
  tasks,
  getStatusVariant,
  onEditLead,
  onTabChange,
  activeTab,
  onConvertToClient,
  onAddTask,
  onUpdateTaskStatus,
  onSaveNote,
}) => {
  const [whatsappAvatarUrl, setWhatsappAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (lead?.id) {
      setWhatsappAvatarUrl(lead.whatsapp_avatar_url ?? null);
    }
  }, [lead?.id, lead?.whatsapp_avatar_url]);

  useEffect(() => {
    if (!isOpen || !lead?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await chatService.getCrmWhatsappIdentity({ leadId: lead.id });
        if (!cancelled) {
          setWhatsappAvatarUrl((prev) => r.avatarUrl ?? prev ?? lead.whatsapp_avatar_url ?? null);
        }
      } catch {
        if (!cancelled) setWhatsappAvatarUrl(lead.whatsapp_avatar_url ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, lead?.id]);

  if (!lead) return null;

  const profileAvatar = resolveProfileAvatarUrl(
    lead,
    whatsappAvatarUrl ?? lead.whatsapp_avatar_url ?? null
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <Avatar className="h-10 w-10 shrink-0">
              {profileAvatar.src ? (
                <AvatarImage src={profileAvatar.src} alt={lead.name} />
              ) : null}
              <AvatarFallback>{profileAvatar.initials}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">{lead.name}</span>
            <Badge 
              variant="outline" 
              style={{ 
                backgroundColor: getStatusVariant(lead.status).color,
                color: '#fff'
              }}
            >
              {lead.status}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              className="ml-auto" 
              onClick={(e) => {
                e.stopPropagation();
                onEditLead(lead);
              }}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>{lead.company}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
          <TabsList className="grid grid-cols-4 mb-4">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="notes">Anotações</TabsTrigger>
            <TabsTrigger value="opportunities">Oportunidades</TabsTrigger>
          </TabsList>
          <TabsContent value="details">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>E-mail</Label>
                <p className="text-sm">{lead.email || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <p className="text-sm">{lead.phone || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Empresa</Label>
                <p className="text-sm">{lead.company || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <p className="text-sm">
                  <Badge 
                    variant="outline"
                    style={{ 
                      backgroundColor: getStatusVariant(lead.status).color,
                      color: '#fff'
                    }}
                  >
                    {lead.status}
                  </Badge>
                </p>
              </div>
              <div className="space-y-1">
                <Label>Fonte</Label>
                <p className="text-sm">{lead.source || "Direto"}</p>
              </div>
            </div>
            <div className="mt-6">
              <Button 
                onClick={onConvertToClient} 
                variant="outline" 
                className="w-full"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mr-2 h-4 w-4"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Converter para Cliente
              </Button>
            </div>
          </TabsContent>
          
          <LeadTasksTab 
            tasks={tasks}
            onAddTask={onAddTask}
            onUpdateTaskStatus={onUpdateTaskStatus}
          />

          <LeadNotesTab 
            initialContent={lead.notes || ""} 
            onSaveNote={onSaveNote} 
          />

          <LeadOpportunitiesTab />
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetailsDialog;
