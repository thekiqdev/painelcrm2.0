
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { SettingsSectionProps } from "./types";
import { clientsService } from "@/services/clients";
import { useAuth } from "@/contexts/AuthContext";

export const ClientGroupsSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  const [groups, setGroups] = useState<any[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  // Carregar grupos
  useEffect(() => {
    const fetchGroups = async () => {
      setIsLoading(true);
      try {
        const groupsData = await clientsService.getClientGroups();
        setGroups(groupsData || []);
      } catch (error: any) {
        console.error("Erro ao carregar grupos:", error);
        toast.error(error.message || "Erro ao carregar os grupos. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchGroups();
  }, []);

  const handleAddGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newGroupName.trim()) {
      try {
        if (!user) {
          throw new Error("Usuário não autenticado");
        }
        
        // Inserir novo grupo
        const newGroup = await clientsService.createClientGroup({ 
          name: newGroupName.trim()
        });
        
        setGroups([...groups, newGroup]);
        setNewGroupName("");
        setIsAddDialogOpen(false);
        toast.success("Grupo adicionado com sucesso!");
      } catch (error: any) {
        console.error("Erro ao adicionar grupo:", error);
        toast.error(`Erro ao adicionar grupo: ${error.message}`);
      }
    }
  };

  const handleEditGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingGroup && editingGroup.name.trim()) {
      try {
        // Atualizar o grupo
        const updatedGroup = await clientsService.updateClientGroup(editingGroup.id, { 
          name: editingGroup.name.trim() 
        });
        
        // Atualizar o grupo na lista local
        setGroups(groups.map(group => 
          group.id === editingGroup.id 
            ? updatedGroup
            : group
        ));
        
        setEditingGroup(null);
        setIsEditDialogOpen(false);
        toast.success("Grupo atualizado com sucesso!");
      } catch (error: any) {
        console.error("Erro ao atualizar grupo:", error);
        toast.error(`Erro ao atualizar grupo: ${error.message}`);
      }
    }
  };

  const handleDeleteGroup = async (id: string) => {
    // Verificação se o grupo tem clientes
    const group = groups.find(g => g.id === id);
    if (group && group.clientCount > 0) {
      toast.error(`Não é possível excluir o grupo "${group.name}" porque ele possui ${group.clientCount} clientes associados.`);
      return;
    }

    try {
      // Excluir o grupo
      await clientsService.deleteClientGroup(id);
      
      // Remover o grupo da lista local
      setGroups(groups.filter(group => group.id !== id));
      toast.success("Grupo excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir grupo:", error);
      toast.error(`Erro ao excluir grupo: ${error.message}`);
    }
  };

  const startEditGroup = (group: { id: string; name: string }) => {
    setEditingGroup(group);
    setIsEditDialogOpen(true);
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Grupos de Clientes</CardTitle>
              <CardDescription>
                Gerencie os grupos para categorizar seus clientes
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Grupo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Grupo</DialogTitle>
                  <DialogDescription>
                    Crie um novo grupo para categorizar seus clientes
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddGroup}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="groupName">Nome do Grupo</Label>
                      <Input
                        id="groupName"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="Ex: Tecnologia, Varejo, etc."
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Adicionar</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Carregando grupos de clientes...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Clientes</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Nenhum grupo cadastrado
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>{group.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{group.clientCount} cliente{group.clientCount !== 1 ? 's' : ''}</Badge>
                      </TableCell>
                      <TableCell className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => startEditGroup({ id: group.id, name: group.name })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDeleteGroup(group.id)}
                          disabled={group.clientCount > 0}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
          
          {/* Dialog para editar grupo */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Editar Grupo</DialogTitle>
                <DialogDescription>
                  Altere o nome do grupo selecionado
                </DialogDescription>
              </DialogHeader>
              {editingGroup && (
                <form onSubmit={handleEditGroup}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="editGroupName">Nome do Grupo</Label>
                      <Input
                        id="editGroupName"
                        value={editingGroup.name}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                        placeholder="Ex: Tecnologia, Varejo, etc."
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Salvar Configurações</Button>
      </div>
    </form>
  );
};
