import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FileEdit, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { settingsService } from "@/services/settings";
import { useAuth } from "@/contexts/AuthContext";
import { SettingsSectionProps } from "./types";

interface User {
  id: string;
  email: string;
  created_at: string;
}

interface Profile {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  is_admin: boolean;
}

interface ProfileMember {
  id: string;
  user_id: string;
  profile_id: string;
  email?: string;
  permissions: string[];
}

type PermissionType = 
  | "all_access" 
  | "manage_clients" 
  | "view_clients" 
  | "manage_leads" 
  | "view_leads" 
  | "manage_funnels" 
  | "view_funnels" 
  | "manage_settings" 
  | "view_reports" 
  | "manage_users";

export const UserManagementSection: React.FC<SettingsSectionProps> = () => {
  const { user } = useAuth();
  
  // State
  const [users, setUsers] = useState<User[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileMembers, setProfileMembers] = useState<ProfileMember[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDescription, setNewProfileDescription] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionType[]>([]);
  
  // Lista de permissões disponíveis
  const availablePermissions: { value: PermissionType; label: string }[] = [
    { value: "all_access", label: "Acesso Total" },
    { value: "manage_clients", label: "Gerenciar Clientes" },
    { value: "view_clients", label: "Visualizar Clientes" },
    { value: "manage_leads", label: "Gerenciar Leads" },
    { value: "view_leads", label: "Visualizar Leads" },
    { value: "manage_funnels", label: "Gerenciar Funis" },
    { value: "view_funnels", label: "Visualizar Funis" },
    { value: "manage_settings", label: "Gerenciar Configurações" },
    { value: "view_reports", label: "Visualizar Relatórios" },
    { value: "manage_users", label: "Gerenciar Usuários" }
  ];

  // Load data
  useEffect(() => {
    loadData();
  }, []);
  
  // Effect para carregar dados do perfil selecionado
  useEffect(() => {
    if (selectedProfile) {
      loadProfileMembers(selectedProfile);
    }
  }, [selectedProfile]);
  
  // Função para carregar os dados
  const loadData = async () => {
    setLoading(true);
    try {
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }
      
      // Carregar perfis do usuário
      const userProfiles = await settingsService.getUserProfiles();
      if (userProfiles && userProfiles.length > 0) {
        const convertedProfiles: Profile[] = userProfiles.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description || undefined
        }));
        setProfiles(convertedProfiles);
        setSelectedProfile(convertedProfiles[0].id);
      }
      
      // Carregar usuários disponíveis através dos perfis existentes
      await loadAvailableUsers();
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };
  
  // Função para carregar usuários disponíveis
  const loadAvailableUsers = async () => {
    try {
      // Por enquanto, vamos usar uma lista vazia ou buscar de outra forma
      // Isso pode ser melhorado no futuro com um endpoint específico de usuários
      const usersData: User[] = [];
      setUsers(usersData);
    } catch (error) {
      console.error("Erro ao carregar usuários:", error);
    }
  };
  
  // Função para carregar membros de um perfil
  const loadProfileMembers = async (profileId: string) => {
    try {
      const members = await settingsService.getProfileMembers(profileId);
      
      const membersWithPermissions: ProfileMember[] = members.map(member => ({
        id: member.id,
        user_id: member.user_id,
        profile_id: member.profile_id,
        email: member.email || `user-${member.user_id.slice(0, 8)}@example.com`,
        permissions: member.permissions || []
      }));
      
      setProfileMembers(membersWithPermissions);
    } catch (error) {
      console.error("Erro ao carregar membros do perfil:", error);
      toast.error("Erro ao carregar membros do perfil");
    }
  };
  
  // Função para criar um novo usuário
  // Nota: Criação de usuários deve ser feita através do sistema de autenticação
  // Esta funcionalidade será implementada separadamente
  const handleCreateUser = async () => {
    toast.error("Criação de usuários será implementada em breve");
    // TODO: Implementar criação de usuários através da API de autenticação
  };
  
  // Função para criar um novo perfil
  const handleCreateProfile = async () => {
    if (!newProfileName) {
      toast.error("O nome do perfil é obrigatório");
      return;
    }
    
    try {
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }
      
      const newProfile = await settingsService.createUserProfile({
        name: newProfileName,
        description: newProfileDescription || null,
        is_admin: false
      });
      
      toast.success("Perfil criado com sucesso!");
      setProfileDialogOpen(false);
      loadData();
      
      // Limpar formulário
      setNewProfileName("");
      setNewProfileDescription("");
    } catch (error: any) {
      console.error("Erro ao criar perfil:", error);
      toast.error(`Erro ao criar perfil: ${error.message}`);
    }
  };
  
  // Função para adicionar membro ao perfil
  const handleAddMember = async () => {
    if (!selectedProfile || !selectedUser) {
      toast.error("Selecione um perfil e um usuário");
      return;
    }
    
    try {
      if (!user) {
        toast.error("Usuário não autenticado");
        return;
      }
      
      // Adicionar o membro ao perfil
      const memberData = await settingsService.createProfileMember(selectedProfile, {
        user_id: selectedUser
      });
      
      // Adicionar permissões ao membro
      if (selectedPermissions.length > 0) {
        await Promise.all(
          selectedPermissions.map(permission =>
            settingsService.createMemberPermission(memberData.id, {
              permission: permission
            })
          )
        );
      }
      
      toast.success("Membro adicionado com sucesso!");
      setMemberDialogOpen(false);
      loadProfileMembers(selectedProfile);
      
      // Limpar seleção
      setSelectedUser(null);
      setSelectedPermissions([]);
    } catch (error: any) {
      console.error("Erro ao adicionar membro:", error);
      toast.error(`Erro ao adicionar membro: ${error.message}`);
    }
  };
  
  // Função para remover membro
  const handleRemoveMember = async (memberId: string, userId: string) => {
    if (!selectedProfile) return;
    
    try {
      // Buscar permissões do membro para deletar
      const permissions = await settingsService.getMemberPermissions(memberId);
      
      // Remover permissões primeiro
      await Promise.all(
        permissions.map(perm =>
          settingsService.deleteMemberPermission(memberId, perm.id)
        )
      );
      
      // Remover membro (isso também remove as permissões automaticamente via CASCADE)
      await settingsService.deleteProfileMember(memberId);
      
      toast.success("Membro removido com sucesso!");
      loadProfileMembers(selectedProfile);
    } catch (error: any) {
      console.error("Erro ao remover membro:", error);
      toast.error(`Erro ao remover membro: ${error.message}`);
    }
  };

  // Função para formatar email para exibição
  const getInitials = (email: string) => {
    return email.substring(0, 2).toUpperCase();
  };
  
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Gerenciamento de Usuários</CardTitle>
          <CardDescription>
            Gerencie usuários e suas permissões nos diferentes perfis
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="profiles">
            <TabsList className="mb-4">
              <TabsTrigger value="profiles">
                <Users className="h-4 w-4 mr-2" />
                Perfis
              </TabsTrigger>
              <TabsTrigger value="users">
                <UserPlus className="h-4 w-4 mr-2" />
                Usuários
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="profiles">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium">Perfis</h3>
                    <p className="text-sm text-muted-foreground">
                      Gerencie os perfis e seus membros
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setProfileDialogOpen(true)}>
                      <Plus className="mr-2 h-4 w-4" />
                      Novo Perfil
                    </Button>
                    {selectedProfile && (
                      <Button size="sm" onClick={() => setMemberDialogOpen(true)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Adicionar Membro
                      </Button>
                    )}
                  </div>
                </div>
                
                {profiles.length > 0 ? (
                  <>
                    <Select
                      value={selectedProfile || undefined}
                      onValueChange={setSelectedProfile}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                      <SelectContent>
                        {profiles.map(profile => (
                          <SelectItem key={profile.id} value={profile.id}>
                            {profile.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    {selectedProfile && (
                      <div className="border rounded-md">
                        <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
                          <div className="col-span-4">Usuário</div>
                          <div className="col-span-6">Permissões</div>
                          <div className="col-span-2">Ações</div>
                        </div>
                        
                        {profileMembers.length > 0 ? (
                          profileMembers.map(member => (
                            <div key={member.id} className="grid grid-cols-12 gap-4 p-4 border-b text-sm">
                              <div className="col-span-4 flex items-center gap-2">
                                <Avatar className="h-8 w-8">
                                  <AvatarFallback>{getInitials(member.email || '')}</AvatarFallback>
                                </Avatar>
                                <span>{member.email}</span>
                              </div>
                              <div className="col-span-6 flex items-center flex-wrap gap-1">
                                {member.permissions.map(permission => {
                                  const permLabel = availablePermissions.find(p => p.value === permission)?.label || permission;
                                  return (
                                    <span
                                      key={permission}
                                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                    >
                                      {permLabel}
                                    </span>
                                  );
                                })}
                                {member.permissions.length === 0 && (
                                  <span className="text-muted-foreground">Sem permissões definidas</span>
                                )}
                              </div>
                              <div className="col-span-2 flex items-center gap-1">
                                <Button variant="ghost" size="icon">
                                  <FileEdit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveMember(member.id, member.user_id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-center text-muted-foreground">
                            Nenhum membro encontrado neste perfil
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">Nenhum perfil encontrado</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setProfileDialogOpen(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Criar Perfil
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="users">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-medium">Usuários</h3>
                    <p className="text-sm text-muted-foreground">
                      Gerencie os usuários do sistema
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setUserDialogOpen(true)}>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Novo Usuário
                  </Button>
                </div>
                
                <div className="border rounded-md">
                  <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
                    <div className="col-span-5">Email</div>
                    <div className="col-span-3">Data de Criação</div>
                    <div className="col-span-4">ID</div>
                  </div>
                  
                  {users.length > 0 ? (
                    users.map(user => (
                      <div key={user.id} className="grid grid-cols-12 gap-4 p-4 border-b text-sm">
                        <div className="col-span-5 flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
                          </Avatar>
                          <span>{user.email}</span>
                        </div>
                        <div className="col-span-3 flex items-center">
                          {new Date(user.created_at).toLocaleDateString()}
                        </div>
                        <div className="col-span-4 flex items-center text-xs text-muted-foreground">
                          {user.id}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      Nenhum usuário encontrado
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {/* Dialog para novo usuário */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Novo Usuário</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo usuário no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="email@exemplo.com" 
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input 
                id="password" 
                type="password" 
                placeholder="••••••••" 
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateUser}>Criar Usuário</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog para novo perfil */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Perfil</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar um novo perfil no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="profileName">Nome do Perfil</Label>
              <Input 
                id="profileName" 
                placeholder="Nome do perfil" 
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profileDescription">Descrição (opcional)</Label>
              <Input 
                id="profileDescription" 
                placeholder="Descrição do perfil" 
                value={newProfileDescription}
                onChange={(e) => setNewProfileDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateProfile}>Criar Perfil</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Dialog para adicionar membro */}
      <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Membro ao Perfil</DialogTitle>
            <DialogDescription>
              Selecione um usuário e defina suas permissões neste perfil.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="user">Usuário</Label>
              <Select onValueChange={setSelectedUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(user => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-4">
              <Label>Permissões</Label>
              <div className="grid grid-cols-2 gap-2">
                {availablePermissions.map(permission => (
                  <div key={permission.value} className="flex items-center space-x-2">
                    <Checkbox 
                      id={permission.value}
                      checked={selectedPermissions.includes(permission.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedPermissions([...selectedPermissions, permission.value]);
                        } else {
                          setSelectedPermissions(
                            selectedPermissions.filter(p => p !== permission.value)
                          );
                        }
                      }}
                    />
                    <Label 
                      htmlFor={permission.value}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {permission.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMemberDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddMember}>Adicionar Membro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
