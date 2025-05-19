
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FileEdit, Plus, Trash2, UserPlus } from "lucide-react";
import { Member } from "@/components/shared/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const CollaboratorsSection: React.FC = () => {
  const [collaborators, setCollaborators] = useState<Member[]>([
    { id: "1", name: "João Silva", email: "joao@example.com", avatar: "JS", role: "admin" },
    { id: "2", name: "Maria Souza", email: "maria@example.com", avatar: "MS", role: "editor" },
    { id: "3", name: "Carlos Ferreira", email: "carlos@example.com", avatar: "CF", role: "viewer" },
  ]);
  const [newCollaboratorDialog, setNewCollaboratorDialog] = useState(false);
  const [editCollaboratorDialog, setEditCollaboratorDialog] = useState(false);
  const [currentCollaborator, setCurrentCollaborator] = useState<Member | null>(null);

  const handleAddCollaborator = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = form.collaboratorName.value;
    const email = form.collaboratorEmail.value;
    const role = form.collaboratorRole.value;
    
    // Create initials for avatar
    const initials = name.split(' ')
      .filter(n => n)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    const newCollaborator: Member = {
      id: `${collaborators.length + 1}`,
      name,
      email,
      avatar: initials,
      role: role as "admin" | "editor" | "viewer",
    };
    
    setCollaborators([...collaborators, newCollaborator]);
    setNewCollaboratorDialog(false);
    toast.success("Colaborador adicionado com sucesso!");
  };

  const handleEditCollaborator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCollaborator) return;
    
    const form = e.target as HTMLFormElement;
    const name = form.collaboratorName.value;
    const email = form.collaboratorEmail.value;
    const role = form.collaboratorRole.value;
    
    // Create initials for avatar if name changed
    const initials = name.split(' ')
      .filter(n => n)
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
    
    const updatedCollaborator: Member = {
      ...currentCollaborator,
      name,
      email,
      avatar: initials,
      role: role as "admin" | "editor" | "viewer",
    };
    
    setCollaborators(collaborators.map(c => 
      c.id === currentCollaborator.id ? updatedCollaborator : c
    ));
    
    setEditCollaboratorDialog(false);
    setCurrentCollaborator(null);
    toast.success("Colaborador atualizado com sucesso!");
  };
  
  const handleDeleteCollaborator = (id: string) => {
    setCollaborators(collaborators.filter(c => c.id !== id));
    toast.success("Colaborador removido com sucesso!");
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Gerenciar Colaboradores</CardTitle>
              <CardDescription>Adicione e gerencie colaboradores para seus projetos</CardDescription>
            </div>
            <Button onClick={() => setNewCollaboratorDialog(true)}>
              <UserPlus className="mr-2 h-4 w-4" />
              Novo Colaborador
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {collaborators.length > 0 ? (
              <div className="grid gap-4">
                {collaborators.map((collaborator) => (
                  <div 
                    key={collaborator.id} 
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{collaborator.avatar}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{collaborator.name}</p>
                        <p className="text-sm text-muted-foreground">{collaborator.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-1 text-xs rounded-full",
                        {
                          "bg-blue-100 text-blue-800": collaborator.role === "admin",
                          "bg-green-100 text-green-800": collaborator.role === "editor",
                          "bg-gray-100 text-gray-800": collaborator.role === "viewer",
                        }
                      )}>
                        {collaborator.role === "admin" ? "Administrador" : 
                         collaborator.role === "editor" ? "Editor" : "Visualizador"}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          setCurrentCollaborator(collaborator);
                          setEditCollaboratorDialog(true);
                        }}
                      >
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDeleteCollaborator(collaborator.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhum colaborador cadastrado</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={() => setNewCollaboratorDialog(true)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Colaborador
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Dialog para adicionar novo colaborador */}
      <Dialog open={newCollaboratorDialog} onOpenChange={setNewCollaboratorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Colaborador</DialogTitle>
            <DialogDescription>
              Preencha os dados do novo colaborador para adicioná-lo aos projetos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCollaborator}>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="collaboratorName">Nome</Label>
                <Input id="collaboratorName" name="collaboratorName" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaboratorEmail">Email</Label>
                <Input id="collaboratorEmail" name="collaboratorEmail" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collaboratorRole">Função</Label>
                <Select name="collaboratorRole" defaultValue="viewer">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma função" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Administrador</SelectItem>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Visualizador</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewCollaboratorDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit">Adicionar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog para editar colaborador */}
      <Dialog open={editCollaboratorDialog} onOpenChange={setEditCollaboratorDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Colaborador</DialogTitle>
            <DialogDescription>
              Atualize os dados do colaborador.
            </DialogDescription>
          </DialogHeader>
          {currentCollaborator && (
            <form onSubmit={handleEditCollaborator}>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="collaboratorName">Nome</Label>
                  <Input 
                    id="collaboratorName" 
                    name="collaboratorName" 
                    defaultValue={currentCollaborator.name}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collaboratorEmail">Email</Label>
                  <Input 
                    id="collaboratorEmail" 
                    name="collaboratorEmail" 
                    type="email" 
                    defaultValue={currentCollaborator.email}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="collaboratorRole">Função</Label>
                  <Select name="collaboratorRole" defaultValue={currentCollaborator.role}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Visualizador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => {
                  setEditCollaboratorDialog(false);
                  setCurrentCollaborator(null);
                }}>
                  Cancelar
                </Button>
                <Button type="submit">Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
