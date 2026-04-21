import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Shield, Pencil, Plus } from "lucide-react";
import { toast } from "@/components/ui/sonner";
import {
  getTenantRoles,
  addTenantRole,
  BASE_ROLE_OPTIONS,
  type TenantRole,
} from "@/services/tenantLimits";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SettingsSectionProps } from "./types";
import { RolePermissionsDialog } from "./RolePermissionsDialog";

const PERMISSION_LABELS: Record<string, string> = {
  all_access: "Acesso Total",
  manage_clients: "Gerenciar Clientes",
  view_clients: "Visualizar Clientes",
  manage_leads: "Gerenciar Leads",
  view_leads: "Visualizar Leads",
  manage_funnels: "Gerenciar Funis",
  view_funnels: "Visualizar Funis",
  manage_settings: "Gerenciar Configurações",
  view_reports: "Visualizar Relatórios",
  manage_users: "Gerenciar Usuários",
};

export const UserManagementSection: React.FC<SettingsSectionProps> = () => {
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<{ role: string; name: string; id?: string } | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [addingRole, setAddingRole] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileBaseRole, setNewProfileBaseRole] = useState("");

  const loadRoles = () =>
    getTenantRoles()
      .then(setRoles)
      .catch(() => setRoles([]));

  useEffect(() => {
    setLoading(true);
    loadRoles().finally(() => setLoading(false));
  }, []);

  const openPermissionsDialog = (r: TenantRole) => {
    setEditingRole({ role: r.role, name: r.name, id: r.id });
    setPermissionsDialogOpen(true);
  };

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProfileName.trim();
    if (!name) {
      toast.error("Informe o nome do perfil.");
      return;
    }
    setAddingRole(true);
    addTenantRole(name, newProfileBaseRole || undefined)
      .then(() => {
        loadRoles();
        setAddProfileOpen(false);
        setNewProfileName("");
        setNewProfileBaseRole("");
        toast.success("Perfil adicionado. Configure as permissões se desejar.");
      })
      .catch((err) => {
        toast.error(err?.message ?? "Erro ao adicionar perfil");
      })
      .finally(() => setAddingRole(false));
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Perfis de acesso</CardTitle>
          <CardDescription>
            Perfis (roles) e suas permissões. Para alterar o perfil de um usuário, use a seção{" "}
            <strong>Usuários</strong> e o campo &quot;Perfil de acesso&quot; na linha do usuário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O perfil <strong>Administrador</strong> é fixo e tem acesso total. Os demais perfis
              definem permissões por módulo; use &quot;Editar permissões&quot; para configurar.
            </p>
            {loading ? (
              <p className="text-sm text-muted-foreground" role="status">
                Carregando perfis de acesso...
              </p>
            ) : roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum perfil de acesso disponível.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setAddProfileOpen(true)}
                    title="Criar perfil de acesso personalizado"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Adicionar perfil de acesso
                  </Button>
                </div>
                {roles.map((r) => (
                  <div key={r.id ?? r.role} className="border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        {r.name}
                      </h4>
                      <div className="flex flex-wrap gap-1">
                        {r.role === 'admin' ? (
                          <span className="text-muted-foreground text-sm">
                            Acesso total (perfil fixo do sistema)
                          </span>
                        ) : r.role === 'custom' ? (
                          <span className="text-muted-foreground text-sm">
                            Perfil personalizado (edite para ver detalhes)
                          </span>
                        ) : (
                          <>
                            {(r.permissions ?? []).map((perm) => (
                              <span
                                key={perm}
                                className="px-2 py-1 bg-muted rounded-md text-xs"
                              >
                                {PERMISSION_LABELS[perm] ?? perm}
                              </span>
                            ))}
                            {(!r.permissions || r.permissions.length === 0) && (
                              <span className="text-muted-foreground text-sm">
                                Permissões por módulo (edite para ver detalhes)
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                    {r.role !== 'admin' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openPermissionsDialog(r)}
                        className="shrink-0"
                        title="Configurar permissões por módulo para este perfil"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar permissões
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {editingRole && (
        <RolePermissionsDialog
          open={permissionsDialogOpen}
          onOpenChange={setPermissionsDialogOpen}
          role={editingRole.role}
          roleName={editingRole.name}
          customId={editingRole.role === "custom" ? editingRole.id : undefined}
          onSaved={loadRoles}
        />
      )}

      <Dialog open={addProfileOpen} onOpenChange={setAddProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar perfil de acesso</DialogTitle>
            <DialogDescription>
              Digite o nome do perfil. Opcionalmente, copie as permissões de um perfil existente e ajuste depois.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddProfile} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="new-profile-name">Nome do perfil</Label>
              <Input
                id="new-profile-name"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Ex.: Vendedor, Suporte..."
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-profile-base">Copiar permissões de (opcional)</Label>
              <select
                id="new-profile-base"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={newProfileBaseRole}
                onChange={(e) => setNewProfileBaseRole(e.target.value)}
              >
                {BASE_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddProfileOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={addingRole || !newProfileName.trim()}>
                {addingRole ? "Adicionando..." : "Adicionar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
