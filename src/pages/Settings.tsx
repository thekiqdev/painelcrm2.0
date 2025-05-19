import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Member } from "@/components/shared/types";
import { FileEdit, Plus, Trash2, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const Settings = () => {
  const [collaborators, setCollaborators] = useState<Member[]>([
    { id: "1", name: "João Silva", email: "joao@example.com", avatar: "JS", role: "admin" },
    { id: "2", name: "Maria Souza", email: "maria@example.com", avatar: "MS", role: "editor" },
    { id: "3", name: "Carlos Ferreira", email: "carlos@example.com", avatar: "CF", role: "viewer" },
  ]);
  const [newCollaboratorDialog, setNewCollaboratorDialog] = useState(false);
  const [editCollaboratorDialog, setEditCollaboratorDialog] = useState(false);
  const [currentCollaborator, setCurrentCollaborator] = useState<Member | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Configurações salvas com sucesso!");
  };

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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full md:w-auto grid-cols-5">
          <TabsTrigger value="profile">Perfil</TabsTrigger>
          <TabsTrigger value="company">Empresa</TabsTrigger>
          <TabsTrigger value="users">Usuários</TabsTrigger>
          <TabsTrigger value="collaborators">Colaboradores</TabsTrigger>
          <TabsTrigger value="customization">Personalização</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Perfil do Usuário</CardTitle>
              <CardDescription>Gerencie suas informações pessoais e credenciais</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="flex flex-col md:flex-row gap-4 md:items-center mb-6">
                  <Avatar className="w-16 h-16">
                    <div className="bg-primary h-full w-full flex items-center justify-center text-xl font-medium text-primary-foreground">
                      AU
                    </div>
                  </Avatar>
                  <div className="flex flex-col md:flex-row gap-2">
                    <Button variant="outline" size="sm">
                      Alterar foto
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      Remover
                    </Button>
                  </div>
                </div>

                <div className="grid gap-6">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome</Label>
                      <Input id="name" defaultValue="Admin" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Sobrenome</Label>
                      <Input id="lastName" defaultValue="User" />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input id="email" type="email" defaultValue="admin@exemplo.com" />
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Senha Atual</Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">Nova Senha</Label>
                      <Input id="newPassword" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                      <Input id="confirmPassword" type="password" />
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="notifications">Notificações por e-mail</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba atualizações sobre tarefas e eventos
                      </p>
                    </div>
                    <Switch id="notifications" defaultChecked />
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Alterações</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="company">
          <Card>
            <CardHeader>
              <CardTitle>Informações da Empresa</CardTitle>
              <CardDescription>Configure os dados da sua empresa</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input id="companyName" defaultValue="Minha Empresa" />
                </div>
                
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <Input id="cnpj" placeholder="XX.XXX.XXX/XXXX-XX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" placeholder="(XX) XXXX-XXXX" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" />
                </div>
                
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado</Label>
                    <Input id="state" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input id="zipCode" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input id="website" type="url" placeholder="https://" />
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Alterações</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Usuários e Permissões</CardTitle>
              <CardDescription>Gerencie os usuários do sistema e suas permissões</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-10">
                <p className="text-muted-foreground mb-4">
                  O gerenciamento de usuários e permissões estará disponível em breve.
                </p>
                <Button variant="outline">Solicitar Acesso</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collaborators">
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
        </TabsContent>

        <TabsContent value="customization">
          <Card>
            <CardHeader>
              <CardTitle>Personalização</CardTitle>
              <CardDescription>Ajuste a aparência do seu sistema CRM</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tema</Label>
                    <div className="flex gap-4">
                      <Button variant="outline" className="flex-1">Claro</Button>
                      <Button variant="outline" className="flex-1">Escuro</Button>
                      <Button variant="outline" className="flex-1">Sistema</Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Esquema de Cores</Label>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="w-full h-10 rounded-md bg-blue-500 cursor-pointer ring-2 ring-offset-2"></div>
                      <div className="w-full h-10 rounded-md bg-green-500 cursor-pointer"></div>
                      <div className="w-full h-10 rounded-md bg-purple-500 cursor-pointer"></div>
                      <div className="w-full h-10 rounded-md bg-red-500 cursor-pointer"></div>
                      <div className="w-full h-10 rounded-md bg-orange-500 cursor-pointer"></div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="compactView">Modo compacto</Label>
                      <p className="text-sm text-muted-foreground">
                        Reduzir espaçamento de elementos na interface
                      </p>
                    </div>
                    <Switch id="compactView" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="animations">Animações</Label>
                      <p className="text-sm text-muted-foreground">
                        Habilitar animações na interface
                      </p>
                    </div>
                    <Switch id="animations" defaultChecked />
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Alterações</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  );
};

export default Settings;
