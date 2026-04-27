import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  financialService,
  type FinancialAccountDto,
  type FinancialAccountPermissionGrantDto,
  type FinancialAccountPermissionsPayload,
  type FinancialAccountType,
  type FinancialAccountVisibilityMode,
  type FinancialGatewayProvider,
} from "@/services/financial";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS: { value: FinancialAccountType; label: string }[] = [
  { value: "bank", label: "Banco" },
  { value: "cash", label: "Caixa" },
  { value: "wallet", label: "Carteira" },
];

const GATEWAY_LABEL: Record<FinancialGatewayProvider, string> = {
  asaas: "Asaas",
  mercado_pago: "Mercado Pago",
};

const VISIBILITY_HELP: Record<FinancialAccountVisibilityMode, string> = {
  all_finance_users:
    "Qualquer utilizador com permissão para ver o módulo financeiro pode ver esta conta.",
  admins_only: "Apenas administradores da empresa podem ver esta conta.",
  restricted:
    "Apenas administradores e utilizadores ou equipas explicitamente indicados.",
};

export type FinancialSettingsSection = "settings" | "permissions" | "gateway";

export interface FinancialAccountSettingsDrawerProps {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Separador inicial ao abrir (ex.: pelo menu da engrenagem). */
  initialSection?: FinancialSettingsSection;
  /** Actualizado após guardar dados da conta ou permissões ou gateway. */
  onSaved?: () => void;
  /** Após exclusão bem-sucedida (ex.: navegar para a lista de contas). */
  onDeleted?: () => void;
}

type DraftGrant = {
  user_id?: string;
  team_id?: string;
  permission: "view" | "manage";
};

function grantsToDraft(rows: FinancialAccountPermissionGrantDto[]): DraftGrant[] {
  return rows.map((g) => ({
    user_id: g.user_id ?? undefined,
    team_id: g.team_id ?? undefined,
    permission: g.permission,
  }));
}

