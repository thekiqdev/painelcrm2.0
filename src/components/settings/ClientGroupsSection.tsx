
import React, { useState } from "react";
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
import { toast } from "sonner";
import { SettingsSectionProps } from "./types";

// Exemplo de grupos de clientes
const initialGroups = [
  { id: 1, name: "Tecnologia", clientCount: 24 },
  { id: 2, name: "Varejo", clientCount: 18 },
  { id: 3, name: "Saúde", clientCount: 5 },
  { id: 4, name: "Educação", clientCount: 8 },
  { id: 5, name: "Serviços", clientCount: 32 },
  { id: 6, name: "Outro", clientCount: 10 },
];

export const ClientGroupsSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  const [groups, setGroups] = useState(initialGroups);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: number; name: string } | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const handleAddGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupName.trim()) {
      const newGroup = {
        id: Math.max(0, ...groups.map(g => g.id)) + 1,
        name: newGroupName.trim(),
        clientCount: 0
      };
      setGroups([...groups, newGroup]);
      setNewGroupName("");
      setIsAddDialogOpen(false);
      toast.success("Grupo adicionado com sucesso!");
    }
  };

  const handleEditGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingGroup && editingGroup.name.trim()) {
      setGroups(groups.map(group => 
        group.id === editingGroup.id 
          ? { ...group, name: editingGroup.name.trim() } 
          : group
      ));
      setEditingGroup(null);
      setIsEditDialogOpen(false);
      toast.success("Grupo atualizado com sucesso!");
    }
  };

  const handleDeleteGroup = (id: number) => {
    // Verificação se o grupo tem clientes
    const group = groups.find(g => g.id === id);
    if (group && group.clientCount > 0) {
      toast.error(`Não é possível excluir o grupo "${group.name}" porque ele possui ${group.clientCount} clientes associados.`);
      return;
    }

    setGroups(groups.filter(group => group.id !== id));
    toast.success("Grupo excluído com sucesso!");
  };

  const startEditGroup = (group: { id: number; name: string }) => {
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
