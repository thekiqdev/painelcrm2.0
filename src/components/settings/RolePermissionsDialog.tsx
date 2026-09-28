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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  getModulePermissionsSchema,
  getRolePermissions,
  putRolePermissions,
  type ModuleSchemaItem,
  type ModulePermission,
  type ModulePermissionsMap,
} from "@/services/modulePermissions";
import {
  resolveBillingGranularFromLegacy,
  resolveChatGranularFromLegacy,
  resolveClientsGranularFromLegacy,
  resolveContractsGranularFromLegacy,
  resolveFinanceGranularFromLegacy,
  resolveLeadsGranularFromLegacy,
  resolveProposalsGranularFromLegacy,
  resolveTasksGranularFromLegacy,
} from "@/permissions/permissionCatalog";

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

/** Título e texto de ajuda comuns à secção de CRUD legado / geral. */
function ModuleGeneralPermissionsHint() {
  return (
    <div className="w-full min-w-0">
      <p className="text-[11px] font-medium text-muted-foreground">Permissões gerais do módulo</p>
      <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5 max-w-2xl">
        Estas permissões controlam acesso geral. As regras &quot;só próprios&quot; abaixo limitam ações sobre
        registros criados pelo usuário.
      </p>
    </div>
  );
}

function computeChatOperationalCanEdit(map: ModulePermissionsMap): boolean {
  const g = resolveChatGranularFromLegacy(map);
  return (
    g.view_all_conversations ||
    g.send_message ||
    g.take_attendance ||
    g.transfer_attendance ||
    g.close_attendance ||
    g.reopen_attendance ||
    g.assign_to_user ||
    g.manage_tags ||
    g.create_invoice_from_chat ||
    g.create_proposal_from_chat ||
    g.create_contract_from_chat ||
    g.schedule_from_chat ||
    g.manage_queues ||
    g.manage_teams ||
    g.view_metrics ||
    g.manage_automation ||
    g.manage_groups ||
    g.create_group ||
    g.manage_group_participants ||
    g.manage_group_settings
  );
}

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
            ? { ...perms[m.id], module_extras: { ...(perms[m.id].module_extras ?? {}) } }
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

  const patchChatExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const chat = { ...(prev.chat ?? defaultPermission()) };
      const ex = { ...(chat.module_extras ?? {}), [key]: val };
      const next: ModulePermissionsMap = {
        ...prev,
        chat: {
          ...chat,
          module: "chat",
          module_extras: ex,
        },
      };
      next.chat!.can_edit = computeChatOperationalCanEdit(next);
      return next;
    });
  };

  const patchFinanceExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const f = { ...(prev.finance ?? defaultPermission()) };
      const ex = { ...(f.module_extras ?? {}), [key]: val };
      return {
        ...prev,
        finance: { ...f, module: "finance", module_extras: ex },
      };
    });
  };

  const patchBillingExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const b = { ...(prev.billing ?? defaultPermission()) };
      const ex = { ...(b.module_extras ?? {}), [key]: val };
      return {
        ...prev,
        billing: { ...b, module: "billing", module_extras: ex },
      };
    });
  };

  const patchClientsExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const m = { ...(prev.clients ?? defaultPermission()) };
      const ex = { ...(m.module_extras ?? {}), [key]: val };
      return { ...prev, clients: { ...m, module: "clients", module_extras: ex } };
    });
  };

  const patchLeadsExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const m = { ...(prev.leads ?? defaultPermission()) };
      const ex = { ...(m.module_extras ?? {}), [key]: val };
      return { ...prev, leads: { ...m, module: "leads", module_extras: ex } };
    });
  };

  const patchProposalsExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const m = { ...(prev.proposals ?? defaultPermission()) };
      const ex = { ...(m.module_extras ?? {}), [key]: val };
      return { ...prev, proposals: { ...m, module: "proposals", module_extras: ex } };
    });
  };

  const patchContractsExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const m = { ...(prev.contracts ?? defaultPermission()) };
      const ex = { ...(m.module_extras ?? {}), [key]: val };
      return { ...prev, contracts: { ...m, module: "contracts", module_extras: ex } };
    });
  };

  const patchTasksExtra = (key: string, val: boolean) => {
    setPermissions((prev) => {
      const m = { ...(prev.tasks ?? defaultPermission()) };
      const ex = { ...(m.module_extras ?? {}), [key]: val };
      return { ...prev, tasks: { ...m, module: "tasks", module_extras: ex } };
    });
  };

  const setChatView = (val: boolean) => {
    setPermissions((prev) => {
      const chat = { ...(prev.chat ?? defaultPermission()) };
      const next: ModulePermissionsMap = {
        ...prev,
        chat: {
          ...chat,
          module: "chat",
          can_view: val,
        },
      };
      next.chat!.can_edit = computeChatOperationalCanEdit(next);
      return next;
    });
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

  const chatG = resolveChatGranularFromLegacy(permissions);
  const financeG = resolveFinanceGranularFromLegacy(permissions);
  const billingG = resolveBillingGranularFromLegacy(permissions);
  const clientsG = resolveClientsGranularFromLegacy(permissions);
  const leadsG = resolveLeadsGranularFromLegacy(permissions);
  const proposalsG = resolveProposalsGranularFromLegacy(permissions);
  const contractsG = resolveContractsGranularFromLegacy(permissions);
  const tasksG = resolveTasksGranularFromLegacy(permissions);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Permissões por módulo — {roleName}</DialogTitle>
          <DialogDescription>
            Marque o que este perfil pode fazer em cada módulo. No <strong>Chat</strong>, as opções
            granulares substituem o modelo genérico Visualizar/Criar/Editar/Excluir e são gravadas em{" "}
            <code className="text-xs">module_extras</code>. Perfis antigos são interpretados via{" "}
            <code className="text-xs">resolveChatGranularFromLegacy</code>.
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
                  <TableHead className="text-center w-[90px]" title="Ver listagens e detalhes do módulo">
                    Visualizar
                  </TableHead>
                  <TableHead className="text-center w-[70px]" title="Criar novos registros">
                    Criar
                  </TableHead>
                  <TableHead className="text-center w-[70px]" title="Alterar registros existentes">
                    Editar
                  </TableHead>
                  <TableHead className="text-center w-[75px]" title="Remover registros">
                    Excluir
                  </TableHead>
                  <TableHead
                    className="text-center w-[100px]"
                    title="Quando marcado, o usuário só pode editar itens que criou ou aos quais foi atribuído"
                  >
                    Editar só próprios
                  </TableHead>
                  <TableHead
                    className="text-center w-[110px]"
                    title="Quando marcado, o usuário só pode excluir itens que criou ou aos quais foi atribuído"
                  >
                    Excluir só próprios
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.map((mod) => {
                  if (mod.id === "clients") {
                    const p = permissions.clients ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    const showClientsEditDeleteOwnHint =
                      (p.edit_own_only || p.delete_own_only) && !clientsG.view_own;
                    return (
                      <TableRow key="clients-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/15 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle
                                id="cli-own-list"
                                label="Ver apenas clientes criados por este usuário"
                                checked={rowChecked("clients_view_own_only", clientsG.view_own)}
                                onChange={(v) => patchClientsExtra("clients_view_own_only", v)}
                              />
                              <ChatToggle id="cli-exp" label="Exportar" checked={rowChecked("clients_export", clientsG.export)} onChange={(v) => patchClientsExtra("clients_export", v)} />
                              <ChatToggle id="cli-imp" label="Importar" checked={rowChecked("clients_import", clientsG.import)} onChange={(v) => patchClientsExtra("clients_import", v)} />
                              <ChatToggle id="cli-merge" label="Mesclar registros" checked={rowChecked("clients_merge", clientsG.merge)} onChange={(v) => patchClientsExtra("clients_merge", v)} />
                              <ChatToggle id="cli-sens" label="Ver campos sensíveis" checked={rowChecked("clients_view_sensitive_fields", clientsG.view_sensitive_fields)} onChange={(v) => patchClientsExtra("clients_view_sensitive_fields", v)} />
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed border-t pt-2">
                              <strong className="font-medium text-foreground/80">Nota técnica:</strong> atualmente
                              &quot;próprio&quot; significa cliente criado por este usuário (<code className="text-[10px]">user_id</code>
                              do registo). Responsável/atribuído será suportado numa próxima versão.
                            </p>
                            {showClientsEditDeleteOwnHint ? (
                              <Alert className="border-amber-200/80 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30">
                                <AlertDescription className="text-xs leading-relaxed space-y-2">
                                  <span>
                                    Esta opção limita edição/exclusão, mas o usuário ainda poderá ver todos os
                                    clientes se &quot;Ver apenas clientes criados por este usuário&quot; não estiver
                                    ativo.
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => patchClientsExtra("clients_view_own_only", true)}
                                  >
                                    Também limitar visualização aos próprios clientes
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox id="cli-v" checked={p.can_view} onCheckedChange={(v) => update("clients", "can_view", v === true)} />
                                  <Label htmlFor="cli-v" className="text-xs cursor-pointer">Visualizar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="cli-c" checked={p.can_create} onCheckedChange={(v) => update("clients", "can_create", v === true)} />
                                  <Label htmlFor="cli-c" className="text-xs cursor-pointer">Criar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="cli-e" checked={p.can_edit} onCheckedChange={(v) => update("clients", "can_edit", v === true)} />
                                  <Label htmlFor="cli-e" className="text-xs cursor-pointer">Editar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="cli-d" checked={p.can_delete} onCheckedChange={(v) => update("clients", "can_delete", v === true)} />
                                  <Label htmlFor="cli-d" className="text-xs cursor-pointer">Excluir</Label>
                                </div>
                                {mod.supportsEditOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox id="cli-eoo" checked={p.edit_own_only} disabled={!p.can_edit} onCheckedChange={(v) => update("clients", "edit_own_only", v === true)} />
                                    <Label htmlFor="cli-eoo" className="text-xs cursor-pointer">
                                      Editar apenas clientes criados por este usuário
                                    </Label>
                                  </div>
                                ) : null}
                                {mod.supportsDeleteOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox id="cli-doo" checked={p.delete_own_only} disabled={!p.can_delete} onCheckedChange={(v) => update("clients", "delete_own_only", v === true)} />
                                    <Label htmlFor="cli-doo" className="text-xs cursor-pointer">
                                      Excluir apenas clientes criados por este usuário
                                    </Label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "leads") {
                    const p = permissions.leads ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    const showLeadsEditDeleteOwnHint =
                      (p.edit_own_only || p.delete_own_only) && !leadsG.view_own;
                    return (
                      <TableRow key="leads-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/15 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle
                                id="ld-own-list"
                                label="Ver apenas leads criados por este usuário"
                                checked={rowChecked("leads_view_own_only", leadsG.view_own)}
                                onChange={(v) => patchLeadsExtra("leads_view_own_only", v)}
                              />
                              <ChatToggle id="ld-conv" label="Converter para cliente" checked={rowChecked("leads_convert_to_client", leadsG.convert_to_client)} onChange={(v) => patchLeadsExtra("leads_convert_to_client", v)} />
                              <ChatToggle id="ld-exp" label="Exportar" checked={rowChecked("leads_export", leadsG.export)} onChange={(v) => patchLeadsExtra("leads_export", v)} />
                              <ChatToggle id="ld-imp" label="Importar" checked={rowChecked("leads_import", leadsG.import)} onChange={(v) => patchLeadsExtra("leads_import", v)} />
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed border-t pt-2">
                              <strong className="font-medium text-foreground/80">Nota técnica:</strong> atualmente
                              &quot;próprio&quot; significa lead criado por este usuário (<code className="text-[10px]">user_id</code>
                              do registo). Responsável/atribuído será suportado numa próxima versão.
                            </p>
                            {showLeadsEditDeleteOwnHint ? (
                              <Alert className="border-amber-200/80 bg-amber-50/90 dark:border-amber-900/60 dark:bg-amber-950/30">
                                <AlertDescription className="text-xs leading-relaxed space-y-2">
                                  <span>
                                    Esta opção limita edição/exclusão, mas o usuário ainda poderá ver todos os leads se
                                    &quot;Ver apenas leads criados por este usuário&quot; não estiver ativo.
                                  </span>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => patchLeadsExtra("leads_view_own_only", true)}
                                  >
                                    Também limitar visualização aos próprios leads
                                  </Button>
                                </AlertDescription>
                              </Alert>
                            ) : null}
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ld-v" checked={p.can_view} onCheckedChange={(v) => update("leads", "can_view", v === true)} />
                                  <Label htmlFor="ld-v" className="text-xs cursor-pointer">Visualizar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ld-c" checked={p.can_create} onCheckedChange={(v) => update("leads", "can_create", v === true)} />
                                  <Label htmlFor="ld-c" className="text-xs cursor-pointer">Criar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ld-e" checked={p.can_edit} onCheckedChange={(v) => update("leads", "can_edit", v === true)} />
                                  <Label htmlFor="ld-e" className="text-xs cursor-pointer">Editar</Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ld-d" checked={p.can_delete} onCheckedChange={(v) => update("leads", "can_delete", v === true)} />
                                  <Label htmlFor="ld-d" className="text-xs cursor-pointer">Excluir</Label>
                                </div>
                                {mod.supportsEditOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox id="ld-eoo" checked={p.edit_own_only} disabled={!p.can_edit} onCheckedChange={(v) => update("leads", "edit_own_only", v === true)} />
                                    <Label htmlFor="ld-eoo" className="text-xs cursor-pointer">
                                      Editar apenas leads criados por este usuário
                                    </Label>
                                  </div>
                                ) : null}
                                {mod.supportsDeleteOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox id="ld-doo" checked={p.delete_own_only} disabled={!p.can_delete} onCheckedChange={(v) => update("leads", "delete_own_only", v === true)} />
                                    <Label htmlFor="ld-doo" className="text-xs cursor-pointer">
                                      Excluir apenas leads criados por este usuário
                                    </Label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "proposals") {
                    const p = permissions.proposals ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    return (
                      <TableRow key="proposals-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/15 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle id="pr-own-list" label="Ver apenas próprias (autor)" checked={rowChecked("proposals_view_own_only", proposalsG.view_own)} onChange={(v) => patchProposalsExtra("proposals_view_own_only", v)} />
                              <ChatToggle id="pr-send" label="Enviar / link público" checked={rowChecked("proposals_send", proposalsG.send)} onChange={(v) => patchProposalsExtra("proposals_send", v)} />
                              <ChatToggle id="pr-appr" label="Aprovar" checked={rowChecked("proposals_approve", proposalsG.approve)} onChange={(v) => patchProposalsExtra("proposals_approve", v)} />
                              <ChatToggle id="pr-cc" label="Converter para contrato" checked={rowChecked("proposals_convert_contract", proposalsG.convert_to_contract)} onChange={(v) => patchProposalsExtra("proposals_convert_contract", v)} />
                              <ChatToggle id="pr-ci" label="Converter para fatura" checked={rowChecked("proposals_convert_invoice", proposalsG.convert_to_invoice)} onChange={(v) => patchProposalsExtra("proposals_convert_invoice", v)} />
                              <ChatToggle id="pr-int" label="Integrações (webhooks)" checked={rowChecked("proposals_manage_integrations", proposalsG.manage_integrations)} onChange={(v) => patchProposalsExtra("proposals_manage_integrations", v)} />
                            </div>
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox id="pr-v" checked={p.can_view} onCheckedChange={(v) => update("proposals", "can_view", v === true)} />
                                <Label htmlFor="pr-v" className="text-xs cursor-pointer">Visualizar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="pr-c" checked={p.can_create} onCheckedChange={(v) => update("proposals", "can_create", v === true)} />
                                <Label htmlFor="pr-c" className="text-xs cursor-pointer">Criar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="pr-e" checked={p.can_edit} onCheckedChange={(v) => update("proposals", "can_edit", v === true)} />
                                <Label htmlFor="pr-e" className="text-xs cursor-pointer">Editar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="pr-d" checked={p.can_delete} onCheckedChange={(v) => update("proposals", "can_delete", v === true)} />
                                <Label htmlFor="pr-d" className="text-xs cursor-pointer">Excluir</Label>
                              </div>
                              {mod.supportsEditOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox id="pr-eoo" checked={p.edit_own_only} disabled={!p.can_edit} onCheckedChange={(v) => update("proposals", "edit_own_only", v === true)} />
                                  <Label htmlFor="pr-eoo" className="text-xs cursor-pointer">Editar só próprias</Label>
                                </div>
                              ) : null}
                              {mod.supportsDeleteOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox id="pr-doo" checked={p.delete_own_only} disabled={!p.can_delete} onCheckedChange={(v) => update("proposals", "delete_own_only", v === true)} />
                                  <Label htmlFor="pr-doo" className="text-xs cursor-pointer">Excluir só próprias</Label>
                                </div>
                              ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "contracts") {
                    const p = permissions.contracts ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    return (
                      <TableRow key="contracts-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/15 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle id="ct-own-list" label="Ver apenas próprios (autor ou responsável)" checked={rowChecked("contracts_view_own_only", contractsG.view_own)} onChange={(v) => patchContractsExtra("contracts_view_own_only", v)} />
                              <ChatToggle id="ct-send" label="Enviar contrato" checked={rowChecked("contracts_send", contractsG.send)} onChange={(v) => patchContractsExtra("contracts_send", v)} />
                              <ChatToggle id="ct-sig" label="Solicitar assinatura" checked={rowChecked("contracts_request_signature", contractsG.request_signature)} onChange={(v) => patchContractsExtra("contracts_request_signature", v)} />
                              <ChatToggle id="ct-can" label="Cancelar contrato" checked={rowChecked("contracts_cancel", contractsG.cancel)} onChange={(v) => patchContractsExtra("contracts_cancel", v)} />
                              <ChatToggle id="ct-signed" label="Ver arquivos assinados" checked={rowChecked("contracts_view_signed_files", contractsG.view_signed_files)} onChange={(v) => patchContractsExtra("contracts_view_signed_files", v)} />
                            </div>
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox id="ct-v" checked={p.can_view} onCheckedChange={(v) => update("contracts", "can_view", v === true)} />
                                <Label htmlFor="ct-v" className="text-xs cursor-pointer">Visualizar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="ct-c" checked={p.can_create} onCheckedChange={(v) => update("contracts", "can_create", v === true)} />
                                <Label htmlFor="ct-c" className="text-xs cursor-pointer">Criar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="ct-e" checked={p.can_edit} onCheckedChange={(v) => update("contracts", "can_edit", v === true)} />
                                <Label htmlFor="ct-e" className="text-xs cursor-pointer">Editar</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="ct-d" checked={p.can_delete} onCheckedChange={(v) => update("contracts", "can_delete", v === true)} />
                                <Label htmlFor="ct-d" className="text-xs cursor-pointer">Excluir</Label>
                              </div>
                              {mod.supportsEditOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ct-eoo" checked={p.edit_own_only} disabled={!p.can_edit} onCheckedChange={(v) => update("contracts", "edit_own_only", v === true)} />
                                  <Label htmlFor="ct-eoo" className="text-xs cursor-pointer">Editar só próprios</Label>
                                </div>
                              ) : null}
                              {mod.supportsDeleteOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox id="ct-doo" checked={p.delete_own_only} disabled={!p.can_delete} onCheckedChange={(v) => update("contracts", "delete_own_only", v === true)} />
                                  <Label htmlFor="ct-doo" className="text-xs cursor-pointer">Excluir só próprios</Label>
                                </div>
                              ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "tasks") {
                    const p = permissions.tasks ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    const showTasksEditDeleteOwnHint =
                      (p.edit_own_only || p.delete_own_only) && !tasksG.view_own;
                    return (
                      <TableRow key="tasks-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/15 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle
                                id="tk-own-list"
                                label="Ver apenas tarefas criadas ou atribuídas a você"
                                checked={rowChecked("tasks_view_own_only", tasksG.view_own)}
                                onChange={(v) => patchTasksExtra("tasks_view_own_only", v)}
                              />
                            </div>
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <p className="text-[10px] text-muted-foreground leading-relaxed max-w-2xl">
                                &quot;Próprio&quot; na edição/exclusão inclui criador (<code className="text-[10px]">user_id</code>) e
                                responsável (<code className="text-[10px]">assignee_id</code>).
                              </p>
                              {showTasksEditDeleteOwnHint ? (
                                <Alert className="py-2">
                                  <AlertDescription className="text-[11px] leading-snug">
                                    Você marcou editar/excluir só próprios sem limitar a lista às suas tarefas. Quem só pode ver as próprias não deve editar as dos outros — ative também &quot;Ver apenas tarefas criadas ou atribuídas&quot;.
                                    <Button
                                      type="button"
                                      variant="link"
                                      className="h-auto p-0 ml-1 text-[11px]"
                                      onClick={() => patchTasksExtra("tasks_view_own_only", true)}
                                    >
                                      Limitar visualização
                                    </Button>
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-2">
                                  <Checkbox id="tk-v" checked={p.can_view} onCheckedChange={(v) => update("tasks", "can_view", v === true)} />
                                  <Label htmlFor="tk-v" className="text-xs cursor-pointer">
                                    Visualizar
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="tk-c" checked={p.can_create} onCheckedChange={(v) => update("tasks", "can_create", v === true)} />
                                  <Label htmlFor="tk-c" className="text-xs cursor-pointer">
                                    Criar
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="tk-e" checked={p.can_edit} onCheckedChange={(v) => update("tasks", "can_edit", v === true)} />
                                  <Label htmlFor="tk-e" className="text-xs cursor-pointer">
                                    Editar
                                  </Label>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Checkbox id="tk-d" checked={p.can_delete} onCheckedChange={(v) => update("tasks", "can_delete", v === true)} />
                                  <Label htmlFor="tk-d" className="text-xs cursor-pointer">
                                    Excluir
                                  </Label>
                                </div>
                                {mod.supportsEditOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id="tk-eoo"
                                      checked={p.edit_own_only}
                                      disabled={!p.can_edit}
                                      onCheckedChange={(v) => update("tasks", "edit_own_only", v === true)}
                                    />
                                    <Label htmlFor="tk-eoo" className="text-xs cursor-pointer">
                                      Editar só próprias
                                    </Label>
                                  </div>
                                ) : null}
                                {mod.supportsDeleteOwn ? (
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id="tk-doo"
                                      checked={p.delete_own_only}
                                      disabled={!p.can_delete}
                                      onCheckedChange={(v) => update("tasks", "delete_own_only", v === true)}
                                    />
                                    <Label htmlFor="tk-doo" className="text-xs cursor-pointer">
                                      Excluir só próprias
                                    </Label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "finance") {
                    const p = permissions.finance ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    return (
                      <TableRow key="finance-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/20 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <p className="text-xs text-muted-foreground">
                              Gravado em <code className="text-[10px]">module_extras</code> (prefixo{" "}
                              <code className="text-[10px]">finance_*</code>). Visualizar/Criar/Editar/Excluir do módulo
                              mantêm compatibilidade com perfis antigos.
                            </p>
                            <p className="text-xs text-amber-900/90 dark:text-amber-100/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                              Nesta versão o Financeiro é por empresa (tenant): lançamentos não têm dono confiável no modelo,
                              portanto não há regra de “só próprios” aplicável.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle id="fin-vdash" label="Ver cards no dashboard" checked={rowChecked("finance_view_dashboard_cards", financeG.view_dashboard_cards)} onChange={(v) => patchFinanceExtra("finance_view_dashboard_cards", v)} />
                              <ChatToggle id="fin-rev" label="Ver receitas" checked={rowChecked("finance_view_revenue", financeG.view_revenue)} onChange={(v) => patchFinanceExtra("finance_view_revenue", v)} />
                              <ChatToggle id="fin-exp" label="Ver despesas" checked={rowChecked("finance_view_expenses", financeG.view_expenses)} onChange={(v) => patchFinanceExtra("finance_view_expenses", v)} />
                              <ChatToggle id="fin-profit" label="Ver lucro" checked={rowChecked("finance_view_profit", financeG.view_profit)} onChange={(v) => patchFinanceExtra("finance_view_profit", v)} />
                              <ChatToggle id="fin-ap" label="Ver contas a pagar" checked={rowChecked("finance_view_accounts_payable", financeG.view_accounts_payable)} onChange={(v) => patchFinanceExtra("finance_view_accounts_payable", v)} />
                              <ChatToggle id="fin-cexp" label="Criar despesa" checked={rowChecked("finance_create_expense", financeG.create_expense)} onChange={(v) => patchFinanceExtra("finance_create_expense", v)} />
                              <ChatToggle id="fin-eexp" label="Editar despesa" checked={rowChecked("finance_edit_expense", financeG.edit_expense)} onChange={(v) => patchFinanceExtra("finance_edit_expense", v)} />
                              <ChatToggle id="fin-dexp" label="Excluir despesa" checked={rowChecked("finance_delete_expense", financeG.delete_expense)} onChange={(v) => patchFinanceExtra("finance_delete_expense", v)} />
                              <ChatToggle id="fin-pay" label="Pagar contas" checked={rowChecked("finance_pay_accounts", financeG.pay_accounts)} onChange={(v) => patchFinanceExtra("finance_pay_accounts", v)} />
                              <ChatToggle id="fin-rep" label="Ver relatórios financeiros" checked={rowChecked("finance_view_reports", financeG.view_reports)} onChange={(v) => patchFinanceExtra("finance_view_reports", v)} />
                            </div>
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox id="fin-v" checked={p.can_view} onCheckedChange={(v) => update("finance", "can_view", v === true)} />
                                <Label htmlFor="fin-v" className="text-xs cursor-pointer">
                                  Visualizar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="fin-c" checked={p.can_create} onCheckedChange={(v) => update("finance", "can_create", v === true)} />
                                <Label htmlFor="fin-c" className="text-xs cursor-pointer">
                                  Criar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="fin-e" checked={p.can_edit} onCheckedChange={(v) => update("finance", "can_edit", v === true)} />
                                <Label htmlFor="fin-e" className="text-xs cursor-pointer">
                                  Editar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="fin-d" checked={p.can_delete} onCheckedChange={(v) => update("finance", "can_delete", v === true)} />
                                <Label htmlFor="fin-d" className="text-xs cursor-pointer">
                                  Excluir
                                </Label>
                              </div>
                              {mod.supportsEditOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id="fin-eoo"
                                    checked={p.edit_own_only}
                                    disabled={!p.can_edit}
                                    onCheckedChange={(v) => update("finance", "edit_own_only", v === true)}
                                  />
                                  <Label htmlFor="fin-eoo" className="text-xs cursor-pointer">
                                    Editar só próprios
                                  </Label>
                                </div>
                              ) : null}
                              {mod.supportsDeleteOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id="fin-doo"
                                    checked={p.delete_own_only}
                                    disabled={!p.can_delete}
                                    onCheckedChange={(v) => update("finance", "delete_own_only", v === true)}
                                  />
                                  <Label htmlFor="fin-doo" className="text-xs cursor-pointer">
                                    Excluir só próprios
                                  </Label>
                                </div>
                              ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "billing") {
                    const p = permissions.billing ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    return (
                      <TableRow key="billing-granular">
                        <TableCell colSpan={7} className="align-top bg-muted/20 p-4">
                          <div className="space-y-3">
                            <p className="text-sm font-semibold">{mod.label} — ações detalhadas</p>
                            <p className="text-xs text-muted-foreground">
                              Gravado em <code className="text-[10px]">module_extras</code> (prefixo{" "}
                              <code className="text-[10px]">billing_*</code>). O faturamento CRM é visão por empresa nesta
                              versão; filtro “só próprios” ficará disponível quando houver autor/responsável confiável nas
                              cobranças/faturas.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle id="bil-inv" label="Ver faturas" checked={rowChecked("billing_view_invoices", billingG.view_invoices)} onChange={(v) => patchBillingExtra("billing_view_invoices", v)} />
                              <ChatToggle id="bil-ci" label="Criar fatura" checked={rowChecked("billing_create_invoice", billingG.create_invoice)} onChange={(v) => patchBillingExtra("billing_create_invoice", v)} />
                              <ChatToggle id="bil-ei" label="Editar fatura" checked={rowChecked("billing_edit_invoice", billingG.edit_invoice)} onChange={(v) => patchBillingExtra("billing_edit_invoice", v)} />
                              <ChatToggle id="bil-can" label="Cancelar fatura" checked={rowChecked("billing_cancel_invoice", billingG.cancel_invoice)} onChange={(v) => patchBillingExtra("billing_cancel_invoice", v)} />
                              <ChatToggle id="bil-di" label="Excluir fatura" checked={rowChecked("billing_delete_invoice", billingG.delete_invoice)} onChange={(v) => patchBillingExtra("billing_delete_invoice", v)} />
                              <ChatToggle id="bil-send" label="Enviar cobrança / checkout" checked={rowChecked("billing_send_invoice", billingG.send_invoice)} onChange={(v) => patchBillingExtra("billing_send_invoice", v)} />
                              <ChatToggle id="bil-paid" label="Marcar como paga" checked={rowChecked("billing_mark_paid", billingG.mark_paid)} onChange={(v) => patchBillingExtra("billing_mark_paid", v)} />
                              <ChatToggle id="bil-ref" label="Reembolsar" checked={rowChecked("billing_refund_invoice", billingG.refund_invoice)} onChange={(v) => patchBillingExtra("billing_refund_invoice", v)} />
                              <ChatToggle id="bil-subv" label="Ver assinaturas" checked={rowChecked("billing_view_subscriptions", billingG.view_subscriptions)} onChange={(v) => patchBillingExtra("billing_view_subscriptions", v)} />
                              <ChatToggle id="bil-subc" label="Criar assinatura" checked={rowChecked("billing_create_subscription", billingG.create_subscription)} onChange={(v) => patchBillingExtra("billing_create_subscription", v)} />
                              <ChatToggle id="bil-sube" label="Editar assinatura" checked={rowChecked("billing_edit_subscription", billingG.edit_subscription)} onChange={(v) => patchBillingExtra("billing_edit_subscription", v)} />
                              <ChatToggle id="bil-subx" label="Cancelar assinatura" checked={rowChecked("billing_cancel_subscription", billingG.cancel_subscription)} onChange={(v) => patchBillingExtra("billing_cancel_subscription", v)} />
                              <ChatToggle id="bil-chv" label="Ver cobranças" checked={rowChecked("billing_view_charges", billingG.view_charges)} onChange={(v) => patchBillingExtra("billing_view_charges", v)} />
                              <ChatToggle id="bil-chc" label="Criar cobrança" checked={rowChecked("billing_create_charge", billingG.create_charge)} onChange={(v) => patchBillingExtra("billing_create_charge", v)} />
                              <ChatToggle id="bil-che" label="Editar cobrança" checked={rowChecked("billing_edit_charge", billingG.edit_charge)} onChange={(v) => patchBillingExtra("billing_edit_charge", v)} />
                              <ChatToggle id="bil-chx" label="Cancelar cobrança" checked={rowChecked("billing_cancel_charge", billingG.cancel_charge)} onChange={(v) => patchBillingExtra("billing_cancel_charge", v)} />
                            </div>
                            <div className="flex flex-col gap-2 border-t pt-3">
                              <ModuleGeneralPermissionsHint />
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                              <div className="flex items-center gap-2">
                                <Checkbox id="bil-v" checked={p.can_view} onCheckedChange={(v) => update("billing", "can_view", v === true)} />
                                <Label htmlFor="bil-v" className="text-xs cursor-pointer">
                                  Visualizar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="bil-c" checked={p.can_create} onCheckedChange={(v) => update("billing", "can_create", v === true)} />
                                <Label htmlFor="bil-c" className="text-xs cursor-pointer">
                                  Criar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="bil-e" checked={p.can_edit} onCheckedChange={(v) => update("billing", "can_edit", v === true)} />
                                <Label htmlFor="bil-e" className="text-xs cursor-pointer">
                                  Editar
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox id="bil-d" checked={p.can_delete} onCheckedChange={(v) => update("billing", "can_delete", v === true)} />
                                <Label htmlFor="bil-d" className="text-xs cursor-pointer">
                                  Excluir
                                </Label>
                              </div>
                              {mod.supportsEditOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id="bil-eoo"
                                    checked={p.edit_own_only}
                                    disabled={!p.can_edit}
                                    onCheckedChange={(v) => update("billing", "edit_own_only", v === true)}
                                  />
                                  <Label htmlFor="bil-eoo" className="text-xs cursor-pointer">
                                    Editar só próprios
                                  </Label>
                                </div>
                              ) : null}
                              {mod.supportsDeleteOwn ? (
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    id="bil-doo"
                                    checked={p.delete_own_only}
                                    disabled={!p.can_delete}
                                    onCheckedChange={(v) => update("billing", "delete_own_only", v === true)}
                                  />
                                  <Label htmlFor="bil-doo" className="text-xs cursor-pointer">
                                    Excluir só próprios
                                  </Label>
                                </div>
                              ) : null}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  if (mod.id === "chat") {
                    const p = permissions.chat ?? defaultPermission();
                    const rowChecked = (extraKey: string, resolved: boolean) => {
                      const raw = p.module_extras?.[extraKey];
                      if (raw === true || raw === false) return raw === true;
                      return resolved;
                    };
                    return (
                      <TableRow key="chat">
                        <TableCell colSpan={7} className="align-top bg-muted/20 p-4">
                          <div className="space-y-4">
                            <div>
                              <p className="text-sm font-semibold">{mod.label} — permissões detalhadas</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                <strong>Ver chat</strong> controla <code className="text-[10px]">can_view</code>.
                                As restantes opções atualizam <code className="text-[10px]">module_extras</code> e{" "}
                                <code className="text-[10px]">can_edit</code> (true se qualquer ação operacional
                                estiver ativa).
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Checkbox
                                id="chat-view"
                                checked={p.can_view}
                                onCheckedChange={(v) => setChatView(v === true)}
                              />
                              <Label htmlFor="chat-view" className="font-medium cursor-pointer">
                                Ver chat
                              </Label>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <ChatToggle
                                id="chat-view-queue"
                                label="Ver fila de atendimento"
                                checked={rowChecked("chat_view_queue", chatG.view_queue)}
                                onChange={(v) => patchChatExtra("chat_view_queue", v)}
                              />
                              <ChatToggle
                                id="chat-view-all"
                                label="Ver todas as conversas"
                                checked={rowChecked("chat_view_all", chatG.view_all_conversations)}
                                onChange={(v) => patchChatExtra("chat_view_all", v)}
                              />
                              <ChatToggle
                                id="chat-reply"
                                label="Enviar mensagens"
                                checked={rowChecked("chat_reply", chatG.send_message)}
                                onChange={(v) => patchChatExtra("chat_reply", v)}
                              />
                              <ChatToggle
                                id="chat-take"
                                label="Assumir atendimento"
                                checked={rowChecked("chat_take_attendance", chatG.take_attendance)}
                                onChange={(v) => patchChatExtra("chat_take_attendance", v)}
                              />
                              <ChatToggle
                                id="chat-transfer"
                                label="Transferir atendimento"
                                checked={rowChecked("chat_transfer", chatG.transfer_attendance)}
                                onChange={(v) => patchChatExtra("chat_transfer", v)}
                              />
                              <ChatToggle
                                id="chat-close"
                                label="Encerrar atendimento"
                                checked={rowChecked("chat_close", chatG.close_attendance)}
                                onChange={(v) => patchChatExtra("chat_close", v)}
                              />
                              <ChatToggle
                                id="chat-reopen"
                                label="Reabrir atendimento"
                                checked={rowChecked("chat_reopen", chatG.reopen_attendance)}
                                onChange={(v) => patchChatExtra("chat_reopen", v)}
                              />
                              <ChatToggle
                                id="chat-assign"
                                label="Atribuir responsável"
                                checked={rowChecked("chat_assign", chatG.assign_to_user)}
                                onChange={(v) => patchChatExtra("chat_assign", v)}
                              />
                              <ChatToggle
                                id="chat-tags"
                                label="Gerenciar tags"
                                checked={rowChecked("chat_manage_tags", chatG.manage_tags)}
                                onChange={(v) => patchChatExtra("chat_manage_tags", v)}
                              />
                              <ChatToggle
                                id="chat-inv"
                                label="Criar fatura pelo chat"
                                checked={rowChecked("chat_create_invoice", chatG.create_invoice_from_chat)}
                                onChange={(v) => patchChatExtra("chat_create_invoice", v)}
                              />
                              <ChatToggle
                                id="chat-prop"
                                label="Criar proposta pelo chat"
                                checked={rowChecked("chat_create_proposal", chatG.create_proposal_from_chat)}
                                onChange={(v) => patchChatExtra("chat_create_proposal", v)}
                              />
                              <ChatToggle
                                id="chat-contract"
                                label="Criar contrato pelo chat"
                                checked={rowChecked("chat_create_contract", chatG.create_contract_from_chat)}
                                onChange={(v) => patchChatExtra("chat_create_contract", v)}
                              />
                              <ChatToggle
                                id="chat-schedule"
                                label="Agendar pelo chat"
                                checked={rowChecked("chat_schedule", chatG.schedule_from_chat)}
                                onChange={(v) => patchChatExtra("chat_schedule", v)}
                              />
                              <ChatToggle
                                id="chat-mqueues"
                                label="Gerenciar filas"
                                checked={rowChecked("chat_manage_queues", chatG.manage_queues)}
                                onChange={(v) => patchChatExtra("chat_manage_queues", v)}
                              />
                              <ChatToggle
                                id="chat-mteams"
                                label="Gerenciar equipes"
                                checked={rowChecked("chat_manage_teams", chatG.manage_teams)}
                                onChange={(v) => patchChatExtra("chat_manage_teams", v)}
                              />
                              <ChatToggle
                                id="chat-metrics"
                                label="Ver métricas"
                                checked={rowChecked("chat_view_metrics", chatG.view_metrics)}
                                onChange={(v) => patchChatExtra("chat_view_metrics", v)}
                              />
                              <ChatToggle
                                id="chat-auto"
                                label="Gerenciar automações"
                                checked={rowChecked("chat_manage_automation", chatG.manage_automation)}
                                onChange={(v) => patchChatExtra("chat_manage_automation", v)}
                              />
                              <ChatToggle
                                id="chat-crg"
                                label="Criar grupos WhatsApp"
                                checked={rowChecked("chat_create_group", chatG.create_group)}
                                onChange={(v) => patchChatExtra("chat_create_group", v)}
                              />
                              <ChatToggle
                                id="chat-mgr"
                                label="Gerenciar grupos WhatsApp"
                                checked={rowChecked("chat_manage_groups", chatG.manage_groups)}
                                onChange={(v) => patchChatExtra("chat_manage_groups", v)}
                              />
                              <ChatToggle
                                id="chat-mgr-part"
                                label="Participantes (grupo)"
                                checked={rowChecked(
                                  "chat_manage_group_participants",
                                  chatG.manage_group_participants
                                )}
                                onChange={(v) => patchChatExtra("chat_manage_group_participants", v)}
                              />
                              <ChatToggle
                                id="chat-mgr-set"
                                label="Configurações do grupo"
                                checked={rowChecked(
                                  "chat_manage_group_settings",
                                  chatG.manage_group_settings
                                )}
                                onChange={(v) => patchChatExtra("chat_manage_group_settings", v)}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  }

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

function ChatToggle(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5">
      <Checkbox
        id={props.id}
        checked={props.checked}
        className="mt-0.5"
        onCheckedChange={(v) => props.onChange(v === true)}
      />
      <Label htmlFor={props.id} className="text-xs font-normal leading-snug cursor-pointer">
        {props.label}
      </Label>
    </div>
  );
}
