
import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Tag, Edit } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Client, ClientTag } from "@/components/funnel/types";

interface ClientDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  availableTags: ClientTag[];
  onEditClient?: (client: Client) => void;
  onAddTag: (client: Client, tagId: string) => void;
  onRemoveTag: (client: Client, tagId: string) => void;
}

const ClientDetailsDialog: React.FC<ClientDetailsDialogProps> = ({
  isOpen,
  onClose,
  client,
  availableTags,
  onEditClient,
  onAddTag,
  onRemoveTag,
}) => {
  const [activeTab, setActiveTab] = useState("details");
  
  if (!client) return null;

  // Filter out tags that are already assigned to the client
  const unassignedTags = availableTags.filter(
    availableTag => !client.tags?.some(tagId => tagId === availableTag.id)
  );

  const handleAddTag = (tagId: string) => {
    onAddTag(client, tagId);
    toast.success("Tag adicionada com sucesso!");
  };

  const handleRemoveTag = (tagId: string) => {
    onRemoveTag(client, tagId);
    toast.success("Tag removida com sucesso!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {client.name}
              <Badge variant="outline" className="ml-2 bg-blue-500 text-white">
                {client.status || "Ativo"}
              </Badge>
            </div>
            {onEditClient && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClient(client);
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>{client.company}</DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas</TabsTrigger>
            <TabsTrigger value="notes">Anotações</TabsTrigger>
          </TabsList>
          
          <TabsContent value="details">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>E-mail</Label>
                <p className="text-sm">{client.email || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <p className="text-sm">{client.phone || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Empresa</Label>
                <p className="text-sm">{client.company || "Não informado"}</p>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <p className="text-sm">{client.status || "Ativo"}</p>
              </div>
              <div className="col-span-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {client.tags && client.tags.length > 0 ? (
                    client.tags.map(tagId => {
                      const tag = availableTags.find(t => t.id === tagId);
                      if (!tag) return null;
                      
                      return (
                        <Badge
                          key={tag.id}
                          className="px-2 py-1 flex items-center gap-1 cursor-pointer"
                          style={{ backgroundColor: tag.color, color: "white" }}
                          onClick={() => handleRemoveTag(tag.id)}
                        >
                          {tag.name}
                          <span className="ml-1 text-xs">&times;</span>
                        </Badge>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma tag atribuída</p>
                  )}
                  
                  {unassignedTags.length > 0 && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-6">
                          <Plus className="h-3 w-3 mr-1" /> Adicionar Tag
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-2">
                        <div className="grid gap-2">
                          {unassignedTags.map(tag => (
                            <Badge
                              key={tag.id}
                              className="px-2 py-1 cursor-pointer"
                              style={{ backgroundColor: tag.color, color: "white" }}
                              onClick={() => handleAddTag(tag.id)}
                            >
                              {tag.name}
                            </Badge>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="tasks">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Tarefas do cliente serão exibidas aqui.</p>
              <Button variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Tarefa
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="notes">
            <div className="space-y-4">
              <p className="text-sm whitespace-pre-wrap">
                {client.notes || "Nenhuma anotação registrada para este cliente."}
              </p>
              <Button variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Anotação
              </Button>
            </div>
          </TabsContent>
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

export default ClientDetailsDialog;