export function FinancialAccountSettingsDrawer({
  accountId,
  open,
  onOpenChange,
  initialSection = "settings",
  onSaved,
  onDeleted,
}: FinancialAccountSettingsDrawerProps) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<FinancialSettingsSection>(initialSection);

  const [account, setAccount] = useState<FinancialAccountDto | null>(null);
  const [settingsName, setSettingsName] = useState("");
  const [settingsType, setSettingsType] = useState<FinancialAccountType>("bank");
  const [settingsActive, setSettingsActive] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permPayload, setPermPayload] = useState<FinancialAccountPermissionsPayload | null>(null);
  const [visibilityMode, setVisibilityMode] = useState<FinancialAccountVisibilityMode>("all_finance_users");
  const [draftGrants, setDraftGrants] = useState<DraftGrant[]>([]);
  const [addUserId, setAddUserId] = useState<string>("");
  const [addTeamId, setAddTeamId] = useState<string>("");

  const [gwLoading, setGwLoading] = useState(false);
  const [gwSaving, setGwSaving] = useState(false);
  const [gwEnabled, setGwEnabled] = useState(false);
  const [gwGateway, setGwGateway] = useState<FinancialGatewayProvider>("asaas");
  const [gwDefault, setGwDefault] = useState(false);
  const [confirmGwOpen, setConfirmGwOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [pendingGwBody, setPendingGwBody] = useState<{
    enabled: boolean;
    gateway?: FinancialGatewayProvider;
    is_default_receivables?: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) setTab(initialSection);
  }, [open, initialSection]);

  const loadAccount = useCallback(async () => {
    try {
      const a = await financialService.getAccount(accountId);
      setAccount(a);
      setSettingsName(a.name);
      setSettingsType(a.type);
      setSettingsActive(a.is_active);
    } catch {
      toast.error("Não foi possível carregar a conta.");
    }
  }, [accountId]);

  const loadPermissions = useCallback(async () => {
    setPermLoading(true);
    try {
      const p = await financialService.getAccountPermissions(accountId);
      setPermPayload(p);
      setVisibilityMode(p.visibility_mode);
      setDraftGrants(grantsToDraft(p.grants));
    } catch {
      toast.error("Não foi possível carregar permissões.");
    } finally {
      setPermLoading(false);
    }
  }, [accountId]);

  const loadGateway = useCallback(async () => {
    setGwLoading(true);
    try {
      const { link } = await financialService.getAccountGatewayLink(accountId);
      if (link) {
        setGwEnabled(link.is_enabled);
        setGwGateway(link.gateway);
        setGwDefault(link.is_default_receivables);
      } else {
        setGwEnabled(false);
        setGwGateway("asaas");
        setGwDefault(false);
      }
    } catch {
      toast.error("Não foi possível carregar o vínculo com gateway.");
    } finally {
      setGwLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!open) return;
    void loadAccount();
  }, [open, loadAccount]);

  useEffect(() => {
    if (!open) return;
    if (tab === "permissions") void loadPermissions();
    if (tab === "gateway") void loadGateway();
  }, [open, tab, loadPermissions, loadGateway]);

  const tenantUsers = permPayload?.tenant_users ?? [];
  const teams = permPayload?.teams ?? [];
  const canEditPicker = (tenantUsers.length > 0 || teams.length > 0) && permPayload != null;

  const saveSettings = async () => {
    setSettingsSaving(true);
    try {
      const updated = await financialService.patchAccountSettings(accountId, {
        name: settingsName.trim(),
        type: settingsType,
        is_active: settingsActive,
      });
      setAccount(updated);
      toast.success("Conta actualizada.");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar.");
    } finally {
      setSettingsSaving(false);
    }
  };

  const savePermissions = async () => {
    setPermSaving(true);
    try {
      const grants =
        visibilityMode === "restricted"
          ? draftGrants.filter((g) => g.user_id || g.team_id)
          : [];
      await financialService.putAccountPermissions(accountId, {
        visibility_mode: visibilityMode,
        grants,
      });
      toast.success("Permissões guardadas.");
      await loadPermissions();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar permissões.");
    } finally {
      setPermSaving(false);
    }
  };

  const trySaveGateway = async (body: {
    enabled: boolean;
    gateway?: FinancialGatewayProvider;
    is_default_receivables?: boolean;
  }) => {
    setGwSaving(true);
    try {
      await financialService.putAccountGatewayLink(accountId, body);
      toast.success("Vínculo com gateway actualizado.");
      await loadGateway();
      await loadAccount();
      onSaved?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg === "CONFIRM_GATEWAY_CHANGE" || msg.includes("CONFIRM_GATEWAY")) {
        setPendingGwBody(body);
        setConfirmGwOpen(true);
      } else {
        toast.error(msg || "Erro ao guardar vínculo.");
      }
    } finally {
      setGwSaving(false);
    }
  };

  const confirmGatewayChange = async () => {
    if (!pendingGwBody) return;
    setGwSaving(true);
    try {
      await financialService.putAccountGatewayLink(accountId, pendingGwBody, {
        confirmGatewayChange: true,
      });
      toast.success("Vínculo com gateway actualizado.");
      setConfirmGwOpen(false);
      setPendingGwBody(null);
      await loadGateway();
      await loadAccount();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar vínculo.");
    } finally {
      setGwSaving(false);
    }
  };

  const canDeleteAccount = account != null && !account.is_active;

  const confirmDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      await financialService.deleteAccount(accountId);
      toast.success("Conta excluída");
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onDeleted?.();
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível excluir a conta");
    } finally {
      setDeleteLoading(false);
    }
  };

  const addGrant = () => {
    const uid = addUserId.trim();
    const tid = addTeamId.trim();
    if (!uid && !tid) {
      toast.error("Seleccione um utilizador ou uma equipa.");
      return;
    }
    if (uid && tid) {
      toast.error("Escolha apenas utilizador ou equipa.");
      return;
    }
    if (uid && draftGrants.some((g) => g.user_id === uid)) {
      toast.error("Este utilizador já está na lista.");
      return;
    }
    if (tid && draftGrants.some((g) => g.team_id === tid)) {
      toast.error("Esta equipa já está na lista.");
      return;
    }
    setDraftGrants((prev) => [...prev, { user_id: uid || undefined, team_id: tid || undefined, permission: "view" }]);
    setAddUserId("");
    setAddTeamId("");
  };

  const removeGrant = (idx: number) => {
    setDraftGrants((prev) => prev.filter((_, i) => i !== idx));
  };

  const gatewayWarning = useMemo(
    () =>
      "Alterar o gateway desta conta afecta novos recebimentos. Recebimentos antigos já sincronizados não serão movidos automaticamente.",
    []
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "flex flex-col gap-0 p-0",
            isMobile ? "h-[100dvh] max-h-[100dvh] rounded-t-xl sm:max-w-none w-full" : "sm:max-w-md w-full"
          )}
        >
          <SheetHeader className="px-6 pt-6 pb-2 space-y-1 border-b border-border">
            <SheetTitle>Configuração da conta</SheetTitle>
            <SheetDescription>
              {account?.name ?? "Conta financeira"}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={tab} onValueChange={(v) => setTab(v as FinancialSettingsSection)}>
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="settings">Dados</TabsTrigger>
                <TabsTrigger value="permissions">Permissões</TabsTrigger>
                <TabsTrigger value="gateway">Gateway</TabsTrigger>
              </TabsList>

              <TabsContent value="settings" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Label htmlFor="fa-name">Nome da conta</Label>
                  <Input
                    id="fa-name"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={settingsType} onValueChange={(v) => setSettingsType(v as FinancialAccountType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label className="text-base">Conta activa</Label>
                    <p className="text-xs text-muted-foreground">Contas inactivas deixam de aparecer nas escolhas por defeito.</p>
                  </div>
                  <Switch checked={settingsActive} onCheckedChange={setSettingsActive} />
                </div>
                <Button type="button" onClick={() => void saveSettings()} disabled={settingsSaving}>
                  {settingsSaving ? "A guardar…" : "Guardar dados"}
                </Button>

                <div className="pt-4 border-t space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {account?.is_active
                      ? "Desactive a conta (interruptor acima) e clique em «Guardar dados» para desbloquear a exclusão definitiva."
                      : "A exclusão remove o registo da base de dados. Só é possível se não existirem movimentos, transferências nem despesas recorrentes associados a esta conta."}
                  </p>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={!canDeleteAccount || deleteLoading}
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    {deleteLoading ? "A excluir…" : "Excluir conta"}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="permissions" className="space-y-4 mt-0">
                {permLoading ? (
                  <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : (
                  <>
                    <div className="space-y-3">
                      <Label>Quem pode visualizar esta conta?</Label>
                      <RadioGroup
                        value={visibilityMode}
                        onValueChange={(v) => setVisibilityMode(v as FinancialAccountVisibilityMode)}
                        className="space-y-2"
                      >
                        <div className="flex items-start gap-2 rounded-md border p-3">
                          <RadioGroupItem value="all_finance_users" id="vm-all" className="mt-1" />
                          <div>
                            <Label htmlFor="vm-all" className="font-medium cursor-pointer">
                              Todos com acesso ao financeiro
                            </Label>
                            <p className="text-xs text-muted-foreground">{VISIBILITY_HELP.all_finance_users}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 rounded-md border p-3">
                          <RadioGroupItem value="admins_only" id="vm-adm" className="mt-1" />
                          <div>
                            <Label htmlFor="vm-adm" className="font-medium cursor-pointer">
                              Só administradores da empresa
                            </Label>
                            <p className="text-xs text-muted-foreground">{VISIBILITY_HELP.admins_only}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2 rounded-md border p-3">
                          <RadioGroupItem value="restricted" id="vm-rest" className="mt-1" />
                          <div>
                            <Label htmlFor="vm-rest" className="font-medium cursor-pointer">
                              Utilizadores ou equipas específicas
                            </Label>
                            <p className="text-xs text-muted-foreground">{VISIBILITY_HELP.restricted}</p>
                          </div>
                        </div>
                      </RadioGroup>
                    </div>

                    {visibilityMode === "restricted" && (
                      <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
                        <p className="text-sm font-medium">Permissões específicas</p>
                        {!canEditPicker ? (
                          <p className="text-xs text-muted-foreground">
                            Sem permissão para editar listas de utilizadores ou as listas estão vazias. Peça a um
                            administrador financeiro.
                          </p>
                        ) : (
                          <>
                            {draftGrants.map((g, idx) => (
                              <div
                                key={`${g.user_id ?? ""}-${g.team_id ?? ""}-${idx}`}
                                className="flex flex-wrap items-center gap-2 text-sm"
                              >
                                <span className="flex-1 min-w-[140px]">
                                  {g.user_id
                                    ? tenantUsers.find((u) => u.id === g.user_id)?.display_name ?? g.user_id
                                    : teams.find((t) => t.id === g.team_id)?.name ?? g.team_id}
                                  <span className="text-muted-foreground">
                                    {" "}
                                    ({g.user_id ? "utilizador" : "equipa"})
                                  </span>
                                </span>
                                <Select
                                  value={g.permission}
                                  onValueChange={(v) =>
                                    setDraftGrants((prev) =>
                                      prev.map((row, i) =>
                                        i === idx ? { ...row, permission: v as "view" | "manage" } : row
                                      )
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="view">Ver</SelectItem>
                                    <SelectItem value="manage">Gerir</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeGrant(idx)}>
                                  Remover
                                </Button>
                              </div>
                            ))}
                            <div className="grid gap-2 sm:grid-cols-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Adicionar utilizador</Label>
                                <Select value={addUserId || "__none__"} onValueChange={(v) => {
                                  setAddUserId(v === "__none__" ? "" : v);
                                  if (v !== "__none__") setAddTeamId("");
                                }}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">—</SelectItem>
                                    {tenantUsers.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {u.display_name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Adicionar equipa</Label>
                                <Select value={addTeamId || "__none__"} onValueChange={(v) => {
                                  setAddTeamId(v === "__none__" ? "" : v);
                                  if (v !== "__none__") setAddUserId("");
                                }}>
                                  <SelectTrigger>
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">—</SelectItem>
                                    {teams.map((t) => (
                                      <SelectItem key={t.id} value={t.id}>
                                        {t.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <Button type="button" variant="secondary" size="sm" onClick={addGrant}>
                              Adicionar à lista
                            </Button>
                          </>
                        )}
                      </div>
                    )}

                    <Button type="button" onClick={() => void savePermissions()} disabled={permSaving}>
                      {permSaving ? "A guardar…" : "Guardar permissões"}
                    </Button>
                  </>
                )}
              </TabsContent>

              <TabsContent value="gateway" className="space-y-4 mt-0">
                {gwLoading ? (
                  <p className="text-sm text-muted-foreground">A carregar…</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">{gatewayWarning}</p>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <Label htmlFor="gw-en">Vínculo com gateway activo</Label>
                      <Switch id="gw-en" checked={gwEnabled} onCheckedChange={setGwEnabled} />
                    </div>
                    {gwEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label>Gateway</Label>
                          <Select
                            value={gwGateway}
                            onValueChange={(v) => setGwGateway(v as FinancialGatewayProvider)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="asaas">{GATEWAY_LABEL.asaas}</SelectItem>
                              <SelectItem value="mercado_pago">{GATEWAY_LABEL.mercado_pago}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <Label className="text-base">Conta padrão para recebimentos deste gateway</Label>
                            <p className="text-xs text-muted-foreground">
                              Apenas uma conta por gateway pode ser padrão.
                            </p>
                          </div>
                          <Switch checked={gwDefault} onCheckedChange={setGwDefault} />
                        </div>
                      </>
                    )}
                    <Button
                      type="button"
                      onClick={() =>
                        void trySaveGateway(
                          gwEnabled
                            ? { enabled: true, gateway: gwGateway, is_default_receivables: gwDefault }
                            : { enabled: false }
                        )
                      }
                      disabled={gwSaving}
                    >
                      {gwSaving ? "A guardar…" : "Guardar vínculo"}
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmGwOpen} onOpenChange={setConfirmGwOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de gateway</AlertDialogTitle>
            <AlertDialogDescription>{gatewayWarning}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmGatewayChange()}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acção é irreversível. Se a API recusar, ainda existem movimentos ou outras ligações a esta conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDeleteAccount();
              }}
              disabled={deleteLoading}
            >
              {deleteLoading ? "A excluir…" : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
