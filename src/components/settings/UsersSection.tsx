import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileEdit, Trash2, UserPlus, Users2 } from "lucide-react";
import { SettingsSectionProps } from "./types";
import { getTenantLimits, getMyTenantUsers, getTenantRoles, setUserRole, type TenantUser, type TenantRole } from "@/services/tenantLimits";
import { UserTeamsDialog } from "./UserTeamsDialog";
import { toast } from "sonner";

function getInitials(user: TenantUser): string {
  if (user.full_name && user.full_name.trim()) {
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (user.email || "?").slice(0, 2).toUpperCase();
}

export const UsersSection: React.FC<SettingsSectionProps> = () => {
  const [usersLimit, setUsersLimit] = useState<{ current: number; limit: number | null } | null>(null);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [teamsDialogOpen, setTeamsDialogOpen] = useState(false);
  const [editingUserForTeams, setEditingUserForTeams] = useState<{ id: string; name: string } | null>(null);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  useEffect(() => {
    getTenantLimits().then((limits) => {
      if (limits?.users) setUsersLimit({ current: limits.users.current, limit: limits.users.limit });
    });
  }, []);

  useEffect(() => {
    setUsersLoading(true);
    getMyTenantUsers()
      .then(setUsers)
      .catch((err) => {
        toast.error(err?.message ?? "Erro ao carregar usuários");
        setUsers([]);
      })
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    getTenantRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  const handleRoleChange = async (userId: string, role: string) => {
    setUpdatingRoleUserId(userId);
    try {
      await setUserRole(userId, role);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success("Perfil de acesso atualizado");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao atualizar perfil");
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  const atLimit = usersLimit?.limit != null && usersLimit.current >= usersLimit.limit;
  const limitLabel =
    usersLimit?.limit != null
      ? `${usersLimit.current} de ${usersLimit.limit} usuários`
      : usersLimit != null
        ? `${usersLimit.current} usuários`
        : null;

  const displayName = (u: TenantUser) => (u.full_name && u.full_name.trim() ? u.full_name : u.email) || u.email;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>
            Liste os usuários da conta, defina o perfil de acesso (role) de cada um e as equipes às quais pertencem. O limite de usuários depende do plano contratado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-medium">Usuários</h3>
                {limitLabel && (
                  <span className="text-sm text-muted-foreground">({limitLabel})</span>
                )}
              </div>
              <Button size="sm" disabled={atLimit} title={atLimit ? "Limite de usuários do plano atingido" : undefined}>
                <UserPlus className="mr-2 h-4 w-4" />
                Novo Usuário
              </Button>
            </div>
            {atLimit && (
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Limite de usuários do plano atingido. Faça upgrade para adicionar mais usuários.
              </p>
            )}

            <div className="border rounded-md">
              <div className="grid grid-cols-12 gap-4 p-4 border-b font-medium text-sm">
                <div className="col-span-3">Nome</div>
                <div className="col-span-4">Email</div>
                <div className="col-span-3">Tipo de Acesso</div>
                <div className="col-span-2">Ações</div>
              </div>

              {usersLoading ? (
                <div className="p-4 text-center text-sm text-muted-foreground" role="status">Carregando usuários...</div>
              ) : users.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Nenhum usuário na conta. Use &quot;Novo Usuário&quot; (cadastro/convite) para adicionar.</div>
              ) : (
                users.map((u) => (
                  <div key={u.id} className="grid grid-cols-12 gap-4 p-4 border-b text-sm last:border-b-0">
                    <div className="col-span-3 flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(u)}</AvatarFallback>
                      </Avatar>
                      <span>{displayName(u)}</span>
                    </div>
                    <div className="col-span-4 flex items-center">{u.email}</div>
                    <div className="col-span-3 flex items-center">
                      {u.is_super_admin ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full text-xs">
                          Super Admin
                        </span>
                      ) : roles.length > 0 ? (
                        <Select
                          value={u.role ?? ""}
                          onValueChange={(value) => handleRoleChange(u.id, value)}
                          disabled={updatingRoleUserId === u.id}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue placeholder="Perfil de acesso" />
                          </SelectTrigger>
                          <SelectContent>
                            {roles.map((r) => (
                              <SelectItem key={r.role} value={r.role}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : u.role ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 rounded-full text-xs">
                          {roles.find((r) => r.role === u.role)?.name ?? u.role}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar equipes deste usuário"
                        aria-label="Editar equipes"
                        onClick={() => {
                          setEditingUserForTeams({ id: u.id, name: displayName(u) });
                          setTeamsDialogOpen(true);
                        }}
                      >
                        <Users2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Editar permissões (em breve)" aria-label="Editar permissões">
                        <FileEdit className="h-4 w-4" />
                      </Button>
                      {!u.is_super_admin && (
                        <Button variant="ghost" size="icon" title="Excluir usuário (em breve)" aria-label="Excluir usuário">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <UserTeamsDialog
        open={teamsDialogOpen}
        onOpenChange={setTeamsDialogOpen}
        userId={editingUserForTeams?.id ?? null}
        userDisplayName={editingUserForTeams?.name}
        onSaved={() => getMyTenantUsers().then(setUsers).catch(() => {})}
      />
    </>
  );
};
