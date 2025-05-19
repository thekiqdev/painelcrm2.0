
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
import { 
  FileEdit, Plus, Trash2, UserPlus, Building, Users, 
  Globe, CreditCard, Bell, Settings as SettingsIcon, 
  Shield, Menu 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const Settings = () => {
  const [collaborators, setCollaborators] = useState<Member[]>([
    { id: "1", name: "João Silva", email: "joao@example.com", avatar: "JS", role: "admin" },
    { id: "2", name: "Maria Souza", email: "maria@example.com", avatar: "MS", role: "editor" },
    { id: "3", name: "Carlos Ferreira", email: "carlos@example.com", avatar: "CF", role: "viewer" },
  ]);
  const [newCollaboratorDialog, setNewCollaboratorDialog] = useState(false);
  const [editCollaboratorDialog, setEditCollaboratorDialog] = useState(false);
  const [currentCollaborator, setCurrentCollaborator] = useState<Member | null>(null);
  const [activeSettingsTab, setActiveSettingsTab] = useState("company");

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
  
  // Define the settings menu items
  const settingsMenuItems = [
    { id: "company", label: "Dados da Empresa", icon: <Building className="mr-2 h-5 w-5" /> },
    { id: "users", label: "Usuários & Permissões", icon: <Users className="mr-2 h-5 w-5" /> },
    { id: "domain", label: "Domínio e URLs", icon: <Globe className="mr-2 h-5 w-5" /> },
    { id: "billing", label: "Pagamentos e Faturamento", icon: <CreditCard className="mr-2 h-5 w-5" /> },
    { id: "notifications", label: "Notificações", icon: <Bell className="mr-2 h-5 w-5" /> },
    { id: "preferences", label: "Preferências Gerais", icon: <SettingsIcon className="mr-2 h-5 w-5" /> },
    { id: "security", label: "Segurança", icon: <Shield className="mr-2 h-5 w-5" /> },
  ];

  // Render the content based on the active settings tab
  const renderSettingsContent = () => {
    switch (activeSettingsTab) {
      case "company":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Dados da Empresa</CardTitle>
              <CardDescription>Configure as informações da sua empresa</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Nome da Empresa</Label>
                  <Input id="companyName" placeholder="Nome da sua empresa" />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="cnpj">CNPJ/CPF</Label>
                  <Input id="cnpj" placeholder="XX.XXX.XXX/XXXX-XX" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" placeholder="(XX) XXXX-XXXX" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="whatsapp">WhatsApp</Label>
                    <Input id="whatsapp" placeholder="(XX) XXXXX-XXXX" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input id="address" placeholder="Endereço completo" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">Cidade</Label>
                    <Input id="city" placeholder="Cidade" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">Estado</Label>
                    <Input id="state" placeholder="Estado" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">CEP</Label>
                    <Input id="zipCode" placeholder="XXXXX-XXX" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Logotipo da Empresa</Label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <Button variant="outline">Enviar logo</Button>
                    <p className="text-sm text-muted-foreground mt-2">
                      Formatos suportados: PNG, JPG, GIF (max. 2MB)
                    </p>
                  </div>
                </div>
              </form>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Alterações</Button>
            </CardFooter>
          </Card>
        );
      case "users":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Usuários & Permissões</CardTitle>
              <CardDescription>Gerencie os usuários do sistema e suas permissões</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Usuários</h3>
                  <Button size="sm">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Novo Usuário
                  </Button>
                </div>
                
                <div className="border rounded-md">
                  <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
                    <div className="col-span-3">Nome</div>
                    <div className="col-span-4">Email</div>
                    <div className="col-span-3">Tipo de Acesso</div>
                    <div className="col-span-2">Ações</div>
                  </div>
                  
                  <div className="grid grid-cols-12 gap-4 p-4 border-b text-sm">
                    <div className="col-span-3 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>AD</AvatarFallback>
                      </Avatar>
                      <span>Admin</span>
                    </div>
                    <div className="col-span-4 flex items-center">admin@example.com</div>
                    <div className="col-span-3 flex items-center">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        Administrador
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button variant="ghost" size="icon">
                        <FileEdit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-12 gap-4 p-4 text-sm">
                    <div className="col-span-3 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>US</AvatarFallback>
                      </Avatar>
                      <span>Usuário Padrão</span>
                    </div>
                    <div className="col-span-4 flex items-center">usuario@example.com</div>
                    <div className="col-span-3 flex items-center">
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs">
                        Padrão
                      </span>
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button variant="ghost" size="icon">
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "collaborators":
        return (
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
        );
      case "domain":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Domínio e URLs</CardTitle>
              <CardDescription>Configure seu domínio personalizado</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domínio Personalizado</Label>
                  <div className="flex gap-2">
                    <Input id="domain" placeholder="example.com" />
                    <Button>Verificar</Button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-md bg-yellow-50">
                  <div className="flex items-center gap-2 font-medium text-amber-800">
                    <div className="p-1 bg-amber-200 rounded-full">
                      <Bell className="h-5 w-5 text-amber-800" />
                    </div>
                    Status do Domínio: Pendente
                  </div>
                  <p className="mt-2 text-sm text-amber-700">
                    Aguardando propagação de DNS. Isso pode levar até 48 horas.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="url">URL do Painel</Label>
                  <div className="flex items-center gap-2">
                    <Input id="url" value="https://app.example.com/dashboard" readOnly />
                    <Button variant="outline" size="icon">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Alterações</Button>
            </CardFooter>
          </Card>
        );
      case "billing":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Pagamentos e Faturamento</CardTitle>
              <CardDescription>Gerencie métodos de pagamento e faturas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Métodos de Pagamento</h3>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-md flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-gray-100 rounded-md">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="5" width="20" height="14" rx="2" />
                            <line x1="2" y1="10" x2="22" y2="10" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Cartão de Crédito</p>
                          <p className="text-sm text-muted-foreground">Visa terminando em 1234</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Remover</Button>
                    </div>
                    
                    <div className="p-4 border rounded-md flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-gray-100 rounded-md">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium">Chave PIX</p>
                          <p className="text-sm text-muted-foreground">CPF: 123.456.789-00</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Editar</Button>
                    </div>
                    
                    <Button variant="outline" className="w-full">
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Método de Pagamento
                    </Button>
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Histórico de Faturas</h3>
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-medium">Fatura</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Data</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Valor</th>
                          <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                          <th className="px-4 py-3 text-right text-sm font-medium"></th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-t">
                          <td className="px-4 py-3 text-sm">#INV-001</td>
                          <td className="px-4 py-3 text-sm">21/05/2023</td>
                          <td className="px-4 py-3 text-sm">R$ 149,90</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                              Pago
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <Button variant="ghost" size="sm">Ver</Button>
                          </td>
                        </tr>
                        <tr className="border-t">
                          <td className="px-4 py-3 text-sm">#INV-002</td>
                          <td className="px-4 py-3 text-sm">21/04/2023</td>
                          <td className="px-4 py-3 text-sm">R$ 149,90</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                              Pago
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            <Button variant="ghost" size="sm">Ver</Button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      case "notifications":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Notificações</CardTitle>
              <CardDescription>Configure suas preferências de notificação</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Canais de Notificação</h3>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="email-notifications">E-mail</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações no seu e-mail
                      </p>
                    </div>
                    <Switch id="email-notifications" defaultChecked />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="whatsapp-notifications">WhatsApp</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações via WhatsApp
                      </p>
                    </div>
                    <Switch id="whatsapp-notifications" />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="app-notifications">Notificações no App</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba notificações dentro do aplicativo
                      </p>
                    </div>
                    <Switch id="app-notifications" defaultChecked />
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Preferências de Notificação</h3>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="new-project">Novos Projetos</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando um novo projeto for criado
                      </p>
                    </div>
                    <Switch id="new-project" defaultChecked />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="project-updates">Atualizações de Projetos</Label>
                      <p className="text-sm text-muted-foreground">
                        Quando um projeto for atualizado
                      </p>
                    </div>
                    <Switch id="project-updates" defaultChecked />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="invoice-notifications">Faturas e Pagamentos</Label>
                      <p className="text-sm text-muted-foreground">
                        Notificações sobre faturas e pagamentos
                      </p>
                    </div>
                    <Switch id="invoice-notifications" defaultChecked />
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="marketing-notifications">Marketing</Label>
                      <p className="text-sm text-muted-foreground">
                        Receba novidades e ofertas especiais
                      </p>
                    </div>
                    <Switch id="marketing-notifications" />
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Preferências</Button>
            </CardFooter>
          </Card>
        );
      case "preferences":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Preferências Gerais</CardTitle>
              <CardDescription>Personalize sua experiência no sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="language">Idioma do Sistema</Label>
                  <Select defaultValue="pt-BR">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um idioma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                      <SelectItem value="en-US">English (US)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="timezone">Fuso Horário</Label>
                  <Select defaultValue="America/Sao_Paulo">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um fuso horário" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">Brasília (UTC-3)</SelectItem>
                      <SelectItem value="America/Manaus">Manaus (UTC-4)</SelectItem>
                      <SelectItem value="America/Belem">Belém (UTC-3)</SelectItem>
                      <SelectItem value="America/Noronha">Fernando de Noronha (UTC-2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Formato de Data</Label>
                  <Select defaultValue="DD/MM/YYYY">
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um formato de data" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave}>Salvar Preferências</Button>
            </CardFooter>
          </Card>
        );
      case "security":
        return (
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
              <CardDescription>Configure as opções de segurança da sua conta</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Alterar Senha</h3>
                  <div className="space-y-2">
                    <Label htmlFor="currentPassword">Senha Atual</Label>
                    <Input id="currentPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova Senha</Label>
                    <Input id="newPassword" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                    <Input id="confirmPassword" type="password" />
                  </div>
                  <Button>Atualizar Senha</Button>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Autenticação em Dois Fatores</h3>
                      <p className="text-sm text-muted-foreground">
                        Aumente a segurança da sua conta com autenticação em dois fatores
                      </p>
                    </div>
                    <Switch id="2fa" />
                  </div>
                </div>
                
                <Separator />
                
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Sessões Ativas</h3>
                  <div className="space-y-2">
                    <div className="p-4 border rounded-md">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Chrome - Windows 10</p>
                          <p className="text-xs text-muted-foreground">São Paulo, Brasil · Ativo agora</p>
                        </div>
                        <p className="text-xs text-green-600">Sessão Atual</p>
                      </div>
                    </div>
                    
                    <div className="p-4 border rounded-md">
                      <div className="flex justify-between">
                        <div>
                          <p className="font-medium">Safari - iPhone</p>
                          <p className="text-xs text-muted-foreground">São Paulo, Brasil · Último acesso: 2 dias atrás</p>
                        </div>
                        <Button variant="ghost" size="sm">Encerrar</Button>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline">Encerrar Todas as Outras Sessões</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Configurações</h1>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Menu className="h-4 w-4" />
              Menu de Configurações
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80">
            <div className="py-4">
              <h2 className="text-xl font-bold mb-6">Menu de Configurações</h2>
              <nav>
                <ul className="space-y-2">
                  {settingsMenuItems.map((item) => (
                    <li key={item.id}>
                      <Button 
                        variant={activeSettingsTab === item.id ? "default" : "ghost"} 
                        className="w-full justify-start"
                        onClick={() => setActiveSettingsTab(item.id)}
                      >
                        {item.icon}
                        {item.label}
                      </Button>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {renderSettingsContent()}

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
