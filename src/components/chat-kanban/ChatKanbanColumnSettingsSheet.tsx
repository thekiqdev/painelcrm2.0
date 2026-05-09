import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  Briefcase,
  CalendarClock,
  FileText,
  GitBranch,
  Headphones,
  Loader2,
  Megaphone,
  Scale,
  Settings2,
  Tags,
  Timer,
} from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { cn } from '@/lib/utils';
import { apiClient } from '@/integrations/api/client';
import { chatKanbanService, type ChatKanbanBoard, type ChatKanbanColumn } from '@/services/chatKanban';
import { fetchFunnelById, fetchFunnels } from '@/services/funnels';
import { getMyTenantUsers } from '@/services/tenantLimits';
import { KANBAN_COLUMN_COLOR_PRESETS } from '@/components/chat-kanban/kanbanColumnPresets';
import {
  EMPTY_KANBAN_PHASE2,
  EMPTY_KANBAN_COLUMN_UI,
  EMPTY_KANBAN_RULES,
  EMPTY_KANBAN_PROPOSALS_DISPLAY,
  mergeColumnMetadataFull,
  mergeKanbanProposalsIntoMetadata,
  parseKanbanPhase2,
  parseKanbanColumnRules,
  parseKanbanColumnUi,
  parseKanbanProposalsDisplay,
  type KanbanPhase2Config,
  type KanbanColumnRules,
  type KanbanColumnUi,
  type KanbanProposalsDisplay,
} from '@/utils/kanbanColumnRulesUi';
import { ChatKanbanColumnRulesForm, type TeamOption, type TenantUserOption } from '@/components/chat-kanban/ChatKanbanColumnRulesForm';
import {
  listWhatsappMessageTemplates,
  type WhatsappMessageTemplateListRow,
} from '@/services/whatsappMessageTemplates';
import { proposalTemplatesService, type ProposalTemplate } from '@/services/proposalTemplates';

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
    <span className="flex items-center gap-2 text-left min-w-0">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex flex-col gap-0 min-w-0">
        <span className="text-sm font-medium leading-tight">{title}</span>
        {subtitle ? (
          <span className="text-[10px] font-normal text-muted-foreground leading-tight line-clamp-2">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

function FuturePlaceholder({ description }: { description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/50 bg-muted/5 px-2.5 py-2">
      <p className="text-[10px] text-muted-foreground leading-snug">{description}</p>
      <span className="mt-1 inline-flex text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
        Em breve
      </span>
    </div>
  );
}

const ENTRY_TAG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseColumnEntryAutomation(meta: unknown): {
  enabled: boolean;
  newConversations: boolean;
  leads: boolean;
  clients: boolean;
  tagIds: string[];
} {
  const empty = {
    enabled: false,
    newConversations: false,
    leads: false,
    clients: false,
    tagIds: [] as string[],
  };
  if (!meta || typeof meta !== 'object') return empty;
  const raw = (meta as Record<string, unknown>).automation_config;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const enabled = (raw as Record<string, unknown>).enabled === true;
  const src = (raw as Record<string, unknown>).sources;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return { ...empty, enabled };
  const tags = (src as Record<string, unknown>).tags;
  const tagIds = Array.isArray(tags)
    ? [...new Set(tags.map((x) => String(x).trim()).filter((x) => ENTRY_TAG_UUID_RE.test(x)))]
    : [];
  return {
    enabled,
    newConversations: (src as Record<string, unknown>).new_conversations === true,
    leads: (src as Record<string, unknown>).leads === true,
    clients: (src as Record<string, unknown>).clients === true,
    tagIds,
  };
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
  const [autoMoveTargetScope, setAutoMoveTargetScope] = useState<'same' | 'other'>('same');
  const [tenantBoardsForAutoMove, setTenantBoardsForAutoMove] = useState<ChatKanbanBoard[]>([]);
  const [tenantBoardsForAutoMoveLoading, setTenantBoardsForAutoMoveLoading] = useState(false);
  const [autoMoveDestBoardColumns, setAutoMoveDestBoardColumns] = useState<ChatKanbanColumn[]>([]);
  const [autoMoveDestBoardColumnsLoading, setAutoMoveDestBoardColumnsLoading] = useState(false);
  const [proposalsDisplay, setProposalsDisplay] = useState<KanbanProposalsDisplay>({
    ...EMPTY_KANBAN_PROPOSALS_DISPLAY,
  });
  const [proposalModelRows, setProposalModelRows] = useState<ProposalTemplate[]>([]);
  const [proposalModelsLoading, setProposalModelsLoading] = useState(false);
  const [entryAutoEnabled, setEntryAutoEnabled] = useState(false);
  const [entryNewConversations, setEntryNewConversations] = useState(false);
  const [entryLeads, setEntryLeads] = useState(false);
  const [entryClients, setEntryClients] = useState(false);
  const [entryAutoTagIds, setEntryAutoTagIds] = useState<string[]>([]);
  const [kanbanCatalogTags, setKanbanCatalogTags] = useState<Array<{ id: string; label: string }>>([]);
  const [kanbanCatalogLoading, setKanbanCatalogLoading] = useState(false);

  useEffect(() => {
    if (!open || !column) return;
    setName(column.name);
    setColor(column.color ?? null);
    setUi(parseKanbanColumnUi(column.metadata));
    setRules(parseKanbanColumnRules(column.metadata));
    const p2 = parseKanbanPhase2(column.metadata);
    setPhase2(p2);
    setAutoMoveTargetScope(p2.automations.auto_move_by_time.to_board_id ? 'other' : 'same');
    const parsed = parseKanbanProposalsDisplay(column.metadata);
    const hasModel = Boolean(
      parsed.default_proposal_model_id?.trim() || parsed.default_proposal_template_id?.trim(),
    );
    setProposalsDisplay(
      hasModel && !parsed.auto_create_proposal_on_enter
        ? { ...parsed, auto_create_proposal_on_enter: true }
        : parsed,
    );
    const entry = parseColumnEntryAutomation(column.metadata);
    setEntryAutoEnabled(entry.enabled);
    setEntryNewConversations(entry.newConversations);
    setEntryLeads(entry.leads);
    setEntryClients(entry.clients);
    setEntryAutoTagIds(entry.tagIds);
    setSelectedFunnelStageId(column.funnel_stage_id ?? null);
    setBoardLinkedFunnelId(null);
    setBoardFunnelName(null);
    setBoardStages([]);
  }, [open, column?.id, column?.updated_at]);

  useEffect(() => {
    if (!open || !column) return;
    let cancelled = false;
    setKanbanCatalogLoading(true);
    void chatKanbanService
      .listTenantKanbanTags()
      .then((rows) => {
        if (!cancelled) {
          setKanbanCatalogTags(
            rows.map((t) => ({ id: t.id, label: t.label })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
          );
        }
      })
      .catch(() => {
        if (!cancelled) setKanbanCatalogTags([]);
      })
      .finally(() => {
        if (!cancelled) setKanbanCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, column?.id]);

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
    if (!open) return;
    let cancelled = false;
    setTenantBoardsForAutoMoveLoading(true);
    void chatKanbanService
      .listBoards(false)
      .then((boards) => {
        if (cancelled) return;
        setTenantBoardsForAutoMove(boards.filter((b) => !b.archived_at && b.is_active !== false));
      })
      .catch(() => {
        if (!cancelled) setTenantBoardsForAutoMove([]);
      })
      .finally(() => {
        if (!cancelled) setTenantBoardsForAutoMoveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !column || autoMoveTargetScope !== 'other') {
      setAutoMoveDestBoardColumns([]);
      setAutoMoveDestBoardColumnsLoading(false);
      return;
    }
    const destBoardId = phase2.automations.auto_move_by_time.to_board_id;
    if (!destBoardId) {
      setAutoMoveDestBoardColumns([]);
      setAutoMoveDestBoardColumnsLoading(false);
      return;
    }
    let cancelled = false;
    setAutoMoveDestBoardColumnsLoading(true);
    void chatKanbanService
      .listColumns(destBoardId)
      .then((cols) => {
        if (!cancelled) setAutoMoveDestBoardColumns(cols);
      })
      .catch(() => {
        if (!cancelled) setAutoMoveDestBoardColumns([]);
      })
      .finally(() => {
        if (!cancelled) setAutoMoveDestBoardColumnsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, column?.id, autoMoveTargetScope, phase2.automations.auto_move_by_time.to_board_id]);

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
    if (!open || !column) return;
    let cancelled = false;
    void (async () => {
      setProposalModelsLoading(true);
      try {
        const rows = await proposalTemplatesService.list();
        if (cancelled) return;
        setProposalModelRows(rows.filter((t) => t?.id).slice(0, 300));
      } catch {
        if (!cancelled) setProposalModelRows([]);
      } finally {
        if (!cancelled) setProposalModelsLoading(false);
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
      const amt = phase2.automations.auto_move_by_time;
      const dst = amt.to_column_id;
      if (!dst) {
        toast.error('Movimento automático: escolha a coluna de destino ou desligue a opção.');
        return;
      }
      if (dst === column.id) {
        toast.error('Movimento automático: a coluna de destino não pode ser a mesma coluna.');
        return;
      }
      if (autoMoveTargetScope === 'same') {
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
      } else {
        if (!amt.to_board_id) {
          toast.error('Movimento automático: escolha o quadro Kanban de destino.');
          return;
        }
        if (amt.to_board_id === column.board_id) {
          toast.error('Movimento automático: para mover dentro deste quadro use «Coluna deste quadro».');
          return;
        }
        if (autoMoveDestBoardColumnsLoading) {
          toast.error('Movimento automático: aguarde o carregamento das colunas do quadro destino.');
          return;
        }
        const destOk = autoMoveDestBoardColumns.some((c) => c.id === dst);
        if (!destOk) {
          toast.error('Movimento automático: coluna inválida para o quadro destino.');
          return;
        }
      }
    }
    if (proposalsDisplay.move_on_proposal_accept) {
      const dst = proposalsDisplay.target_column_id;
      if (!dst) {
        toast.error('Mover ao aceitar proposta: escolha a coluna de destino ou desligue a opção.');
        return;
      }
      if (dst === column.id) {
        toast.error('A coluna de destino não pode ser a mesma coluna.');
        return;
      }
      const destOk = boardColumnsForMove.some((c) => c.id === dst);
      if (!destOk) {
        toast.error('Coluna de destino inválida neste quadro.');
        return;
      }
      const otherCols = boardColumnsForMove.filter((c) => c.id !== column.id);
      if (otherCols.length === 0) {
        toast.error('Adicione outra coluna ao quadro para poder definir o destino.');
        return;
      }
    }
    if (proposalsDisplay.auto_create_proposal_on_enter) {
      const hasModel = Boolean(
        proposalsDisplay.default_proposal_model_id?.trim() ||
          proposalsDisplay.default_proposal_template_id?.trim(),
      );
      if (!hasModel) {
        toast.error('«Criar proposta ao entrar na coluna»: escolha um modelo ou desligue a opção.');
        return;
      }
    }
    const entryHasAnySource =
      entryNewConversations || entryLeads || entryClients || entryAutoTagIds.length > 0;
    if (entryAutoEnabled && !entryHasAnySource) {
      toast.error(
        'Entrada automática no quadro: escolha pelo menos uma origem (novas conversas, leads, clientes ou tags) ou desative.',
      );
      return;
    }
    setSaving(true);
    try {
      const baseMeta =
        column.metadata && typeof column.metadata === 'object' ? (column.metadata as Record<string, unknown>) : {};
      const phase2ToSave =
        phase2.automations.auto_move_by_time.enabled && autoMoveTargetScope === 'same'
          ? {
              ...phase2,
              automations: {
                ...phase2.automations,
                auto_move_by_time: {
                  ...phase2.automations.auto_move_by_time,
                  to_board_id: null,
                },
              },
            }
          : phase2;
      const meta = mergeKanbanProposalsIntoMetadata(
        mergeColumnMetadataFull(baseMeta, ui, rules, phase2ToSave),
        proposalsDisplay,
      );
      meta.automation_config = {
        enabled: entryAutoEnabled && entryHasAnySource,
        sources: {
          new_conversations: entryNewConversations,
          leads: entryLeads,
          clients: entryClients,
          tags: entryAutoTagIds,
        },
      };
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

  const staleProposalModelId =
    !!proposalsDisplay.default_proposal_model_id &&
    !proposalModelsLoading &&
    !proposalModelRows.some((p) => p.id === proposalsDisplay.default_proposal_model_id);

  const itemClass =
    'border border-border/40 rounded-md bg-card/30 overflow-hidden mb-1.5 last:mb-0';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        <SheetHeader className="px-5 pt-5 pb-1.5 space-y-0.5 shrink-0 text-left">
          <SheetTitle className="text-base">Coluna</SheetTitle>
          <SheetDescription className="text-xs leading-snug">
            Nome, visual e regras ao mover cartões para aqui.
          </SheetDescription>
        </SheetHeader>

        {!column ? null : (
          <>
            <ScrollArea className="flex-1 min-h-0 px-5 [&_[data-radix-scroll-area-viewport]]:!block">
              <div className="pb-4 pr-1.5 pt-0.5">
                <Accordion
                  type="multiple"
                  defaultValue={[]}
                  className="w-full"
                >
                  <AccordionItem value="general" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Settings2} title="Geral" subtitle="Nome, cor, visibilidade" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="space-y-2.5 pt-2.5">
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
                        <p className="text-[10px] text-muted-foreground/90">{positionLabel}</p>
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
                          <Label
                            htmlFor="col-hidden"
                            className="text-sm font-normal cursor-pointer"
                            title="A coluna deixa de aparecer no quadro; os cartões mantêm-se na coluna."
                          >
                            Ocultar no quadro
                          </Label>
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
                </Accordion>

                <div className="mt-3 rounded-lg border border-border/40 bg-muted/5 px-2 py-2 space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-0.5">
                    Automações
                  </p>

                  <Accordion type="multiple" defaultValue={[]} className="w-full">
                  <AccordionItem value="entry-automation" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader
                        icon={ArrowDownToLine}
                        title="Entrada no quadro"
                        subtitle="Novas conversas, leads, clientes ou tags"
                      />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="col-entry-auto-enabled" className="text-sm font-normal cursor-pointer">
                            Ativar
                          </Label>
                          <Switch
                            id="col-entry-auto-enabled"
                            checked={entryAutoEnabled}
                            onCheckedChange={(v) => {
                              setEntryAutoEnabled(v);
                              if (!v) {
                                setEntryNewConversations(false);
                                setEntryLeads(false);
                                setEntryClients(false);
                                setEntryAutoTagIds([]);
                              }
                            }}
                            disabled={saving}
                          />
                        </div>
                        {entryAutoEnabled ? (
                          <>
                            <div className="rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Incluir</Label>
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                  checked={entryNewConversations}
                                  disabled={saving}
                                  onCheckedChange={(c) => setEntryNewConversations(c === true)}
                                />
                                <span>Novas conversas</span>
                              </label>
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                  checked={entryLeads}
                                  disabled={saving}
                                  onCheckedChange={(c) => setEntryLeads(c === true)}
                                />
                                <span>Leads</span>
                              </label>
                              <label className="flex cursor-pointer items-center gap-2 text-xs">
                                <Checkbox
                                  checked={entryClients}
                                  disabled={saving}
                                  onCheckedChange={(c) => setEntryClients(c === true)}
                                />
                                <span>Clientes</span>
                              </label>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Conversas com tag</Label>
                              {kanbanCatalogLoading ? (
                                <p className="text-[11px] text-muted-foreground">A carregar tags…</p>
                              ) : kanbanCatalogTags.length === 0 ? (
                                <p className="text-[10px] text-muted-foreground">Sem tags Kanban no tenant.</p>
                              ) : (
                                <ScrollArea className="h-[min(220px,40vh)] rounded-md border border-border/50 bg-muted/10 pr-2">
                                  <div className="space-y-0 p-2">
                                    {kanbanCatalogTags.map((t) => {
                                      const checked = entryAutoTagIds.includes(t.id);
                                      return (
                                        <label
                                          key={t.id}
                                          className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50"
                                        >
                                          <Checkbox
                                            checked={checked}
                                            disabled={saving}
                                            onCheckedChange={(c) => {
                                              const on = c === true;
                                              setEntryAutoTagIds((prev) =>
                                                on
                                                  ? prev.includes(t.id)
                                                    ? prev
                                                    : [...prev, t.id]
                                                  : prev.filter((x) => x !== t.id),
                                              );
                                            }}
                                          />
                                          <span className="min-w-0 flex-1 truncate">{t.label}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </ScrollArea>
                              )}
                            </div>
                          </>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  </Accordion>

                  <div className="rounded-md border border-border/35 bg-background/30 px-2 py-2 space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-0.5">
                      Ao entrar na coluna
                    </p>
                    <Accordion type="multiple" defaultValue={[]} className="w-full">
                  <AccordionItem value="attendance" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Headphones} title="Atendimento" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5">
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
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Tags} title="Organização" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5">
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

                  <AccordionItem value="commercial" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Briefcase} title="CRM" subtitle="Lead e cliente" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="phase2-ensure-client"
                            className="text-xs font-normal cursor-pointer leading-snug"
                            title="Cliente existente mantém-se; lead converte; senão dedupe ou criação."
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
                          <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 px-2 py-1.5">
                            <div className="flex items-center justify-between gap-3">
                              <Label
                                htmlFor="phase2-auto-lead-create"
                                className="text-xs font-normal cursor-pointer leading-snug"
                              >
                                Criar lead se não houver igual
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
                          </div>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="funnel" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={GitBranch} title="Funil" subtitle="Estágio CRM (board ligado)" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5">
                        <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2 text-sm">
                          {funnelLoading ? (
                            <p className="text-[11px] text-muted-foreground">A carregar…</p>
                          ) : !boardLinkedFunnelId ? (
                            <p className="text-[11px] text-muted-foreground leading-snug">
                              Vincule um funil ao quadro no topo do Kanban.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[11px] text-muted-foreground truncate" title={boardFunnelName ?? boardLinkedFunnelId}>
                                <span className="font-medium text-foreground">{boardFunnelName ?? boardLinkedFunnelId}</span>
                              </p>
                              <div className="space-y-1">
                                <Label className="text-[11px]">Estágio</Label>
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

                  <Accordion type="multiple" defaultValue={[]} className="w-full">
                    <AccordionItem value="automations" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Timer} title="Movimento por tempo" subtitle="Após X, mover de coluna" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="auto-move-enabled" className="text-sm font-normal cursor-pointer">
                            Ativar
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
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">Mover para</Label>
                              <RadioGroup
                                value={autoMoveTargetScope}
                                onValueChange={(v) => {
                                  const scope = v as 'same' | 'other';
                                  setAutoMoveTargetScope(scope);
                                  if (scope === 'same') {
                                    setPhase2((prev) => ({
                                      ...prev,
                                      automations: {
                                        ...prev.automations,
                                        auto_move_by_time: {
                                          ...prev.automations.auto_move_by_time,
                                          to_board_id: null,
                                          to_column_id: null,
                                        },
                                      },
                                    }));
                                  } else {
                                    setPhase2((prev) => ({
                                      ...prev,
                                      automations: {
                                        ...prev.automations,
                                        auto_move_by_time: {
                                          ...prev.automations.auto_move_by_time,
                                          to_column_id: null,
                                        },
                                      },
                                    }));
                                  }
                                }}
                                disabled={saving}
                                className="gap-2"
                              >
                                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                                  <RadioGroupItem value="same" id="auto-move-same" />
                                  Coluna deste quadro
                                </label>
                                <label className="flex items-center gap-2 text-sm font-normal cursor-pointer">
                                  <RadioGroupItem value="other" id="auto-move-other" />
                                  Outro quadro Kanban
                                </label>
                              </RadioGroup>
                            </div>
                            {autoMoveTargetScope === 'same' ? (
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
                                          to_board_id: null,
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
                            ) : (
                              <div className="space-y-2">
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Quadro destino</Label>
                                  <Select
                                    value={phase2.automations.auto_move_by_time.to_board_id ?? '__none__'}
                                    onValueChange={(v) =>
                                      setPhase2((prev) => ({
                                        ...prev,
                                        automations: {
                                          ...prev.automations,
                                          auto_move_by_time: {
                                            ...prev.automations.auto_move_by_time,
                                            to_board_id: v === '__none__' ? null : v,
                                            to_column_id: null,
                                          },
                                        },
                                      }))
                                    }
                                    disabled={saving || tenantBoardsForAutoMoveLoading}
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue
                                        placeholder={
                                          tenantBoardsForAutoMoveLoading ? 'A carregar…' : 'Selecionar quadro'
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Selecionar…</SelectItem>
                                      {tenantBoardsForAutoMove
                                        .filter((b) => b.id !== column.board_id)
                                        .map((b) => (
                                          <SelectItem key={b.id} value={b.id}>
                                            {b.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                  {tenantBoardsForAutoMove.filter((b) => b.id !== column.board_id).length === 0 &&
                                  !tenantBoardsForAutoMoveLoading ? (
                                    <p className="text-[11px] text-muted-foreground">
                                      Não há outro quadro ativo. Crie outro Kanban ou reative um existente.
                                    </p>
                                  ) : null}
                                </div>
                                <div className="space-y-1.5">
                                  <Label className="text-xs">Coluna no quadro destino</Label>
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
                                    disabled={
                                      saving ||
                                      !phase2.automations.auto_move_by_time.to_board_id ||
                                      autoMoveDestBoardColumnsLoading
                                    }
                                  >
                                    <SelectTrigger className="h-9 text-xs">
                                      <SelectValue
                                        placeholder={
                                          !phase2.automations.auto_move_by_time.to_board_id
                                            ? 'Escolha primeiro o quadro'
                                            : autoMoveDestBoardColumnsLoading
                                              ? 'A carregar…'
                                              : 'Selecionar coluna'
                                        }
                                      />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none__">Selecionar…</SelectItem>
                                      {autoMoveDestBoardColumns.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}
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
                          </>
                        ) : null}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  </Accordion>

                  <div className="mt-2 rounded-md border border-border/35 bg-background/25 px-2 py-1.5 space-y-1.5">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground px-0.5">
                      Propostas
                    </p>
                    <Accordion type="multiple" defaultValue={[]} className="w-full">
                      <AccordionItem value="proposals" className={cn(itemClass, 'border-b-0')}>
                        <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={FileText} title="Cartão e propostas" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="kanban-prop-pending"
                            className="text-xs font-normal cursor-pointer leading-snug"
                          >
                            Mostrar pendente <span className="text-muted-foreground font-normal">(sent)</span>
                          </Label>
                          <Switch
                            id="kanban-prop-pending"
                            checked={proposalsDisplay.show_pending}
                            onCheckedChange={(v) =>
                              setProposalsDisplay((prev) => ({ ...prev, show_pending: v }))
                            }
                            disabled={saving}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="kanban-prop-accepted"
                            className="text-xs font-normal cursor-pointer leading-snug"
                          >
                            Mostrar aceite <span className="text-muted-foreground font-normal">(accepted)</span>
                          </Label>
                          <Switch
                            id="kanban-prop-accepted"
                            checked={proposalsDisplay.show_accepted}
                            onCheckedChange={(v) =>
                              setProposalsDisplay((prev) => ({ ...prev, show_accepted: v }))
                            }
                            disabled={saving}
                          />
                        </div>
                        <div className="rounded-md border border-border/40 bg-muted/10 px-2 py-1.5 space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <Label
                              htmlFor="kanban-prop-move-accept"
                              className="text-xs font-normal cursor-pointer leading-snug"
                            >
                              Mover cartão ao aceitar proposta
                            </Label>
                            <Switch
                              id="kanban-prop-move-accept"
                              checked={proposalsDisplay.move_on_proposal_accept}
                              onCheckedChange={(v) =>
                                setProposalsDisplay((prev) => ({
                                  ...prev,
                                  move_on_proposal_accept: v,
                                  target_column_id: v ? prev.target_column_id : null,
                                }))
                              }
                              disabled={saving}
                            />
                          </div>
                          {proposalsDisplay.move_on_proposal_accept ? (
                            <div className="space-y-1.5">
                              <Label className="text-[11px] text-muted-foreground">Destino</Label>
                              <Select
                                value={proposalsDisplay.target_column_id || '__none__'}
                                onValueChange={(val) =>
                                  setProposalsDisplay((prev) => ({
                                    ...prev,
                                    target_column_id: val === '__none__' ? null : val,
                                  }))
                                }
                                disabled={saving}
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder="Escolher coluna" />
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
                          ) : null}
                        </div>
                        <div className="space-y-2 pt-1.5 border-t border-border/30">
                          <div className="flex items-center justify-between gap-3">
                            <Label
                              htmlFor="kanban-prop-auto-create"
                              className="text-xs font-normal cursor-pointer leading-snug"
                              title="Requer lead ou cliente na conversa."
                            >
                              Criar proposta ao entrar
                            </Label>
                            <Switch
                              id="kanban-prop-auto-create"
                              checked={proposalsDisplay.auto_create_proposal_on_enter}
                              onCheckedChange={(v) =>
                                setProposalsDisplay((prev) => ({
                                  ...prev,
                                  auto_create_proposal_on_enter: v,
                                  ...(!v
                                    ? { default_proposal_model_id: null, default_proposal_template_id: null }
                                    : {}),
                                }))
                              }
                              disabled={saving}
                            />
                          </div>
                          {proposalsDisplay.auto_create_proposal_on_enter ? (
                            <>
                              <Label className="text-[11px] text-muted-foreground">Modelo</Label>
                              {proposalsDisplay.default_proposal_template_id &&
                              !proposalsDisplay.default_proposal_model_id ? (
                                <div
                                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-950/90 dark:text-amber-100/90"
                                  role="status"
                                >
                                  Referência <strong>legada</strong> a rascunho. Escolha um modelo oficial ou «Nenhum».
                                </div>
                              ) : null}
                              {proposalModelsLoading ? (
                                <p className="text-[10px] text-muted-foreground">A carregar modelos…</p>
                              ) : (
                                <Select
                                  value={proposalsDisplay.default_proposal_model_id || '__none__'}
                                  onValueChange={(val) =>
                                    setProposalsDisplay((prev) => {
                                      if (val === '__none__') {
                                        return {
                                          ...prev,
                                          default_proposal_model_id: null,
                                          default_proposal_template_id: null,
                                        };
                                      }
                                      return {
                                        ...prev,
                                        default_proposal_model_id: val,
                                        default_proposal_template_id: null,
                                      };
                                    })
                                  }
                                  disabled={saving}
                                >
                                  <SelectTrigger className="h-9 text-xs">
                                    <SelectValue placeholder="Nenhum modelo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">Nenhum</SelectItem>
                                    {proposalModelRows.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                        {!p.is_active ? ' (inativo)' : ''}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {staleProposalModelId ? (
                                <div
                                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-950/90 dark:text-amber-100/90"
                                  role="status"
                                >
                                  O modelo referenciado já não está disponível ou está inativo. Escolha outro ou
                                  «Nenhum».
                                </div>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                    </Accordion>
                  </div>

                  <Accordion type="multiple" defaultValue={[]} className="w-full">
                    <AccordionItem value="productivity" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={CalendarClock} title="Tarefas" subtitle="Tarefa ao entrar na coluna" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <Label
                            htmlFor="phase2-auto-task"
                            className="text-xs font-normal cursor-pointer"
                            title="{{column_name}}, {{contact_name}}, {{display_name}}, {{conversation_id}}, {{canonical_phone}}"
                          >
                            Criar tarefa ao entrar
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
                          <div className="space-y-2.5 rounded-md border border-border/40 bg-muted/10 p-2">
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
                        <FuturePlaceholder description="Lembretes e cadências automáticas — em breve." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="communication" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Megaphone} title="Mensagens e webhook" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5 space-y-2.5">
                        <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2 text-sm">
                          <p className="text-[10px] text-amber-900/85 dark:text-amber-100/85 leading-snug">
                            Mensagem ao cliente: envio automático; falhas não desfazem o movimento do cartão.
                          </p>
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
                            <div className="space-y-2">
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
                                    <div className="rounded-md border border-dashed border-border/60 bg-background/50 px-2 py-2 space-y-1.5">
                                      <p className="text-[10px] text-muted-foreground leading-snug">
                                        Sem modelos ativos. Crie em Templates WhatsApp.
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
                                        <div className="rounded-md border border-border/50 bg-background/80 px-2 py-1.5 text-[10px] text-muted-foreground">
                                          {selectedWhatsappModel.message_count} mensagem(ns) ·{' '}
                                          {selectedWhatsappModel.category_name || '—'}
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              )}

                              <p className="text-[9px] text-muted-foreground leading-tight">
                                Variáveis:{' '}
                                <code className="bg-muted/80 px-0.5 rounded">{'{{contact_name}} {{column_name}} {{board_name}} …'}</code>
                              </p>
                            </div>
                          ) : null}
                        </div>

                        <div className="rounded-md border border-border/40 bg-muted/10 p-2 space-y-2 text-sm">
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

                          <details className="rounded border border-border/35 bg-background/50 p-2" open={false}>
                            <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">
                              Opções avançadas
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
                              <p className="text-[9px] text-muted-foreground">Falha do webhook não bloqueia o cartão.</p>
                            </div>
                          </details>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="sla" className={cn(itemClass, 'border-b-0')}>
                    <AccordionTrigger
                      className={cn(
                        'px-3 py-2 text-sm hover:no-underline',
                        'hover:bg-muted/25 rounded-t-md [&[data-state=open]]:bg-muted/15',
                      )}
                    >
                      <AccordionSectionHeader icon={Scale} title="SLA e validações" />
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-2.5 pt-0 border-t border-border/30">
                      <div className="pt-2.5">
                        <FuturePlaceholder description="SLA, bloqueios e alertas — em breve." />
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                </div>
              </div>
            </ScrollArea>

            <SheetFooter className="px-5 py-3 border-t border-border/50 shrink-0 gap-2 sm:gap-2">
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
