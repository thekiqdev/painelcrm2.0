import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  getModulePermissionsSchema,
  getRolePermissions,
  putRolePermissions,
  type ModuleSchemaItem,
  type ModulePermission,
  type ModulePermissionsMap,
} from "@/services/modulePermissions";

interface RolePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string;
  roleName: string;
  /** Quando informado, usa API de perfil customizado (custom-roles/:id/permissions). */
  customId?: string;
  onSaved?: () => void;
}

const defaultPermission = (): ModulePermission => ({
  can_view: false,
  can_create: false,
  can_edit: false,
  can_delete: false,
  edit_own_only: false,
  delete_own_only: false,
});

export function RolePermissionsDialog({
  open,
  onOpenChange,
  role,
  roleName,
  customId,
  onSaved,
}: RolePermissionsDialogProps) {
  const [schema, setSchema] = useState<ModuleSchemaItem[]>([]);
  const [permissions, setPermissions] = useState<ModulePermissionsMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const roleKey = customId ?? role;

  useEffect(() => {
    if (!open || !roleKey) return;
    setLoading(true);
    Promise.all([getModulePermissionsSchema(), getRolePermissions(roleKey, !!customId)])
      .then(([mods, perms]) => {
        setSchema(mods);
        const merged: ModulePermissionsMap = {};
        mods.forEach((m) => {
          merged[m.id] = perms[m.id]
            ? { ...perms[m.id] }
            : defaultPermission();
        });
        setPermissions(merged);
      })
      .catch((err) => {
        toast.error(err?.message ?? "Erro ao carregar permissões");
        onOpenChange(false);
      })
      .finally(() => setLoading(false));
  }, [open, roleKey, customId, onOpenChange]);

  const update = (moduleId: string, field: keyof ModulePermission, value: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleId]: {
        ...(prev[moduleId] ?? defaultPermission()),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await putRolePermissions(roleKey, permissions, !!customId);
      toast.success("Permissões salvas.");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Permissões por módulo — {roleName}</DialogTitle>
          <DialogDescription>
            Marque o que este perfil pode fazer em cada módulo. Quando disponível, &quot;Editar só
            próprios&quot; e &quot;Excluir só próprios&quot; limitam a ações sobre itens que o
            usuário criou ou foi atribuído.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto border rounded-md">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Módulo</TableHead>
                  <TableHead className="text-center w-[90px]" title="Ver listagens e detalhes do módulo">Visualizar</TableHead>
                  <TableHead className="text-center w-[70px]" title="Criar novos registros">Criar</TableHead>
                  <TableHead className="text-center w-[70px]" title="Alterar registros existentes">Editar</TableHead>
                  <TableHead className="text-center w-[75px]" title="Remover registros">Excluir</TableHead>
                  <TableHead className="text-center w-[100px]" title="Quando marcado, o usuário só pode editar itens que criou ou aos quais foi atribuído">Editar só próprios</TableHead>
                  <TableHead className="text-center w-[110px]" title="Quando marcado, o usuário só pode excluir itens que criou ou aos quais foi atribuído">Excluir só próprios</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.map((mod) => {
                  const p = permissions[mod.id] ?? defaultPermission();
                  const showEditOwn = mod.supportsEditOwn && p.can_edit;
                  const showDeleteOwn = mod.supportsDeleteOwn && p.can_delete;
                  return (
                    <TableRow key={mod.id}>
                      <TableCell className="font-medium">{mod.label}</TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={p.can_view}
                          onCheckedChange={(v) => update(mod.id, "can_view", v === true)}
                          aria-label={`${mod.label} - Visualizar`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={p.can_create}
                          onCheckedChange={(v) => update(mod.id, "can_create", v === true)}
                          aria-label={`${mod.label} - Criar`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={p.can_edit}
                          onCheckedChange={(v) => update(mod.id, "can_edit", v === true)}
                          aria-label={`${mod.label} - Editar`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Checkbox
                          checked={p.can_delete}
                          onCheckedChange={(v) => update(mod.id, "can_delete", v === true)}
                          aria-label={`${mod.label} - Excluir`}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        {mod.supportsEditOwn ? (
                          <Checkbox
                            checked={p.edit_own_only}
                            disabled={!p.can_edit}
                            onCheckedChange={(v) => update(mod.id, "edit_own_only", v === true)}
                            aria-label={`${mod.label} - Editar só próprios`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {mod.supportsDeleteOwn ? (
                          <Checkbox
                            checked={p.delete_own_only}
                            disabled={!p.can_delete}
                            onCheckedChange={(v) => update(mod.id, "delete_own_only", v === true)}
                            aria-label={`${mod.label} - Excluir só próprios`}
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading || saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
