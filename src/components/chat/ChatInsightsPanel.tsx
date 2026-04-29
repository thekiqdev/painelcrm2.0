import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { chatService, type ChatAutomationSettingsDto, type ChatOperationalMetrics } from '@/services/chat';
import { teamsService, type Team } from '@/services/teams';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/sonner';
import { cn } from '@/lib/utils';

function formatSec(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '—';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

type Props = {
  canViewMetrics: boolean;
  canManageAutomation: boolean;
  className?: string;
};

export const ChatInsightsPanel: React.FC<Props> = ({
  canViewMetrics,
  canManageAutomation,
  className,
}) => {
  const [metrics, setMetrics] = useState<ChatOperationalMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [settings, setSettings] = useState<ChatAutomationSettingsDto | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [queueDist, setQueueDist] = useState<Awaited<ReturnType<typeof chatService.listQueueDistribution>> | null>(null);
  const [newRule, setNewRule] = useState({
    match_type: 'keyword_body' as 'keyword_body' | 'client_tag',
    pattern: '',
    action: 'set_queue' as 'set_queue' | 'set_team' | 'set_priority',
    target_queue_id: '' as string,
  });
  const [rulesList, setRulesList] = useState<
    Awaited<ReturnType<typeof chatService.listAutomationRules>>['items']
  >([]);

  const loadMetrics = useCallback(async () => {
    if (!canViewMetrics) return;
    setLoading(true);
    try {
      const m = await chatService.getMetrics();
      setMetrics(m);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível carregar as métricas de chat');
    } finally {
      setLoading(false);
    }
  }, [canViewMetrics]);

  const loadAutomation = useCallback(async () => {
    if (!canManageAutomation) return;
    setSettingsLoading(true);
    try {
      const [s, d, t] = await Promise.all([
        chatService.getAutomationSettings(),
        chatService.listQueueDistribution(),
        teamsService.getTeams().catch(() => [] as Team[]),
      ]);
      setSettings(s);
      setQueueDist(d);
      setTeams(t);
      const r = await chatService.listAutomationRules();
      setRulesList(r.items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro';
      if (String(msg).includes('503') || String(msg).includes('Migração')) {
        toast('Automação Fase 6: aplique a migração no servidor');
      } else {
        toast.error('Não foi possível carregar a automação');
      }
    } finally {
      setSettingsLoading(false);
    }
  }, [canManageAutomation]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    if (automationOpen) void loadAutomation();
  }, [automationOpen, loadAutomation]);

  const saveSettings = async (patch: Partial<ChatAutomationSettingsDto>) => {
    if (!canManageAutomation) return;
    try {
      const next = await chatService.patchAutomationSettings(patch);
      setSettings(next);
      toast.success('Configuração guardada');
    } catch {
      toast.error('Falha ao guardar');
    }
  };

  const onSaveDistribution = async (queueId: string, teamId: string | null, strategy: string, auto: boolean) => {
    try {
      await chatService.putQueueDistribution(queueId, {
        team_id: teamId,
        strategy: strategy as 'none' | 'round_robin' | 'least_open',
        auto_assign: auto,
      });
      const d = await chatService.listQueueDistribution();
      setQueueDist(d);
      toast.success('Distribuição atualizada');
    } catch {
      toast.error('Falha ao guardar a fila');
    }
  };

  const onAddRule = async () => {
    if (!newRule.pattern.trim()) {
      toast.error('Indique o padrão');
      return;
    }
    try {
      await chatService.createAutomationRule({
        match_type: newRule.match_type,
        pattern: newRule.pattern.trim(),
        action: newRule.action,
        target_queue_id: newRule.action === 'set_queue' && newRule.target_queue_id ? newRule.target_queue_id : null,
        target_team_id: newRule.action === 'set_team' && newRule.target_queue_id ? newRule.target_queue_id : null,
        priority_value: newRule.action === 'set_priority' ? newRule.target_queue_id || null : null,
      });
      const r = await chatService.listAutomationRules();
      setRulesList(r.items);
      setNewRule((prev) => ({ ...prev, pattern: '' }));
      toast.success('Regra criada');
    } catch {
      toast.error('Falha ao criar regra');
    }
  };

  const onDeleteRule = async (id: string) => {
    try {
      await chatService.deleteAutomationRule(id);
      setRulesList((prev) => prev.filter((x) => x.id !== id));
      toast.success('Regra removida');
    } catch {
      toast.error('Falha ao remover');
    }
  };

  if (!canViewMetrics) return null;

  const topQueues = (metrics?.by_queue_active ?? []).slice(0, 5);
  const topAgents = (metrics?.by_assignee_active ?? []).slice(0, 5);

  return (
    <div className={cn('rounded-lg border border-border bg-muted/20 px-3 py-2.5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Operação
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={() => void loadMetrics()}
          disabled={loading}
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          Atualizar
        </Button>
        {canManageAutomation && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1 px-2 text-xs sm:ml-0"
            onClick={() => setAutomationOpen(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Automação Fase 6
          </Button>
        )}
      </div>
      {metrics && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">1ª resposta (méd.)</span>
            <div className="font-semibold tabular-nums">{formatSec(metrics.avg_first_response_sec)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Resposta contínua (méd.)</span>
            <div className="font-semibold tabular-nums">{formatSec(metrics.avg_next_reply_sec)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Em progresso</span>
            <div className="font-semibold tabular-nums">{metrics.in_progress}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Pendentes</span>
            <div className="font-semibold tabular-nums">{metrics.pending_attendance}</div>
          </div>
        </div>
      )}
      {(topQueues.length > 0 || topAgents.length > 0) && (
        <div className="mt-2 grid gap-2 text-[11px] sm:grid-cols-2">
          {topQueues.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Filas (carga ativa)</span>
              <ul className="mt-0.5 space-y-0.5">
                {topQueues.map((q) => (
                  <li key={q.queue_id} className="flex justify-between gap-2 tabular-nums">
                    <span className="truncate">{q.name}</span>
                    <span>{q.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {topAgents.length > 0 && (
            <div>
              <span className="font-medium text-muted-foreground">Atendentes (ativos)</span>
              <ul className="mt-0.5 space-y-0.5">
                {topAgents.map((a) => (
                  <li key={a.user_id} className="flex justify-between gap-2 tabular-nums">
                    <span className="truncate">{a.display}</span>
                    <span>{a.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Dialog open={automationOpen} onOpenChange={setAutomationOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-4 py-3 text-left">
            <DialogTitle>Automação e SLA</DialogTitle>
            <DialogDescription>
              Distribuição, regras simples e alertas (worker no servidor). Requer migração Fase 6.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-8rem)] px-4 py-3">
            {settingsLoading || !settings ? (
              <p className="text-sm text-muted-foreground">A carregar…</p>
            ) : (
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Interruptores</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="auto-on">Automação ativa</Label>
                      <Switch
                        id="auto-on"
                        checked={settings.automation_enabled}
                        onCheckedChange={(v) => void saveSettings({ automation_enabled: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="dist-on">Distribuição automática</Label>
                      <Switch
                        id="dist-on"
                        checked={settings.distribution_enabled}
                        onCheckedChange={(v) => void saveSettings({ distribution_enabled: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="st-c">Estado: cliente escreve → em progresso</Label>
                      <Switch
                        id="st-c"
                        checked={settings.auto_status_from_customer}
                        onCheckedChange={(v) => void saveSettings({ auto_status_from_customer: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="st-a">Estado: agente responde → aguarda cliente</Label>
                      <Switch
                        id="st-a"
                        checked={settings.auto_status_from_agent}
                        onCheckedChange={(v) => void saveSettings({ auto_status_from_agent: v })}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">SLA (minutos)</CardTitle>
                    <CardDescription>Alertas escalonados: responsável → equipa → supervisores</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label>Primeira resposta</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1"
                        value={settings.sla_first_response_minutes ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  sla_first_response_minutes: v === '' ? null : parseInt(v, 10),
                                }
                              : s
                          );
                        }}
                        onBlur={() =>
                          void saveSettings({
                            sla_first_response_minutes: settings.sla_first_response_minutes,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Resposta seguinte</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1"
                        value={settings.sla_next_response_minutes ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  sla_next_response_minutes: v === '' ? null : parseInt(v, 10),
                                }
                              : s
                          );
                        }}
                        onBlur={() =>
                          void saveSettings({
                            sla_next_response_minutes: settings.sla_next_response_minutes,
                          })
                        }
                      />
                    </div>
                    <div>
                      <Label>Inatividade → pendente</Label>
                      <Input
                        type="number"
                        min={1}
                        className="mt-1"
                        value={settings.inactivity_reset_minutes ?? ''}
                        placeholder="—"
                        onChange={(e) => {
                          const v = e.target.value;
                          setSettings((s) =>
                            s
                              ? {
                                  ...s,
                                  inactivity_reset_minutes: v === '' ? null : parseInt(v, 10),
                                }
                              : s
                          );
                        }}
                        onBlur={() =>
                          void saveSettings({
                            inactivity_reset_minutes: settings.inactivity_reset_minutes,
                          })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Filas → equipa</CardTitle>
                    <CardDescription>Round-robin ou menor carga; sem equipa não há auto-assign</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(queueDist?.items ?? []).map((row) => (
                      <QueueDistRow
                        key={row.queue_id}
                        row={row}
                        teams={teams}
                        onSave={onSaveDistribution}
                      />
                    ))}
                    {(queueDist?.items ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">Crie filas em Configurações / filas de chat.</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Regras (palavra-chave / cliente)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label>Tipo</Label>
                        <Select
                          value={newRule.match_type}
                          onValueChange={(v) =>
                            setNewRule((r) => ({ ...r, match_type: v as 'keyword_body' | 'client_tag' }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="keyword_body">Palavra no texto</SelectItem>
                            <SelectItem value="client_tag">Contém no nome/empresa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Padrão</Label>
                        <Input
                          className="mt-1"
                          value={newRule.pattern}
                          onChange={(e) => setNewRule((r) => ({ ...r, pattern: e.target.value }))}
                          placeholder="ex.: suporte"
                        />
                      </div>
                      <div>
                        <Label>Ação</Label>
                        <Select
                          value={newRule.action}
                          onValueChange={(v) =>
                            setNewRule((r) => ({
                              ...r,
                              action: v as 'set_queue' | 'set_team' | 'set_priority',
                            }))
                          }
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="set_queue">Definir fila</SelectItem>
                            <SelectItem value="set_team">Definir equipa</SelectItem>
                            <SelectItem value="set_priority">Definir prioridade (texto)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>ID fila / equipa / prioridade</Label>
                        <Input
                          className="mt-1"
                          value={newRule.target_queue_id}
                          onChange={(e) => setNewRule((r) => ({ ...r, target_queue_id: e.target.value }))}
                          placeholder="UUID"
                        />
                      </div>
                    </div>
                    <Button type="button" size="sm" onClick={() => void onAddRule()}>
                      Adicionar regra
                    </Button>
                    <ul className="space-y-1 border-t border-border pt-2 text-xs">
                      {rulesList.map((rule) => (
                        <li
                          key={rule.id}
                          className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5"
                        >
                          <span className="min-w-0 break-all">
                            <span className="font-medium">{rule.match_type}</span> «{rule.pattern}» →{' '}
                            {rule.action}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => void onDeleteRule(rule.id)}
                            aria-label="Remover"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}
          </ScrollArea>
          <DialogFooter className="border-t border-border px-4 py-3">
            <Button type="button" variant="secondary" onClick={() => setAutomationOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function QueueDistRow(props: {
  row: {
    queue_id: string;
    queue_name: string;
    team_id: string | null;
    strategy: string | null;
    auto_assign: boolean | null;
  };
  teams: Team[];
  onSave: (queueId: string, teamId: string | null, strategy: string, auto: boolean) => void;
}) {
  const { row, teams, onSave } = props;
  const [teamId, setTeamId] = useState<string>(row.team_id ?? 'none');
  const [strategy, setStrategy] = useState<string>(row.strategy ?? 'round_robin');
  const [auto, setAuto] = useState<boolean>(row.auto_assign === true);

  return (
    <div className="rounded-md border border-border p-2">
      <div className="mb-2 text-sm font-medium">{row.queue_name}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div>
          <Label className="text-xs">Equipa</Label>
          <Select value={teamId} onValueChange={setTeamId}>
            <SelectTrigger className="mt-1 h-9 text-xs">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Estratégia</Label>
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="mt-1 h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              <SelectItem value="round_robin">Round-robin</SelectItem>
              <SelectItem value="least_open">Menor carga</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col justify-end gap-1">
          <div className="flex items-center gap-2">
            <Switch checked={auto} onCheckedChange={setAuto} id={`auto-${row.queue_id}`} />
            <Label htmlFor={`auto-${row.queue_id}`} className="text-xs">
              Auto-atribuir
            </Label>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-8"
            onClick={() =>
              onSave(row.queue_id, teamId === 'none' ? null : teamId, strategy, auto)
            }
          >
            Guardar fila
          </Button>
        </div>
      </div>
    </div>
  );
}
