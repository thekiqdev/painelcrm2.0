import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CalendarClock,
  GitBranch,
  Headphones,
  Loader2,
  Megaphone,
  Scale,
  Settings2,
  Tags,
  Timer,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { apiClient } from '@/integrations/api/client';
import { chatKanbanService, type ChatKanbanColumn } from '@/services/chatKanban';
import { fetchFunnelById, fetchFunnels } from '@/services/funnels';
import { getMyTenantUsers } from '@/services/tenantLimits';
import { KANBAN_COLUMN_COLOR_PRESETS } from '@/components/chat-kanban/kanbanColumnPresets';
import {
  EMPTY_KANBAN_PHASE2,
  EMPTY_KANBAN_COLUMN_UI,
  EMPTY_KANBAN_RULES,
  mergeColumnMetadataFull,
  parseKanbanPhase2,
  parseKanbanColumnRules,
  parseKanbanColumnUi,
  type KanbanPhase2Config,
  type KanbanColumnRules,
  type KanbanColumnUi,
} from '@/utils/kanbanColumnRulesUi';
import { ChatKanbanColumnRulesForm, type TeamOption, type TenantUserOption } from '@/components/chat-kanban/ChatKanbanColumnRulesForm';
import {
  listWhatsappMessageTemplates,
  type WhatsappMessageTemplateListRow,
} from '@/services/whatsappMessageTemplates';

function ColorPresetPicker({
  value,
  onChange,
  disabled,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {KANBAN_COLUMN_COLOR_PRESETS.map((p) => {
        const selected = (p.value ?? null) === (value ?? null);
        return (
          <button
            key={p.label}
            type="button"
            disabled={disabled}
            title={p.label}
            onClick={() => onChange(p.value)}
            className={cn(
              'h-8 w-8 rounded-full border-2 transition-all shrink-0',
              p.swatch,
              selected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-105' : 'opacity-90 hover:opacity-100',
              disabled && 'pointer-events-none opacity-50',
            )}
          />
        );
      })}
    </div>
  );
}

function AccordionSectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <span className="flex items-start gap-2.5 text-left">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" aria-hidden />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-sm font-medium leading-tight">{title}</span>
        {subtitle ? (
          <span className="text-[11px] font-normal text-muted-foreground leading-snug">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

function FuturePlaceholder({ description }: { description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/60 bg-muted/10 px-3 py-3 space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
      <span className="inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/75">
        Em breve
      </span>
    </div>
  );
}


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  column: ChatKanbanColumn | null;
  positionLabel: string;
  onSaved: () => void;
};

type FunnelOption = { id: string; name: string };
type FunnelStageOption = { id: string; name: string };

export function ChatKanbanColumnSettingsSheet({ open, onOpenChange, column, positionLabel, onSaved }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [ui, setUi] = useState<KanbanColumnUi>({ ...EMPTY_KANBAN_COLUMN_UI });
  const [rules, setRules] = useState<KanbanColumnRules>({ ...EMPTY_KANBAN_RULES });
  const [phase2, setPhase2] = useState<KanbanPhase2Config>({ ...EMPTY_KANBAN_PHASE2 });
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<TenantUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boardLinkedFunnelId, setBoardLinkedFunnelId] = useState<string | null>(null);
  const [boardFunnelName, setBoardFunnelName] = useState<string | null>(null);
  const [boardStages, setBoardStages] = useState<FunnelStageOption[]>([]);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [selectedFunnelStageId, setSelectedFunnelStageId] = useState<string | null>(null);
  const [boardDisplayName, setBoardDisplayName] = useState<string | null>(null);
  const [whatsappModels, setWhatsappModels] = useState<WhatsappMessageTemplateListRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [boardColumnsForMove, setBoardColumnsForMove] = useState<ChatKanbanColumn[]>([]);

  useEffect(() => {
    if (!open || !column) return;
    setName(column.name);
    setColor(column.color ?? null);
    setUi(parseKanbanColumnUi(column.metadata));
    setRules(parseKanbanColumnRules(column.metadata));
    setPhase2(parseKanbanPhase2(column.metadata));
    setSelectedFunnelStageId(column.funnel_stage_id ?? null);
    setBoardLinkedFunnelId(null);
    setBoardFunnelName(null);
    setBoardStages([]);
  }, [open, column?.id, column?.updated_at]);

  useEffect(() => {
    if (!open || !column) return;
    let cancelled = false;
    void chatKanbanService.listColumns(column.board_id).then((cols) => {
      if (!cancelled) setBoardColumnsForMove(cols);
    });
    return () => {
      cancelled = true;
    };
  }, [open, column?.board_id, column?.id]);

  useEffect(() => {
    if (!open || !column) return;
    let cancelled = false;
    void (async () => {
      setFunnelLoading(true);
      try {
        const board = await chatKanbanService.getBoard(column.board_id);
        if (cancelled) return;
        setBoardDisplayName(board.name?.trim() || null);
        const linkedFunnelId = board.linked_sales_funnel_id ?? null;
        setBoardLinkedFunnelId(linkedFunnelId);
        if (!linkedFunnelId) {
          setBoardFunnelName(null);
          setBoardStages([]);
          setSelectedFunnelStageId(null);
          return;
        }
        const [funnelRes, listRes] = await Promise.all([
          fetchFunnelById(linkedFunnelId),
          fetchFunnels(),
        ]);
        if (cancelled) return;
        if (funnelRes.success && funnelRes.data) {
          setBoardStages(
            (funnelRes.data.stages || []).map((s) => ({
              id: s.id,
              name: s.name,
            })),
          );
        } else {
          setBoardStages([]);
        }
        if (listRes.success) {
          const found = (listRes.data as FunnelOption[]).find((f) => f.id === linkedFunnelId);
          setBoardFunnelName(found?.name ?? null);
        } else {
          setBoardFunnelName(null);
        }
      } catch {
        if (!cancelled) {
          setBoardLinkedFunnelId(null);
          setBoardFunnelName(null);
          setBoardStages([]);
          setBoardDisplayName(null);
        }
      } finally {
        if (!cancelled) setFunnelLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, column?.id]);

  useEffect(() => {
    if (!open || !column) return;
    let cancelled = false;
    void (async () => {
      setTemplatesLoading(true);
      try {
        const waRes = await listWhatsappMessageTemplates({ template_type: 'model', is_active: 'true' });
        if (cancelled) return;
        if (!waRes.error && waRes.data?.items) setWhatsappModels(waRes.data.items);
        else setWhatsappModels([]);
      } catch {
        if (!cancelled) setWhatsappModels([]);
      } finally {
        if (!cancelled) setTemplatesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, column?.id]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setTeamsLoading(true);
      setUsersLoading(true);
      try {
        const [teamsRes, users] = await Promise.all([
          apiClient.get<Array<{ id: string; name: string }>>('/api/teams'),
          getMyTenantUsers().catch(() => []),
        ]);
        if (cancelled) return;
        const td = teamsRes.data as unknown;
        if (!teamsRes.error && Array.isArray(td)) {
          setTeams(td.map((t) => ({ id: t.id, name: t.name })));
        } else {
          setTeams([]);
        }
        setTenantUsers(
          users.map((u) => ({
            id: u.id,
            label: u.full_name?.trim() || u.email || u.id,
          })),
        );
      } catch {
        if (!cancelled) {
          setTeams([]);
          setTenantUsers([]);
        }
      } finally {
        if (!cancelled) {
          setTeamsLoading(false);
          setUsersLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSave = async () => {
    if (!column) return;
    const n = name.trim();
    if (!n) {
      toast.error('Nome obrigatório');
      return;
    }
    if (phase2.webhook.enabled) {
      const url = phase2.webhook.url.trim();
      if (!/^https?:\/\//i.test(url)) {
        toast.error('Webhook exige URL válida iniciando com http:// ou https://');
        return;
      }
    }
    if (phase2.notifications.auto_message_enabled) {
      if (phase2.notifications.auto_message_mode === 'whatsapp_model') {
        if (!phase2.notifications.auto_message_whatsapp_template_id) {
          toast.error('Mensagem automática: escolha um template em Templates WhatsApp ou desligue a opção.');
          return;
        }
      } else if (!phase2.notifications.auto_message_text?.trim()) {
        toast.error('Mensagem automática: preencha o texto ou desligue a opção.');
        return;
      }
    }
    if (phase2.productivity.auto_create_task) {
      if (phase2.productivity.assignee_mode === 'fixed_user' && !phase2.productivity.assignee_user_id) {
        toast.error('Tarefa automática: escolha o usuário fixo ou altere a atribuição.');
        return;
      }
    }
    if (phase2.automations.auto_move_by_time.enabled) {
      const dst = phase2.automations.auto_move_by_time.to_column_id;
      if (!dst) {
        toast.error('Movimento automático: escolha a coluna de destino ou desligue a opção.');
        return;
      }
      if (dst === column.id) {
        toast.error('Movimento automático: a coluna de destino não pode ser a mesma coluna.');
        return;
      }
      const destOk = boardColumnsForMove.some((c) => c.id === dst);
      if (!destOk) {
        toast.error('Movimento automático: coluna de destino inválida neste quadro.');
        return;
      }
      const otherCols = boardColumnsForMove.filter((c) => c.id !== column.id);
      if (otherCols.length === 0) {
        toast.error('Movimento automático: adicione outra coluna ao quadro para poder definir destino.');
        return;
      }
    }
    setSaving(true);
    try {
      const baseMeta =
        column.metadata && typeof column.metadata === 'object' ? (column.metadata as Record<string, unknown>) : {};
      const meta = mergeColumnMetadataFull(baseMeta, ui, rules, phase2);
      const chosenStageId = selectedFunnelStageId ?? null;
      await chatKanbanService.patchColumn(column.id, {
        name: n,
        color,
        funnel_stage_id: chosenStageId,
        metadata: meta,
      });
      toast.success('Coluna atualizada');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha ao guardar');
    } finally {
      setSaving(false);
    }
  };

  const selectedWhatsappModel = useMemo(
    () => whatsappModels.find((t) => t.id === phase2.notifications.auto_message_whatsapp_template_id) ?? null,
    [whatsappModels, phase2.notifications.auto_message_whatsapp_template_id],
  );

  const staleWhatsappModelId =
    phase2.notifications.auto_message_mode === 'whatsapp_model' &&
    !!phase2.notifications.auto_message_whatsapp_template_id &&
    !templatesLoading &&
    !selectedWhatsappModel;

  const itemClass =
    'border border-border/50 rounded-lg bg-card/40 overflow-hidden mb-2 last:mb-0 shadow-sm shadow-black/[0.02]';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-6 pt-6 pb-2 space-y-1 shrink-0 text-left">
          <SheetTitle>Coluna</SheetTitle>
          <SheetDescription>
            Configuração contextual. As automações aplicam-se no servidor ao mover um cartão para esta coluna.
          </SheetDescription>
        </SheetHeader>

        {!column ? null : (
          <>
            <ScrollArea className="flex-1 min-h-0 px-6 [&_[data-radix-scroll-area-viewport]]:!block">
              <div className="pb-6 pr-2 pt-1">
                <Accordion
                  type="multiple"
                  defaultValue={[]}
                  className="w-full"
                >
                  <AccordionItem value="general" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Settings2}
                        title="Geral"
                        subtitle="Nome, cor, terminal, visibilidade no quadro"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="space-y-3 pt-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="col-set-name">Nome</Label>
                          <Input
                            id="col-set-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={saving}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-xs text-muted-foreground">Cor do cabeçalho</span>
                          <ColorPresetPicker value={color} onChange={setColor} disabled={saving} />
                        </div>
                        <p className="text-[11px] text-muted-foreground">{positionLabel}</p>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="col-terminal" className="text-sm font-normal cursor-pointer">
                            Coluna terminal
                          </Label>
                          <Switch
                            id="col-terminal"
                            checked={rules.is_terminal}
                            onCheckedChange={(v) => setRules((r) => ({ ...r, is_terminal: v }))}
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <Label htmlFor="col-hidden" className="text-sm font-normal cursor-pointer">
                              Ocultar no quadro
                            </Label>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              A coluna deixa de aparecer no Kanban; os cartões mantêm-se associados.
                            </p>
                          </div>
                          <Switch
                            id="col-hidden"
                            checked={ui.hidden}
                            onCheckedChange={(v) => setUi((u) => ({ ...u, hidden: v }))}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="attendance" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Headphones}
                        title="Atendimento"
                        subtitle="Encerrar, fila, atribuições, confirmação e motivo"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <ChatKanbanColumnRulesForm
                          variant="attendance"
                          rules={rules}
                          onChange={setRules}
                          teams={teams}
                          teamsLoading={teamsLoading}
                          tenantUsers={tenantUsers}
                          usersLoading={usersLoading}
                          disabled={saving}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="organization" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Tags}
                        title="Organização"
                        subtitle="Etiquetas e prioridade na conversa"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <ChatKanbanColumnRulesForm
                          variant="organization"
                          rules={rules}
                          onChange={setRules}
                          teams={teams}
                          teamsLoading={teamsLoading}
                          tenantUsers={tenantUsers}
                          usersLoading={usersLoading}
                          disabled={saving}
                        />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="automations" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Timer}
                        title="Automações"
                        subtitle="Mover cartão automaticamente após um tempo nesta coluna"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="auto-move-enabled" className="text-sm font-normal cursor-pointer">
                            Mover automaticamente
                          </Label>
                          <Switch
                            id="auto-move-enabled"
                            checked={phase2.automations.auto_move_by_time.enabled}
                            onCheckedChange={(v) =>
                              setPhase2((prev) => ({
                                ...prev,
                                automations: {
                                  ...prev.automations,
                                  auto_move_by_time: {
                                    ...prev.automations.auto_move_by_time,
                                    enabled: v,
                                  },
                                },
                              }))
                            }
                            disabled={saving}
                          />
                        </div>
                        {phase2.automations.auto_move_by_time.enabled ? (
                          <>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Coluna de destino</Label>
                              <Select
                                value={phase2.automations.auto_move_by_time.to_column_id ?? '__none__'}
                                onValueChange={(v) =>
                                  setPhase2((prev) => ({
                                    ...prev,
                                    automations: {
                                      ...prev.automations,
                                      auto_move_by_time: {
                                        ...prev.automations.auto_move_by_time,
                                        to_column_id: v === '__none__' ? null : v,
                                      },
                                    },
                                  }))
                                }
                                disabled={saving}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder="Selecionar coluna" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">Selecionar…</SelectItem>
                                  {boardColumnsForMove
                                    .filter((c) => c.id !== column.id)
                                    .map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.name}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex gap-2 items-end">
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <Label className="text-xs">Após</Label>
                                <Input
                                  type="number"
                                  min={1}
                                  max={99999}
                                  className="h-9 text-xs"
                                  value={phase2.automations.auto_move_by_time.delay_value}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value);
                                    const n = Number.isFinite(raw)
                                      ? Math.min(99999, Math.max(1, Math.round(raw)))
                                      : 1;
                                    setPhase2((prev) => ({
                                      ...prev,
                                      automations: {
                                        ...prev.automations,
                                        auto_move_by_time: {
                                          ...prev.automations.auto_move_by_time,
                                          delay_value: n,
                                        },
                                      },
                                    }));
                                  }}
                                  disabled={saving}
                                />
                              </div>
                              <div className="space-y-1.5 w-[132px] shrink-0">
                                <Label className="text-xs">Unidade</Label>
                                <Select
                                  value={phase2.automations.auto_move_by_time.delay_unit}
                                  onValueChange={(v) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      automations: {
                                        ...prev.automations,
                                        auto_move_by_time: {
                                          ...prev.automations.auto_move_by_time,
                                          delay_unit: v as 'minutes' | 'hours' | 'days',
                                        },
                                      },
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="minutes">Minutos</SelectItem>
                                    <SelectItem value="hours">Horas</SelectItem>
                                    <SelectItem value="days">Dias</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              O servidor agenda ao entrar na coluna. Se o cartão sair antes do prazo, o agendamento é
                              cancelado. Não precisa manter o painel aberto.
                            </p>
                          </>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="commercial" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Briefcase}
                        title="Comercial"
                        subtitle="Leads, oportunidades e CRM"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3 space-y-3">
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Garantir cliente: se já houver cliente, ignora. Se houver lead, converte para cliente e
                          atualiza o vínculo da conversa. Se não houver lead nem cliente, tenta vincular cliente
                          existente por dedupe conservador (telefone/e-mail) e, sem match, cria cliente novo com os
                          dados disponíveis da conversa.
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="phase2-ensure-client"
                            className="text-xs font-normal cursor-pointer leading-snug"
                          >
                            Criar/Converter para cliente
                          </Label>
                          <Switch
                            id="phase2-ensure-client"
                            checked={phase2.crm.ensure_client_on_column_entry}
                            onCheckedChange={(v) =>
                              setPhase2((prev) => ({
                                ...prev,
                                crm: {
                                  ...prev.crm,
                                  ensure_client_on_column_entry: v,
                                },
                              }))
                            }
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="phase2-auto-lead" className="text-xs font-normal cursor-pointer leading-snug">
                            Criar/vincular lead automaticamente
                          </Label>
                          <Switch
                            id="phase2-auto-lead"
                            checked={phase2.crm.auto_link_or_create_lead}
                            onCheckedChange={(v) =>
                              setPhase2((prev) => ({
                                ...prev,
                                crm: {
                                  ...prev.crm,
                                  auto_link_or_create_lead: v,
                                  allow_create_when_no_dedupe_match: v ? prev.crm.allow_create_when_no_dedupe_match : true,
                                },
                              }))
                            }
                            disabled={saving}
                          />
                        </div>
                        {phase2.crm.auto_link_or_create_lead ? (
                          <div className="space-y-1.5 rounded-md border border-border/50 bg-muted/10 px-2.5 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor="phase2-auto-lead-create"
                                className="text-xs font-normal cursor-pointer leading-snug"
                              >
                                Criar lead novo quando não houver cadastro igual
                              </Label>
                              <Switch
                                id="phase2-auto-lead-create"
                                checked={phase2.crm.allow_create_when_no_dedupe_match}
                                onCheckedChange={(v) =>
                                  setPhase2((prev) => ({
                                    ...prev,
                                    crm: { ...prev.crm, allow_create_when_no_dedupe_match: v },
                                  }))
                                }
                                disabled={saving}
                              />
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-snug">
                              <span className="font-medium text-foreground/80">Desligado:</span> só associa se já existir
                              lead com o mesmo telefone ou e-mail.{' '}
                              <span className="font-medium text-foreground/80">Ligado:</span> também cadastra um lead
                              quando não encontrar ninguém igual (dados mínimos na conversa).
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="productivity" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={CalendarClock}
                        title="Produtividade"
                        subtitle="Tarefas, lembretes e follow-up"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3 space-y-3">
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Ao entrar nesta coluna, cria uma tarefa no módulo de Tarefas ou na ficha do lead (conforme a
                          conversa). Placeholders no título/descrição:{' '}
                          <code className="text-[10px] bg-muted px-1 rounded">
                            {'{{column_name}} {{contact_name}} {{display_name}} {{conversation_id}} {{canonical_phone}}'}
                          </code>
                        </p>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="phase2-auto-task" className="text-xs font-normal cursor-pointer">
                            Criar tarefa automaticamente
                          </Label>
                          <Switch
                            id="phase2-auto-task"
                            checked={phase2.productivity.auto_create_task}
                            onCheckedChange={(v) =>
                              setPhase2((prev) => ({
                                ...prev,
                                productivity: { ...prev.productivity, auto_create_task: v },
                              }))
                            }
                            disabled={saving}
                          />
                        </div>
                        {phase2.productivity.auto_create_task ? (
                          <div className="space-y-3 rounded-md border border-border/50 bg-muted/10 p-2.5">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Título da tarefa</Label>
                              <Input
                                className="h-9 text-xs"
                                value={phase2.productivity.task_title_template}
                                placeholder="Kanban: {{column_name}}"
                                onChange={(e) =>
                                  setPhase2((prev) => ({
                                    ...prev,
                                    productivity: {
                                      ...prev.productivity,
                                      task_title_template: e.target.value.slice(0, 500),
                                    },
                                  }))
                                }
                                disabled={saving}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Descrição (opcional)</Label>
                              <Textarea
                                className="min-h-[72px] text-xs resize-y"
                                value={phase2.productivity.task_description_template}
                                placeholder="Detalhes ou instruções…"
                                onChange={(e) =>
                                  setPhase2((prev) => ({
                                    ...prev,
                                    productivity: {
                                      ...prev.productivity,
                                      task_description_template: e.target.value.slice(0, 5000),
                                    },
                                  }))
                                }
                                disabled={saving}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Prioridade</Label>
                                <Select
                                  value={phase2.productivity.task_priority}
                                  onValueChange={(v) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      productivity: {
                                        ...prev.productivity,
                                        task_priority: v as 'low' | 'medium' | 'high',
                                      },
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="low">Baixa</SelectItem>
                                    <SelectItem value="medium">Média</SelectItem>
                                    <SelectItem value="high">Alta</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Prazo (dias)</Label>
                                <Select
                                  value={
                                    phase2.productivity.due_offset_days === null
                                      ? 'none'
                                      : String(phase2.productivity.due_offset_days)
                                  }
                                  onValueChange={(v) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      productivity: {
                                        ...prev.productivity,
                                        due_offset_days:
                                          v === 'none' ? null : Math.min(365, Math.max(0, parseInt(v, 10) || 0)),
                                      },
                                    }))
                                  }
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Sem prazo</SelectItem>
                                    <SelectItem value="0">Hoje</SelectItem>
                                    <SelectItem value="1">+1 dia</SelectItem>
                                    <SelectItem value="3">+3 dias</SelectItem>
                                    <SelectItem value="7">+7 dias</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Atribuir a</Label>
                              <Select
                                value={phase2.productivity.assignee_mode}
                                onValueChange={(v) =>
                                  setPhase2((prev) => ({
                                    ...prev,
                                    productivity: {
                                      ...prev.productivity,
                                      assignee_mode: v as KanbanPhase2Config['productivity']['assignee_mode'],
                                      assignee_user_id:
                                        v === 'fixed_user' ? prev.productivity.assignee_user_id : null,
                                    },
                                  }))
                                }
                                disabled={saving}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Em aberto (sem responsável)</SelectItem>
                                  <SelectItem value="actor">Quem moveu o cartão</SelectItem>
                                  <SelectItem value="conversation_assignee">Responsável pela conversa</SelectItem>
                                  <SelectItem value="fixed_user">Usuário fixo</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {phase2.productivity.assignee_mode === 'fixed_user' ? (
                              <div className="space-y-1.5">
                                <Label className="text-xs">Usuário</Label>
                                <Select
                                  value={phase2.productivity.assignee_user_id ?? ''}
                                  onValueChange={(v) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      productivity: {
                                        ...prev.productivity,
                                        assignee_user_id: v || null,
                                      },
                                    }))
                                  }
                                  disabled={saving || usersLoading}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder={usersLoading ? 'Carregando…' : 'Selecionar'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {tenantUsers.map((u) => (
                                      <SelectItem key={u.id} value={u.id}>
                                        {u.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        <FuturePlaceholder description="Lembretes, follow-up em calendário e cadências automáticas ficam para as próximas entregas." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="communication" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Megaphone}
                        title="Comunicação"
                        subtitle="Notificações e mensagens"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3 space-y-3">
                        <div className="rounded-md border border-border/50 bg-muted/15 p-3 space-y-3 text-sm">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Mensagem automática ao entrar nesta coluna: texto fixo ou modelo da aba «Modelos» em Templates
                            WhatsApp (várias mensagens, texto/imagem/documento). O envio corre no servidor; falhas não
                            desfazem o movimento do cartão.
                          </p>
                          <div
                            className="rounded-md border border-amber-500/35 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-950/90 dark:text-amber-100/90 leading-snug"
                            role="note"
                          >
                            Aviso: mensagem enviada automaticamente ao cliente quando o cartão entra na coluna. Falhas de
                            envio não impedem o movimento do cartão.
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="phase2-auto-msg" className="text-xs font-normal cursor-pointer leading-snug">
                              Enviar mensagem automática
                            </Label>
                            <Switch
                              id="phase2-auto-msg"
                              checked={phase2.notifications.auto_message_enabled}
                              onCheckedChange={(v) =>
                                setPhase2((prev) => ({
                                  ...prev,
                                  notifications: { ...prev.notifications, auto_message_enabled: v },
                                }))
                              }
                              disabled={saving}
                            />
                          </div>
                          {phase2.notifications.auto_message_enabled ? (
                            <div className="space-y-3">
                              <div className="space-y-1.5">
                                <Label className="text-xs">Origem da mensagem</Label>
                                <Select
                                  value={phase2.notifications.auto_message_mode}
                                  onValueChange={(v) =>
                                    setPhase2((prev) => {
                                      const mode = v as 'free_text' | 'whatsapp_model';
                                      return {
                                        ...prev,
                                        notifications: {
                                          ...prev.notifications,
                                          auto_message_mode: mode,
                                          auto_message_text:
                                            mode === 'free_text' ? prev.notifications.auto_message_text ?? '' : null,
                                          auto_message_template_id: null,
                                          auto_message_whatsapp_template_id:
                                            mode === 'whatsapp_model'
                                              ? prev.notifications.auto_message_whatsapp_template_id
                                              : null,
                                        },
                                      };
                                    })
                                  }
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="free_text">Texto</SelectItem>
                                    <SelectItem value="whatsapp_model">Templates WhatsApp</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {phase2.notifications.auto_message_mode === 'free_text' ? (
                                <div className="space-y-1.5">
                                  <Label htmlFor="phase2-auto-msg-body" className="text-xs">
                                    Texto da mensagem
                                  </Label>
                                  <Textarea
                                    id="phase2-auto-msg-body"
                                    className="min-h-[88px] text-xs resize-y"
                                    value={phase2.notifications.auto_message_text ?? ''}
                                    placeholder="Ex.: Olá! Recebemos sua solicitação e em breve retornaremos."
                                    onChange={(e) =>
                                      setPhase2((prev) => ({
                                        ...prev,
                                        notifications: {
                                          ...prev.notifications,
                                          auto_message_text: e.target.value.slice(0, 2000),
                                        },
                                      }))
                                    }
                                    disabled={saving}
                                  />
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {templatesLoading ? (
                                    <p className="text-[11px] text-muted-foreground">A carregar modelos…</p>
                                  ) : whatsappModels.length === 0 ? (
                                    <div className="rounded-md border border-dashed border-border/70 bg-background/50 px-3 py-3 space-y-2">
                                      <p className="text-[11px] text-muted-foreground leading-snug">
                                        Não há modelos ativos. Crie na aba «Modelos» em{' '}
                                        <span className="font-medium text-foreground">Templates WhatsApp</span>.
                                      </p>
                                      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                                        <Link to="/settings?section=chatTemplates">Abrir configuração</Link>
                                      </Button>
                                    </div>
                                  ) : (
                                    <>
                                      <div className="space-y-1.5">
                                        <Label className="text-xs">Modelo</Label>
                                        <Select
                                          value={phase2.notifications.auto_message_whatsapp_template_id ?? ''}
                                          onValueChange={(v) =>
                                            setPhase2((prev) => ({
                                              ...prev,
                                              notifications: {
                                                ...prev.notifications,
                                                auto_message_whatsapp_template_id: v || null,
                                              },
                                            }))
                                          }
                                          disabled={saving}
                                        >
                                          <SelectTrigger className="h-9 text-xs">
                                            <SelectValue placeholder="Selecionar modelo" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {whatsappModels.map((t) => (
                                              <SelectItem key={t.id} value={t.id}>
                                                {t.name} ({t.message_count} msg.)
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground leading-snug">
                                        O modelo pode incluir várias mensagens (texto, imagem ou PDF por URL pública),
                                        com atraso entre itens. Um movimento de cartão conta como uma execução completa.
                                      </p>
                                      {staleWhatsappModelId ? (
                                        <div
                                          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-950/90 dark:text-amber-100/90"
                                          role="status"
                                        >
                                          O modelo guardado já não está disponível (removido ou inativo). Escolha outro
                                          ou altere o modo — o quadro continua válido; a automação será ignorada até
                                          corrigir.
                                        </div>
                                      ) : null}
                                      {selectedWhatsappModel ? (
                                        <div className="space-y-1">
                                          <p className="text-[10px] font-medium text-muted-foreground">Resumo</p>
                                          <div className="rounded-md border border-border/60 bg-background/80 px-2.5 py-2 text-[11px] space-y-1">
                                            <p>
                                              <span className="text-muted-foreground">Mensagens:</span>{' '}
                                              {selectedWhatsappModel.message_count}
                                            </p>
                                            <p className="text-muted-foreground">
                                              Categoria: {selectedWhatsappModel.category_name || '—'}
                                            </p>
                                          </div>
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              )}

                              <p className="text-[10px] text-muted-foreground leading-snug">
                                Variáveis:{' '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{contact_name}}'}</code>,{' '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{column_name}}'}</code>,{' '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{board_name}}'}</code>,{' '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{company_name}}'}</code>
                                {', '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{operator_name}}'}</code>,{' '}
                                <code className="bg-muted px-1 rounded text-[10px]">{'{{team_name}}'}</code>
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-md border border-border/50 bg-muted/15 p-3 space-y-3 text-sm">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Configure um webhook opcional por coluna. Falhas externas nao impedem o movimento do cartao.
                          </p>
                          <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="phase2-webhook-enabled" className="text-xs font-normal cursor-pointer">
                              Ativar webhook
                            </Label>
                            <Switch
                              id="phase2-webhook-enabled"
                              checked={phase2.webhook.enabled}
                              onCheckedChange={(v) =>
                                setPhase2((prev) => ({
                                  ...prev,
                                  webhook: { ...prev.webhook, enabled: v, non_blocking: true },
                                }))
                              }
                              disabled={saving}
                            />
                          </div>

                          <details className="rounded-md border border-border/40 bg-background/40 p-2.5" open={false}>
                            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                              Modo avancado (webhook outbound)
                            </summary>
                            <div className="space-y-2 pt-2">
                              <div className="space-y-1.5">
                                <Label className="text-xs">URL</Label>
                                <Input
                                  className="h-9 text-xs"
                                  value={phase2.webhook.url}
                                  placeholder="https://exemplo.com/webhooks/kanban"
                                  onChange={(e) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      webhook: { ...prev.webhook, url: e.target.value.trim() },
                                    }))
                                  }
                                  disabled={saving}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Metodo</Label>
                                  <select
                                    className="h-9 rounded-md border bg-background px-2 text-xs"
                                    value={phase2.webhook.method}
                                    onChange={(e) =>
                                      setPhase2((prev) => ({
                                        ...prev,
                                        webhook: {
                                          ...prev.webhook,
                                          method: e.target.value as 'POST' | 'PUT' | 'PATCH',
                                        },
                                      }))
                                    }
                                    disabled={saving}
                                  >
                                    <option value="POST">POST</option>
                                    <option value="PUT">PUT</option>
                                    <option value="PATCH">PATCH</option>
                                  </select>
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Timeout (ms)</Label>
                                  <Input
                                    className="h-9 text-xs"
                                    type="number"
                                    min={500}
                                    max={10000}
                                    step={100}
                                    value={phase2.webhook.timeout_ms}
                                    onChange={(e) => {
                                      const raw = Number(e.target.value);
                                      const next = Number.isFinite(raw) ? Math.min(10000, Math.max(500, raw)) : 3000;
                                      setPhase2((prev) => ({
                                        ...prev,
                                        webhook: { ...prev.webhook, timeout_ms: next },
                                      }));
                                    }}
                                    disabled={saving}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Segredo de assinatura (opcional)</Label>
                                <Input
                                  className="h-9 text-xs"
                                  type="password"
                                  value={phase2.webhook.signing_secret}
                                  onChange={(e) =>
                                    setPhase2((prev) => ({
                                      ...prev,
                                      webhook: { ...prev.webhook, signing_secret: e.target.value },
                                    }))
                                  }
                                  disabled={saving}
                                />
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                Politica fixa da Fase 2A: falha do webhook nao bloqueia o movimento do cartao.
                              </p>
                            </div>
                          </details>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="sla" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={Scale}
                        title="SLA e validações avançadas"
                        subtitle="Tempos, bloqueios e regras condicionais"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <FuturePlaceholder description="SLA por etapa, validação de campos obrigatórios, impedir retrocesso e alertas de cartão parado." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="funnel" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-3 text-sm hover:no-underline',
                        'hover:bg-muted/30 rounded-t-lg [&[data-state=open]]:bg-muted/20',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={GitBranch}
                        title="Integração com funil"
                        subtitle="Funil de vendas existente (opcional)"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0 border-t border-border/40">
                      <div className="pt-3">
                        <div className="rounded-md border border-border/50 bg-muted/15 p-3 space-y-3 text-sm">
                          <p className="text-[11px] text-muted-foreground leading-snug">
                            Integração opcional: esta coluna pode atualizar estágio no CRM quando o board estiver vinculado a um funil e a conversa já tiver vínculo (`client_id` ou `lead_id`).
                          </p>
                          {funnelLoading ? (
                            <p className="text-xs text-muted-foreground">Carregando funil do board...</p>
                          ) : !boardLinkedFunnelId ? (
                            <p className="text-xs text-muted-foreground">
                              Este board ainda não está vinculado a um funil. Defina o funil no topo da página do Kanban para liberar o mapeamento de estágio.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground">
                                Funil vinculado ao board: <span className="font-medium text-foreground">{boardFunnelName ?? boardLinkedFunnelId}</span>
                              </p>
                              <div className="space-y-1.5">
                                <Label className="text-xs">Estágio CRM desta coluna</Label>
                                <Select
                                  value={(selectedFunnelStageId ?? 'none') as string}
                                  onValueChange={(v) => {
                                    const next = v === 'none' ? null : v;
                                    setSelectedFunnelStageId(next);
                                  }}
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Nenhum estágio mapeado" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Nenhum</SelectItem>
                                    {boardStages.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </ScrollArea>

            <SheetFooter className="px-6 py-4 border-t border-border/60 shrink-0 gap-2 sm:gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
