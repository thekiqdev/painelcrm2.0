import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  chatService,
  type ChatAutomationRuleDto,
  type ChatAutomationSettingsDto,
  type ChatOperationsDashboardDto,
  type ChatQueueDistributionRowDto,
  type ChatQueueRowDto,
  type ChatAutomationRuleInput,
} from "@/services/chat";
import { teamsService, type Team } from "@/services/teams";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import { ExternalLink, Loader2, Plus, Trash2, Users } from "lucide-react";

function strategyLabel(s: string | null): string {
  if (!s || s === "none") return "Manual";
  if (s === "round_robin") return "Rodízio";
  if (s === "least_open") return "Menor carga";
  return s;
}

export function ChatAttendanceSettingsSection() {
  const { canView, canEdit, loading: permLoading } = useModulePermissions();
  const canManage = canEdit("chat") && !permLoading;
  const showChat = canView("chat");

  const [tab, setTab] = useState("queues");
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState<ChatQueueRowDto[]>([]);
  const [distribution, setDistribution] = useState<ChatQueueDistributionRowDto[]>([]);
  const [dashboard, setDashboard] = useState<ChatOperationsDashboardDto | null>(null);
  const [settings, setSettings] = useState<ChatAutomationSettingsDto | null>(null);
  const [rules, setRules] = useState<ChatAutomationRuleDto[]>([]);
  const [logs, setLogs] = useState<Awaited<ReturnType<typeof chatService.listAutomationLogs>>["items"]>(
    [],
  );
  const [teams, setTeams] = useState<Team[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

  const [newQueueName, setNewQueueName] = useState("");

  const [queueDialog, setQueueDialog] = useState<ChatQueueRowDto | null>(null);
  const [distTeamId, setDistTeamId] = useState<string>("");
  const [distStrategy, setDistStrategy] = useState<"none" | "round_robin" | "least_open">("none");
  const [distAuto, setDistAuto] = useState(false);
  const [queueSaving, setQueueSaving] = useState(false);

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<ChatAutomationRuleInput>({
    name: "",
    match_type: "keyword_body",
    pattern: "",
    action: "set_queue",
    target_queue_id: null,
    target_team_id: null,
    target_user_id: null,
    priority_value: null,
    priority: 100,
    is_active: true,
  });

  const reload = useCallback(async () => {
    if (!showChat) return;
    setLoading(true);
    try {
      const [qRes, dash] = await Promise.all([
        chatService.listQueues(),
        chatService.getOperationsDashboard().catch(() => null),
      ]);
      setQueues(qRes.items ?? []);
      setDashboard(dash);

      if (canManage) {
        const [distRes, setRes, rulesRes, logsRes, teamsList, usersList] = await Promise.all([
          chatService.listQueueDistribution().catch(() => ({ items: [] as ChatQueueDistributionRowDto[] })),
          chatService.getAutomationSettings().catch(() => null),
          chatService.listAutomationRules().catch(() => ({ items: [] as ChatAutomationRuleDto[] })),
          chatService.listAutomationLogs(50).catch(() => ({ items: [] })),
          teamsService.getTeams().catch(() => [] as Team[]),
          getMyTenantUsers().catch(() => [] as TenantUser[]),
        ]);
        setDistribution(distRes.items ?? []);
        if (setRes) setSettings(setRes);
        setRules(rulesRes.items ?? []);
        setLogs(logsRes.items ?? []);
        setTeams(teamsList);
        setTenantUsers(usersList);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar atendimento");
    } finally {
      setLoading(false);
    }
  }, [showChat, canManage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCountByQueue = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of dashboard?.by_queue ?? []) {
      m.set(row.queue_id, row.open_count);
    }
    return m;
  }, [dashboard]);

  const slaTabRows = useMemo(() => {
    if (dashboard?.by_queue?.length) return dashboard.by_queue;
    return queues.map((q) => ({
      queue_id: q.id,
      name: q.name,
      open_count: 0,
      sla_first_minutes: q.sla_first_response_minutes ?? null,
      sla_next_minutes: q.sla_next_response_minutes ?? null,
    }));
  }, [dashboard, queues]);

  const distByQueue = useMemo(() => {
    const m = new Map<string, ChatQueueDistributionRowDto>();
    for (const d of distribution) m.set(d.queue_id, d);
    return m;
  }, [distribution]);

  const openQueueEditor = (q: ChatQueueRowDto) => {
    setQueueDialog(q);
    const row = distByQueue.get(q.id);
    setDistTeamId(row?.team_id ?? "__none__");
    setDistStrategy((row?.strategy as typeof distStrategy) || "none");
    setDistAuto(row?.auto_assign === true);
  };

  const saveQueueAndDist = async () => {
    if (!queueDialog || !canManage) return;
    setQueueSaving(true);
    try {
      await chatService.patchQueue(queueDialog.id, {
        name: queueDialog.name,
        color: queueDialog.color ?? null,
        is_active: queueDialog.is_active,
        sla_first_response_minutes: queueDialog.sla_first_response_minutes ?? null,
        sla_next_response_minutes: queueDialog.sla_next_response_minutes ?? null,
      });
      await chatService.putQueueDistribution(queueDialog.id, {
        team_id: distTeamId === "__none__" ? null : distTeamId,
        strategy: distStrategy,
        auto_assign: distAuto,
      });
      toast.success("Fila atualizada");
      setQueueDialog(null);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setQueueSaving(false);
    }
  };

  const patchSettings = async (patch: Partial<ChatAutomationSettingsDto>) => {
    if (!canManage) return;
    try {
      const next = await chatService.patchAutomationSettings(patch);
      setSettings(next);
      toast.success("Definições guardadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    }
  };

  const addQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !newQueueName.trim()) return;
    try {
      await chatService.createQueue({ name: newQueueName.trim() });
      toast.success("Fila criada");
      setNewQueueName("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar fila");
    }
  };

  const createRule = async () => {
    if (!canManage) return;
    const pattern =
      ruleForm.match_type === "client_new" || ruleForm.match_type === "client_existing"
        ? "."
        : ruleForm.pattern.trim();
    if (!pattern) {
      toast.error("Indique o texto ou condição da regra");
      return;
    }
    try {
      await chatService.createAutomationRule({
        ...ruleForm,
        pattern,
        target_queue_id: ruleForm.action === "set_queue" ? ruleForm.target_queue_id ?? null : null,
        target_team_id: ruleForm.action === "set_team" ? ruleForm.target_team_id ?? null : null,
        target_user_id: ruleForm.action === "assign_user" ? ruleForm.target_user_id ?? null : null,
      });
      toast.success("Regra criada");
      setRuleDialogOpen(false);
      const r = await chatService.listAutomationRules();
      setRules(r.items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar regra");
    }
  };

  const toggleRule = async (rule: ChatAutomationRuleDto, active: boolean) => {
    if (!canManage) return;
    try {
      await chatService.patchAutomationRule(rule.id, { is_active: active });
      setRules((prev) => prev.map((x) => (x.id === rule.id ? { ...x, is_active: active } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao atualizar");
    }
  };

  const removeRule = async (id: string) => {
    if (!canManage) return;
    try {
      await chatService.deleteAutomationRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Regra removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  const ruleSummary = (r: ChatAutomationRuleDto): string => {
    const cond =
      r.match_type === "keyword_body"
        ? `Contém «${r.pattern}»`
        : r.match_type === "client_tag"
          ? `Etiqueta «${r.pattern}»`
          : r.match_type === "client_new"
            ? "Cliente novo"
            : "Cliente existente";
    let act = "";
    if (r.action === "set_queue") act = "Mover para fila";
    else if (r.action === "set_team") act = "Atribuir equipe";
    else if (r.action === "set_priority") act = "Alterar prioridade";
    else if (r.action === "assign_user") act = "Atribuir utilizador";
    return `${cond} → ${act}`;
  };

  if (!showChat) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Chat e atendimento</CardTitle>
          <CardDescription>Sem permissão para ver este módulo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Chat e atendimento</h2>
        <p className="text-sm text-muted-foreground">
          Filas, SLA, distribuição e regras automáticas do atendimento.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="w-full space-y-4">
          <ScrollArea className="w-full pb-1">
            <TabsList className="inline-flex h-auto min-h-10 w-max max-w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="queues" className="text-xs sm:text-sm">
                Filas
              </TabsTrigger>
              <TabsTrigger value="teams" className="text-xs sm:text-sm">
                Equipes
              </TabsTrigger>
              <TabsTrigger value="sla" className="text-xs sm:text-sm">
                SLA
              </TabsTrigger>
              <TabsTrigger value="automation" className="text-xs sm:text-sm">
                Automação
              </TabsTrigger>
              <TabsTrigger value="rules" className="text-xs sm:text-sm">
                Regras
              </TabsTrigger>
            </TabsList>
          </ScrollArea>

          <TabsContent value="queues" className="space-y-4 mt-0">
            {canManage ? (
              <form onSubmit={addQueue} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <Label>Nova fila</Label>
                  <Input
                    value={newQueueName}
                    onChange={(e) => setNewQueueName(e.target.value)}
                    placeholder="Ex.: Comercial"
                    maxLength={80}
                  />
                </div>
                <Button type="submit" disabled={!newQueueName.trim()} className="shrink-0">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar
                </Button>
              </form>
            ) : null}

            {queues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma fila definida.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {queues.map((q) => {
                  const drow = distByQueue.get(q.id);
                  const openN = openCountByQueue.get(q.id) ?? 0;
                  return (
                    <li key={q.id}>
                      <Card className="h-full border-border">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="h-3 w-3 shrink-0 rounded-full border border-border"
                                style={{ backgroundColor: q.color || "#94a3b8" }}
                              />
                              <CardTitle className="truncate text-base">{q.name}</CardTitle>
                            </div>
                            <Badge variant={q.is_active === false ? "secondary" : "default"}>
                              {q.is_active === false ? "Inativa" : "Ativa"}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            Conversas abertas: <span className="font-medium text-foreground">{openN}</span>
                            {" · "}
                            Distribuição:{" "}
                            {drow?.auto_assign ? (
                              <span className="text-foreground">Automática</span>
                            ) : (
                              <span>Desligada</span>
                            )}
                            {" · "}
                            {strategyLabel(drow?.strategy ?? null)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-1 text-xs text-muted-foreground">
                          <p>
                            SLA 1ª resposta:{" "}
                            <span className="text-foreground">
                              {q.sla_first_response_minutes != null ? `${q.sla_first_response_minutes} min` : "—"}
                            </span>
                          </p>
                          <p>
                            SLA resposta contínua:{" "}
                            <span className="text-foreground">
                              {q.sla_next_response_minutes != null ? `${q.sla_next_response_minutes} min` : "—"}
                            </span>
                          </p>
                          {canManage ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2 w-full sm:w-auto"
                              onClick={() => openQueueEditor(q)}
                            >
                              Editar / distribuição
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            )}
          </TabsContent>

          <TabsContent value="teams" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Equipes
                </CardTitle>
                <CardDescription>
                  As mesmas equipes da empresa. Gerir membros em Configurações → Equipes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Em cada fila (separador Filas) pode associar uma equipa e o método de distribuição (rodízio ou menor
                  carga).
                </p>
                <Button variant="outline" asChild>
                  <Link to="/settings?section=teams" className="inline-flex items-center gap-1">
                    Abrir gestão de equipes
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sla" className="space-y-4 mt-0">
            <Card>
              <CardHeader>
                <CardTitle>Alertas e patamar de risco</CardTitle>
                <CardDescription>
                  Valores por defeito do tenant e alerta no sininho quando o SLA está quase a vencer.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canManage || !settings ? (
                  <p className="text-sm text-muted-foreground">
                    {canManage ? "Sem dados de configuração." : "Apenas utilizadores com permissão de gestão podem alterar o SLA."}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-0.5">
                        <Label>Alertas de SLA (sininho)</Label>
                        <p className="text-xs text-muted-foreground">Notificações quando uma conversa entra em risco.</p>
                      </div>
                      <Switch
                        checked={settings.sla_alerts_enabled !== false}
                        onCheckedChange={(v) => void patchSettings({ sla_alerts_enabled: v })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Início do «em risco» (% do tempo)</Label>
                      <Input
                        type="number"
                        min={50}
                        max={99}
                        className="max-w-[120px]"
                        value={settings.sla_risk_percent ?? 80}
                        onChange={(e) =>
                          setSettings((s) =>
                            s ? { ...s, sla_risk_percent: parseInt(e.target.value, 10) || 80 } : s,
                          )
                        }
                        onBlur={() => {
                          if (settings.sla_risk_percent != null) {
                            void patchSettings({ sla_risk_percent: settings.sla_risk_percent });
                          }
                        }}
                      />
                      <p className="text-xs text-muted-foreground">Entre 50% e 99% do prazo.</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2">
              {slaTabRows.map((row) => (
                <Card key={row.queue_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{row.name}</CardTitle>
                    <CardDescription>
                      Abertas: {row.open_count} · 1ª resposta:{" "}
                      {row.sla_first_minutes != null ? `${row.sla_first_minutes} min` : "—"} · Contínua:{" "}
                      {row.sla_next_minutes != null ? `${row.sla_next_minutes} min` : "—"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    Estado global do painel:{" "}
                    <span className="font-medium text-foreground">
                      {dashboard && dashboard.summary.sla_breached + dashboard.summary.sla_at_risk > 0
                        ? "Verifique conversas no Chat (filtros SLA)"
                        : "Dentro do esperado"}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="automation" className="space-y-4 mt-0">
            {!canManage || !settings ? (
              <p className="text-sm text-muted-foreground">
                {canManage ? "Sem dados." : "Sem permissão para alterar automações."}
              </p>
            ) : (
              <>
                <div className="space-y-4 rounded-lg border border-border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Automações de atendimento</p>
                      <p className="text-xs text-muted-foreground">Regras de encaminhamento e mensagens automáticas.</p>
                    </div>
                    <Switch
                      checked={settings.automation_enabled}
                      onCheckedChange={(v) => void patchSettings({ automation_enabled: v })}
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Distribuição automática</p>
                      <p className="text-xs text-muted-foreground">Atribuir conversas à equipa da fila quando configurado.</p>
                    </div>
                    <Switch
                      checked={settings.distribution_enabled}
                      onCheckedChange={(v) => void patchSettings({ distribution_enabled: v })}
                    />
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">Mudança automática de estado</p>
                      <p className="text-xs text-muted-foreground">Atualizar estado quando cliente ou agente escreve.</p>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={settings.auto_status_from_customer}
                          onCheckedChange={(v) => void patchSettings({ auto_status_from_customer: v })}
                        />
                        Cliente
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <Switch
                          checked={settings.auto_status_from_agent}
                          onCheckedChange={(v) => void patchSettings({ auto_status_from_agent: v })}
                        />
                        Agente
                      </label>
                    </div>
                  </div>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Histórico de automações</CardTitle>
                    <CardDescription>Últimas execuções registadas pelo motor.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {logs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sem registos.</p>
                    ) : (
                      <ScrollArea className="h-[280px] pr-3">
                        <ul className="space-y-2 text-sm">
                          {logs.map((log) => (
                            <li
                              key={log.id}
                              className="rounded-md border border-border/60 px-3 py-2 text-xs leading-snug"
                            >
                              <div className="font-medium text-foreground">
                                {new Date(log.created_at).toLocaleString()}
                              </div>
                              <div className="text-muted-foreground">
                                {log.action_type} · {log.result}
                                {log.error_message ? (
                                  <span className="text-destructive"> · {log.error_message}</span>
                                ) : null}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="rules" className="space-y-4 mt-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Condições e ações executadas automaticamente (prioridade mais baixa = corre primeiro).
              </p>
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  className="shrink-0 sm:fixed sm:bottom-6 sm:right-6 sm:z-40 md:static"
                  onClick={() => {
                    setRuleForm({
                      name: "",
                      match_type: "keyword_body",
                      pattern: "",
                      action: "set_queue",
                      target_queue_id: queues[0]?.id ?? null,
                      target_team_id: null,
                      target_user_id: null,
                      priority_value: null,
                      priority: 100,
                      is_active: true,
                    });
                    setRuleDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova regra
                </Button>
              ) : null}
            </div>

            {!canManage ? (
              <p className="text-sm text-muted-foreground">Sem permissão para gerir regras.</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma regra definida.</p>
            ) : (
              <ul className="grid gap-3 md:hidden">
                {rules.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium leading-tight">{r.name?.trim() || "Regra"}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{ruleSummary(r)}</p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Prioridade {r.priority}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Switch checked={r.is_active} onCheckedChange={(v) => void toggleRule(r, v)} />
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => void removeRule(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canManage && rules.length > 0 ? (
              <div className="hidden md:block">
                <ScrollArea className="w-full">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="pb-2 pr-2">Nome</th>
                        <th className="pb-2 pr-2">Resumo</th>
                        <th className="pb-2 pr-2">Prioridade</th>
                        <th className="pb-2 pr-2">Ativo</th>
                        <th className="pb-2"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map((r) => (
                        <tr key={r.id} className="border-b border-border/50">
                          <td className="py-2 pr-2 align-top font-medium">{r.name?.trim() || "—"}</td>
                          <td className="py-2 pr-2 align-top text-muted-foreground">{ruleSummary(r)}</td>
                          <td className="py-2 pr-2 align-top tabular-nums">{r.priority}</td>
                          <td className="py-2 pr-2 align-top">
                            <Switch checked={r.is_active} onCheckedChange={(v) => void toggleRule(r, v)} />
                          </td>
                          <td className="py-2 align-top">
                            <Button type="button" variant="ghost" size="icon" onClick={() => void removeRule(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!queueDialog} onOpenChange={(o) => !o && setQueueDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar fila</DialogTitle>
          </DialogHeader>
          {queueDialog ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={queueDialog.name}
                  onChange={(e) => setQueueDialog({ ...queueDialog, name: e.target.value })}
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label>Fila ativa</Label>
                <Switch
                  checked={queueDialog.is_active !== false}
                  onCheckedChange={(v) => setQueueDialog({ ...queueDialog, is_active: v })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">SLA 1ª (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={queueDialog.sla_first_response_minutes ?? ""}
                    onChange={(e) =>
                      setQueueDialog({
                        ...queueDialog,
                        sla_first_response_minutes: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">SLA contínua (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={queueDialog.sla_next_response_minutes ?? ""}
                    onChange={(e) =>
                      setQueueDialog({
                        ...queueDialog,
                        sla_next_response_minutes: e.target.value ? parseInt(e.target.value, 10) : null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Distribuição automática</Label>
                <Switch checked={distAuto} onCheckedChange={setDistAuto} />
              </div>
              <div className="space-y-1">
                <Label>Equipa</Label>
                <Select value={distTeamId} onValueChange={setDistTeamId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Equipa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Método</Label>
                <Select value={distStrategy} onValueChange={(v) => setDistStrategy(v as typeof distStrategy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Manual</SelectItem>
                    <SelectItem value="round_robin">Rodízio</SelectItem>
                    <SelectItem value="least_open">Menor carga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setQueueDialog(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={queueSaving} onClick={() => void saveQueueAndDist()}>
              {queueSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova regra automática</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={ruleForm.name ?? ""}
                onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Palavra financeiro → fila Financeiro"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={ruleForm.priority ?? 100}
                  onChange={(e) =>
                    setRuleForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 100 }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Condição</Label>
                <Select
                  value={ruleForm.match_type}
                  onValueChange={(v) =>
                    setRuleForm((f) => ({
                      ...f,
                      match_type: v as ChatAutomationRuleInput["match_type"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword_body">Palavra-chave na mensagem</SelectItem>
                    <SelectItem value="client_tag">Etiqueta do cliente</SelectItem>
                    <SelectItem value="client_new">Cliente novo</SelectItem>
                    <SelectItem value="client_existing">Cliente existente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {ruleForm.match_type === "keyword_body" || ruleForm.match_type === "client_tag" ? (
              <div className="space-y-1">
                <Label>Valor</Label>
                <Input
                  value={ruleForm.pattern}
                  onChange={(e) => setRuleForm((f) => ({ ...f, pattern: e.target.value }))}
                  placeholder="Texto a detetar"
                />
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Ação</Label>
              <Select
                value={ruleForm.action}
                onValueChange={(v) =>
                  setRuleForm((f) => ({
                    ...f,
                    action: v as ChatAutomationRuleInput["action"],
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="set_queue">Mover para fila</SelectItem>
                  <SelectItem value="set_team">Atribuir equipe</SelectItem>
                  <SelectItem value="assign_user">Atribuir utilizador</SelectItem>
                  <SelectItem value="set_priority">Alterar prioridade</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ruleForm.action === "set_queue" ? (
              <div className="space-y-1">
                <Label>Fila</Label>
                <Select
                  value={ruleForm.target_queue_id ?? ""}
                  onValueChange={(v) => setRuleForm((f) => ({ ...f, target_queue_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher fila" />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={q.id}>
                        {q.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {ruleForm.action === "set_team" ? (
              <div className="space-y-1">
                <Label>Equipa</Label>
                <Select
                  value={ruleForm.target_team_id ?? ""}
                  onValueChange={(v) => setRuleForm((f) => ({ ...f, target_team_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Equipa" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {ruleForm.action === "assign_user" ? (
              <div className="space-y-1">
                <Label>Utilizador</Label>
                <Select
                  value={ruleForm.target_user_id ?? ""}
                  onValueChange={(v) => setRuleForm((f) => ({ ...f, target_user_id: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Utilizador" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.name || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {ruleForm.action === "set_priority" ? (
              <div className="space-y-1">
                <Label>Prioridade (texto livre)</Label>
                <Input
                  value={ruleForm.priority_value ?? ""}
                  onChange={(e) => setRuleForm((f) => ({ ...f, priority_value: e.target.value }))}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void createRule()}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
