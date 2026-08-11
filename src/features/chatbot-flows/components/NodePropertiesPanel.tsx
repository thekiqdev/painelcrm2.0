import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Plus, RefreshCw, Trash2, Radio, Loader2, Images, ChevronUp, ChevronDown } from 'lucide-react';
import { VariableTextField } from './VariableTextField';
import { MediaPickerDialog, type MediaPickerAccept } from '@/components/media/MediaPickerDialog';
import type { MediaLibraryAsset } from '@/services/mediaLibrary';
import { NODE_LABELS, generateInboundWebhookToken, buildInboundWebhookPath, readSetVariableAssignments, resolveSendMessageItems, SEND_MESSAGE_MAX_ITEMS, type EssentialNodeType } from '../lib/nodeCatalog';
import {
  ARROW_COLORS,
  EDITOR_ONLY_LABELS,
  STICKY_COLORS,
  TEXT_COLORS,
  isEditorOnlyNodeType,
  type EditorOnlyNodeType,
} from '../lib/canvasAnnotations';
import type { FlowKanbanColumnMeta, FlowSelectOption } from '../hooks/useFlowCrmOptions';
import { Button } from '@/components/ui/button';
import { previewNormalizePhoneBr } from '../lib/ensureConversationPhone';
import { readMenuOptionsForEditor, type MenuChoiceOption } from '../lib/menuChoiceHelpers';
import {
  migrateLegacyConditionData,
  newConditionCaseId,
  readConditionCasesForEditor,
  type ConditionCase,
  type ConditionOperator,
  type ConditionRule,
} from '../lib/conditionHelpers';
import { formatTimeoutHint, isInputTimeoutEnabled } from '../lib/inputTimeout';
import { HttpIntegrationTestSection } from './HttpIntegrationTestSection';
import { HttpMethodTags } from './HttpMethodTags';
import { BodyJsonFieldsEditor, HeadersJsonFieldsEditor } from './JsonOrFieldsEditor';
import { collectFlowDefinedVariables, type FlowDefinedVariable } from '../lib/flowDefinedVariables';
import { applyHttpResponseMap, suggestVarNameFromPath } from '../lib/httpTestHelpers';
import { HttpJsonSampleTree } from './HttpJsonSampleTree';
import {
  cancelWebhookInListen,
  getWebhookInSample,
  pollWebhookInListen,
  rotateWebhookInSample,
  startWebhookInListen,
} from '@/services/chatbotFlows';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type CrmOptions = {
  loading?: boolean;
  agentOptions: FlowSelectOption[];
  teamOptions: FlowSelectOption[];
  queueOptions: FlowSelectOption[];
  tagOptions: FlowSelectOption[];
  boardOptions: FlowSelectOption[];
  columnsByBoardId: Record<string, FlowSelectOption[]>;
  kanbanColumns: FlowKanbanColumnMeta[];
  columnOptions: FlowSelectOption[];
};

type Props = {
  nodeId: string;
  type: string;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  crmOptions?: CrmOptions;
  /** Nós do canvas — para listar variáveis criadas neste flow. */
  graphNodes?: Array<{ id: string; type?: string; data?: Record<string, unknown> }>;
  /** Flow atual — necessário para listen do webhook_in (S27.1). */
  flowId?: string | null;
};

function OptionSelect({
  label,
  value,
  placeholder,
  options,
  loading,
  onValueChange,
  allowEmpty,
  emptyLabel = 'Nenhuma',
  disabled,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: FlowSelectOption[];
  loading?: boolean;
  onValueChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select
        value={value || (allowEmpty ? '__none__' : undefined)}
        onValueChange={(v) => onValueChange(v === '__none__' ? '' : v)}
        disabled={loading || disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Carregando…' : placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? <SelectItem value="__none__">{emptyLabel}</SelectItem> : null}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!loading && !disabled && options.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nenhuma opção disponível neste tenant.</p>
      ) : null}
    </div>
  );
}

export function NodePropertiesPanel({
  nodeId,
  type,
  data,
  onChange,
  crmOptions,
  graphNodes = [],
  flowId = null,
}: Props) {
  const title = isEditorOnlyNodeType(type)
    ? EDITOR_ONLY_LABELS[type as EditorOnlyNodeType]
    : NODE_LABELS[type as EssentialNodeType] || type;
  /** Só recálcula quando mudam nomes de variáveis (não a cada tecla no texto). */
  const flowVarSignature = graphNodes
    .map((n) => {
      const d = (n.data || {}) as Record<string, unknown>;
      const map = Array.isArray(d.response_map) ? JSON.stringify(d.response_map) : '';
      const optVars = Array.isArray(d.options)
        ? JSON.stringify(
            (d.options as Array<Record<string, unknown>>).map((o) => o.set_variables || [])
          )
        : '';
      return [
        n.id,
        n.type,
        d.variable,
        d.status_variable,
        d.response_variable,
        map,
        optVars,
      ].join(':');
    })
    .join('|');
  const flowVariables = useMemo(
    () => collectFlowDefinedVariables(graphNodes),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assinatura estável
    [flowVarSignature]
  );
  const opts = crmOptions ?? {
    agentOptions: [],
    teamOptions: [],
    queueOptions: [],
    tagOptions: [],
    boardOptions: [],
    columnsByBoardId: {},
    kanbanColumns: [],
    columnOptions: [],
  };

  const inferredBoardId =
    String(data.board_id || '') ||
    opts.kanbanColumns.find((c) => c.columnId === String(data.column_id || ''))?.boardId ||
    '';
  const columnsForBoard = opts.columnsByBoardId[inferredBoardId] ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">Editar nó</p>
        <p className="font-medium text-sm">{title}</p>
        <p className="text-[10px] text-muted-foreground truncate font-mono mt-0.5">{nodeId}</p>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {type === 'start' ? (
          <>
            <div className="space-y-1.5">
              <Label>Quando iniciar</Label>
              <Select
                value={
                  (data.trigger as { type?: string } | undefined)?.type === 'keyword'
                    ? 'keyword'
                    : (data.trigger as { type?: string } | undefined)?.type === 'tag'
                      ? 'tag'
                      : (data.trigger as { type?: string } | undefined)?.type === 'kanban_column'
                        ? 'kanban_column'
                        : 'first_message'
                }
                onValueChange={(v) => {
                  if (v === 'keyword') {
                    onChange({
                      trigger: {
                        type: 'keyword',
                        value: String(
                          (data.trigger as { value?: string } | undefined)?.value || ''
                        ),
                        match:
                          (data.trigger as { match?: string } | undefined)?.match === 'equals'
                            ? 'equals'
                            : 'contains',
                      },
                    });
                  } else if (v === 'tag') {
                    const prev = data.trigger as
                      | { tag_id?: string; tag_label?: string }
                      | undefined;
                    onChange({
                      trigger: {
                        type: 'tag',
                        tag_id: prev?.tag_id || null,
                        tag_label: prev?.tag_label || null,
                      },
                    });
                  } else if (v === 'kanban_column') {
                    const prev = data.trigger as
                      | { column_id?: string; board_id?: string }
                      | undefined;
                    onChange({
                      trigger: {
                        type: 'kanban_column',
                        column_id: prev?.column_id || '',
                        board_id: prev?.board_id || null,
                      },
                    });
                  } else {
                    const idle = (data.trigger as { idle_after_hours?: number } | undefined)
                      ?.idle_after_hours;
                    onChange({
                      trigger: {
                        type: 'first_message',
                        ...(idle != null && Number(idle) > 0
                          ? { idle_after_hours: Number(idle) }
                          : {}),
                      },
                    });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_message">Primeira mensagem / idle</SelectItem>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="tag">Tag na conversa</SelectItem>
                  <SelectItem value="kanban_column">Coluna Kanban</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(data.trigger as { type?: string } | undefined)?.type === 'keyword' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="kw">Palavra-chave</Label>
                  <Input
                    id="kw"
                    value={String((data.trigger as { value?: string })?.value || '')}
                    onChange={(e) =>
                      onChange({
                        trigger: {
                          type: 'keyword',
                          value: e.target.value,
                          match:
                            (data.trigger as { match?: string })?.match === 'equals'
                              ? 'equals'
                              : 'contains',
                        },
                      })
                    }
                    placeholder="oi | olá | menu"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Separe várias com <code>|</code> (ex.: oi|olá|menu).
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Modo de match</Label>
                  <Select
                    value={
                      (data.trigger as { match?: string } | undefined)?.match === 'equals'
                        ? 'equals'
                        : 'contains'
                    }
                    onValueChange={(v) =>
                      onChange({
                        trigger: {
                          type: 'keyword',
                          value: String((data.trigger as { value?: string })?.value || ''),
                          match: v === 'equals' ? 'equals' : 'contains',
                        },
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contém (padrão)</SelectItem>
                      <SelectItem value="equals">Igual à mensagem inteira</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            {(data.trigger as { type?: string } | undefined)?.type === 'tag' ? (
              <>
                <OptionSelect
                  label="Tag do Kanban"
                  value={String(
                    (data.trigger as { tag_id?: string } | undefined)?.tag_id || ''
                  )}
                  placeholder="Selecione uma tag"
                  options={opts.tagOptions}
                  loading={opts.loading}
                  onValueChange={(tagId) => {
                    const found = opts.tagOptions.find((o) => o.value === tagId);
                    onChange({
                      trigger: {
                        type: 'tag',
                        tag_id: tagId || null,
                        tag_label: found?.label || null,
                      },
                    });
                  }}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="start-tag-label">Ou nome da tag</Label>
                  <Input
                    id="start-tag-label"
                    value={
                      (data.trigger as { tag_id?: string } | undefined)?.tag_id
                        ? ''
                        : String(
                            (data.trigger as { tag_label?: string } | undefined)?.tag_label ||
                              ''
                          )
                    }
                    onChange={(e) =>
                      onChange({
                        trigger: {
                          type: 'tag',
                          tag_id: null,
                          tag_label: e.target.value || null,
                        },
                      })
                    }
                    placeholder="Ex.: lead-quente"
                    disabled={Boolean(
                      (data.trigger as { tag_id?: string } | undefined)?.tag_id
                    )}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Dispara ao adicionar a tag na conversa (não pelo nó Tag do próprio flow).
                  </p>
                </div>
              </>
            ) : null}
            {(data.trigger as { type?: string } | undefined)?.type === 'kanban_column' ? (
              <>
                <OptionSelect
                  label="Board"
                  value={
                    String(
                      (data.trigger as { board_id?: string } | undefined)?.board_id || ''
                    ) ||
                    opts.kanbanColumns.find(
                      (c) =>
                        c.columnId ===
                        String(
                          (data.trigger as { column_id?: string } | undefined)?.column_id ||
                            ''
                        )
                    )?.boardId ||
                    ''
                  }
                  placeholder="Selecione o board"
                  options={opts.boardOptions}
                  loading={opts.loading}
                  onValueChange={(board_id) => {
                    onChange({
                      trigger: {
                        type: 'kanban_column',
                        board_id: board_id || null,
                        column_id: '',
                      },
                    });
                  }}
                />
                <OptionSelect
                  label="Coluna"
                  value={String(
                    (data.trigger as { column_id?: string } | undefined)?.column_id || ''
                  )}
                  placeholder={
                    String(
                      (data.trigger as { board_id?: string } | undefined)?.board_id || ''
                    ) || inferredBoardId
                      ? 'Selecione a coluna'
                      : 'Escolha o board primeiro'
                  }
                  options={
                    opts.columnsByBoardId[
                      String(
                        (data.trigger as { board_id?: string } | undefined)?.board_id || ''
                      ) ||
                        opts.kanbanColumns.find(
                          (c) =>
                            c.columnId ===
                            String(
                              (data.trigger as { column_id?: string } | undefined)
                                ?.column_id || ''
                            )
                        )?.boardId ||
                        ''
                    ] ?? []
                  }
                  loading={opts.loading}
                  disabled={
                    !(
                      String(
                        (data.trigger as { board_id?: string } | undefined)?.board_id || ''
                      ) || inferredBoardId
                    )
                  }
                  onValueChange={(column_id) => {
                    const boardId =
                      String(
                        (data.trigger as { board_id?: string } | undefined)?.board_id || ''
                      ) ||
                      opts.kanbanColumns.find((c) => c.columnId === column_id)?.boardId ||
                      '';
                    onChange({
                      trigger: {
                        type: 'kanban_column',
                        board_id: boardId || null,
                        column_id,
                      },
                    });
                  }}
                />
                <p className="text-[10px] text-muted-foreground">
                  Dispara ao criar ou mover o card da conversa para esta coluna.
                </p>
              </>
            ) : null}
            {(data.trigger as { type?: string } | undefined)?.type !== 'keyword' &&
            (data.trigger as { type?: string } | undefined)?.type !== 'tag' &&
            (data.trigger as { type?: string } | undefined)?.type !== 'kanban_column' ? (
              <div className="space-y-1.5">
                <Label htmlFor="idle">Reativar após idle (horas)</Label>
                <Input
                  id="idle"
                  type="number"
                  min={0}
                  max={8760}
                  placeholder="0 = só 1ª mensagem"
                  value={
                    (data.trigger as { idle_after_hours?: number | null })?.idle_after_hours !=
                      null &&
                    Number((data.trigger as { idle_after_hours?: number }).idle_after_hours) > 0
                      ? String((data.trigger as { idle_after_hours?: number }).idle_after_hours)
                      : ''
                  }
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onChange({
                      trigger: {
                        type: 'first_message',
                        ...(Number.isFinite(n) && n > 0 ? { idle_after_hours: n } : {}),
                      },
                    });
                  }}
                />
                <p className="text-[10px] text-muted-foreground">
                  Além da 1ª mensagem: inicia se o cliente ficou sem enviar por N horas.
                </p>
              </div>
            ) : null}
            <p className="text-[10px] text-muted-foreground rounded-md border bg-muted/40 px-2 py-1.5">
              Opt-out global: se o contato enviar exatamente <code>parar</code> ou{' '}
              <code>sair</code>, qualquer sessão viva deste módulo encerra.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="dm_only"
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={data.dm_only === true}
                onChange={(e) => onChange({ dm_only: e.target.checked })}
              />
              <Label htmlFor="dm_only" className="font-normal text-sm">
                Somente conversas 1:1 (ignorar grupos)
              </Label>
            </div>
            <div className="space-y-1.5 pt-1">
              <Label>Se já houver sessão ativa</Label>
              <Select
                value={
                  data.session_policy === 'restart_on_keyword'
                    ? 'restart_on_keyword'
                    : 'ignore_if_session_alive'
                }
                onValueChange={(v) =>
                  onChange({
                    session_policy:
                      v === 'restart_on_keyword'
                        ? 'restart_on_keyword'
                        : 'ignore_if_session_alive',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ignore_if_session_alive">
                    Ignorar (não reinicia)
                  </SelectItem>
                  <SelectItem value="restart_on_keyword">
                    Reiniciar se palavra-chave
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Reiniciar só vale para gatilho palavra-chave. Tag/coluna não iniciam se já houver
                sessão. Com “Reiniciar”, a keyword encerra a sessão viva e começa o flow do zero.
              </p>
            </div>
            <div className="space-y-1.5 pt-2 border-t">
              <Label htmlFor="priority">Prioridade (S24)</Label>
              <Input
                id="priority"
                type="number"
                min={-999}
                max={9999}
                value={data.priority != null ? String(data.priority) : '0'}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({ priority: Number.isFinite(n) ? n : 0 });
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Maior número vence quando dois flows casam o mesmo trigger.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cooldown">Cooldown (minutos)</Label>
              <Input
                id="cooldown"
                type="number"
                min={0}
                max={10080}
                placeholder="0 = off · sugestão 30"
                value={
                  data.cooldown_minutes != null && Number(data.cooldown_minutes) > 0
                    ? String(data.cooldown_minutes)
                    : ''
                }
                onChange={(e) => {
                  const n = Number(e.target.value);
                  onChange({
                    cooldown_minutes: Number.isFinite(n) && n > 0 ? n : 0,
                  });
                }}
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                id="schedule_enabled"
                type="checkbox"
                className="h-4 w-4 rounded border"
                checked={data.schedule_enabled === true}
                onChange={(e) => onChange({ schedule_enabled: e.target.checked })}
              />
              <Label htmlFor="schedule_enabled" className="font-normal text-sm">
                Só dentro do horário
              </Label>
            </div>
            {data.schedule_enabled === true ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="sch_start">Início</Label>
                  <Input
                    id="sch_start"
                    type="time"
                    value={String(data.schedule_start || '09:00')}
                    onChange={(e) => onChange({ schedule_start: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="sch_end">Fim</Label>
                  <Input
                    id="sch_end"
                    type="time"
                    value={String(data.schedule_end || '18:00')}
                    onChange={(e) => onChange({ schedule_end: e.target.value })}
                  />
                </div>
                <p className="col-span-2 text-[10px] text-muted-foreground">
                  Usa o timezone da empresa (tenant). Sessão já em pergunta continua respondendo.
                </p>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="instance_ids">Instâncias (UUIDs, vírgula)</Label>
              <Input
                id="instance_ids"
                placeholder="vazio = todas"
                value={
                  Array.isArray(data.instance_ids)
                    ? (data.instance_ids as string[]).join(', ')
                    : ''
                }
                onChange={(e) => {
                  const ids = e.target.value
                    .split(/[,;\s]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  onChange({ instance_ids: ids });
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Limita o flow a instâncias WhatsApp específicas.
              </p>
            </div>
          </>
        ) : null}

        {type === 'webhook_in' ? (
          <WebhookInFields data={data} onChange={onChange} flowId={flowId} />
        ) : null}

        {type === 'send_message' ? (
          <SendMessageFields data={data} onChange={onChange} flowVariables={flowVariables} />
        ) : null}

        {type === 'wait_input' ? (
          <>
            <VariableTextField
              id="prompt"
              label="Pergunta"
              rows={3}
              value={String(data.prompt || '')}
              onChange={(prompt) => onChange({ prompt })}
              flowVariables={flowVariables}
              placeholder="Qual o seu nome?"
            />
            <div className="space-y-1.5">
              <Label htmlFor="var">Salvar resposta em</Label>
              <Input
                id="var"
                value={String(data.variable || '')}
                onChange={(e) => onChange({ variable: e.target.value })}
                placeholder="answer"
              />
            </div>
            <WaitInputAcceptFields data={data} onChange={onChange} />
            <WaitInputContactFields data={data} onChange={onChange} />
            <InputTimeoutFields data={data} onChange={onChange} />
          </>
        ) : null}

        {type === 'menu_choice' ? (
          <MenuChoiceFields data={data} onChange={onChange} flowVariables={flowVariables} />
        ) : null}

        {type === 'condition' ? (
          <ConditionFields data={data} onChange={onChange} />
        ) : null}

        {type === 'transfer_human' ? (
          <>
            <div className="space-y-1.5">
              <Label>Destino</Label>
              <Select
                value={String(data.mode || 'none')}
                onValueChange={(v) =>
                  onChange({
                    mode: v,
                    user_id: v === 'user' ? data.user_id : null,
                    team_id: v === 'team' ? data.team_id : null,
                    queue_id: v === 'queue' ? data.queue_id ?? null : null,
                    assignee_label: undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Qualquer atendente (fila geral)</SelectItem>
                  <SelectItem value="user">Agente específico</SelectItem>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="queue">Fila</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {String(data.mode) === 'user' ? (
              <OptionSelect
                label="Agente"
                value={String(data.user_id || '')}
                placeholder="Selecione o agente"
                options={opts.agentOptions}
                loading={opts.loading}
                onValueChange={(user_id) => {
                  const found = opts.agentOptions.find((o) => o.value === user_id);
                  onChange({ user_id, assignee_label: found?.label });
                }}
              />
            ) : null}
            {String(data.mode) === 'team' ? (
              <OptionSelect
                label="Equipe"
                value={String(data.team_id || '')}
                placeholder="Selecione a equipe"
                options={opts.teamOptions}
                loading={opts.loading}
                onValueChange={(team_id) => {
                  const found = opts.teamOptions.find((o) => o.value === team_id);
                  onChange({ team_id, assignee_label: found?.label });
                }}
              />
            ) : null}
            {String(data.mode) === 'queue' ? (
              <OptionSelect
                label="Fila"
                value={String(data.queue_id || '')}
                placeholder="Selecione a fila"
                options={opts.queueOptions}
                loading={opts.loading}
                allowEmpty
                emptyLabel="Sem fila específica"
                onValueChange={(queue_id) => {
                  const found = opts.queueOptions.find((o) => o.value === queue_id);
                  onChange({
                    queue_id: queue_id || null,
                    assignee_label: found?.label || 'Sem fila',
                  });
                }}
              />
            ) : null}
            <VariableTextField
              id="hm"
              label="Mensagem ao transferir (opcional)"
              rows={3}
              value={String(data.message || '')}
              onChange={(message) => onChange({ message })}
            flowVariables={flowVariables}
              placeholder="Vou te passar para um atendente…"
            />
            <p className="text-[11px] text-muted-foreground">
              {String(data.mode || 'none') === 'user'
                ? 'O chat será atrelado ao agente (in_progress) e o bot encerra.'
                : String(data.mode) === 'team' || String(data.mode) === 'queue'
                  ? 'O chat vai para a equipe/fila em pending; um humano assume depois.'
                  : 'Fila geral: fica pending sem agente. Para atrelar a alguém, escolha Agente específico.'}
            </p>
          </>
        ) : null}

        {type === 'end' ? (
          <p className="text-sm text-muted-foreground">
            Encerra só a sessão do bot (não fecha o atendimento no chat).
          </p>
        ) : null}

        {type === 'sticky_note' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Só no quadro branco — não é enviada ao WhatsApp nem vira nota CRM.
              Dê dois cliques na nota para editar o texto.
            </p>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {STICKY_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    className={cn(
                      'h-7 w-7 rounded-md border-2',
                      data.color === c.id ? 'border-foreground' : 'border-transparent'
                    )}
                    style={{ background: c.bg }}
                    onClick={() => onChange({ color: c.id })}
                  />
                ))}
              </div>
            </div>
            <VariableTextField
              id="sticky-text"
              label="Texto"
              rows={5}
              value={String(data.text || '')}
              onChange={(text) => onChange({ text })}
              flowVariables={[]}
              placeholder="Escreva a anotação…"
            />
          </>
        ) : null}

        {type === 'annotation_arrow' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Seta livre no quadro. Arraste as pontas para ajustar.
            </p>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {ARROW_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    className={cn(
                      'h-7 w-7 rounded-md border-2',
                      data.color === c.id ? 'border-foreground' : 'border-transparent'
                    )}
                    style={{ background: c.stroke }}
                    onClick={() => onChange({ color: c.id })}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="arrow-label">Rótulo (opcional)</Label>
              <Input
                id="arrow-label"
                value={String(data.text || '')}
                onChange={(e) => onChange({ text: e.target.value })}
                placeholder="Ex.: próximo passo"
              />
            </div>
          </>
        ) : null}

        {type === 'annotation_text' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Texto livre no quadro. Dois cliques para editar.
            </p>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={c.label}
                    aria-label={c.label}
                    className={cn(
                      'h-7 w-7 rounded-md border-2',
                      data.color === c.id ? 'border-foreground' : 'border-transparent'
                    )}
                    style={{ background: c.fill }}
                    onClick={() => onChange({ color: c.id })}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="annot-font">Tamanho</Label>
              <Input
                id="annot-font"
                type="number"
                min={12}
                max={72}
                value={Number(data.fontSize) || 20}
                onChange={(e) => onChange({ fontSize: Number(e.target.value) || 20 })}
              />
            </div>
            <VariableTextField
              id="annot-text"
              label="Texto"
              rows={4}
              value={String(data.text || '')}
              onChange={(text) => onChange({ text })}
              flowVariables={[]}
              placeholder="Escreva…"
            />
          </>
        ) : null}

        {type === 'conversation_note' ? (
          <>
            <VariableTextField
              id="note-text"
              label="Texto da nota"
              rows={5}
              value={String(data.text || '')}
              onChange={(text) => onChange({ text })}
              flowVariables={flowVariables}
              placeholder={'{{cpf}}\n{{resultado}}\n…'}
              hint="Nota interna no CRM — não é enviada ao WhatsApp."
            />
          </>
        ) : null}

        {type === 'ensure_conversation' ? (
          <>
            <VariableTextField
              id="ensure-phone"
              label="Telefone"
              multiline={false}
              value={String(data.phone || '')}
              onChange={(phone) => {
                const normalizeBr = data.normalize_br !== false;
                const preview = phone.includes('{{')
                  ? ''
                  : previewNormalizePhoneBr(phone, normalizeBr);
                onChange({
                  phone,
                  last_normalized_preview: preview || null,
                });
              }}
              flowVariables={flowVariables}
              placeholder="{{order.phone}} ou 11999998888"
              inputClassName="font-mono text-xs"
            />
            <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
              <div>
                <Label htmlFor="ensure-normalize" className="text-sm font-medium">
                  Normalizar BR (E.164 / 55)
                </Label>
                <p className="text-[10px] text-muted-foreground">
                  Prefixa 55 em números 10–11 dígitos.
                </p>
              </div>
              <Switch
                id="ensure-normalize"
                checked={data.normalize_br !== false}
                onCheckedChange={(checked) => {
                  const phone = String(data.phone || '');
                  const preview = phone.includes('{{')
                    ? ''
                    : previewNormalizePhoneBr(phone, checked);
                  onChange({
                    normalize_br: checked,
                    last_normalized_preview: preview || null,
                  });
                }}
              />
            </div>
            {String(data.last_normalized_preview || '').trim() ? (
              <p className="rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                Vai abrir/reusar conversa com{' '}
                <span className="font-mono text-foreground">
                  {String(data.last_normalized_preview)}
                </span>
              </p>
            ) : String(data.phone || '').includes('{{') ? (
              <p className="text-[11px] text-muted-foreground">
                Preview ao vivo quando o valor for literal (sem {'{{var}}'}).
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="ensure-instance">Instância (UUID, opcional)</Label>
              <Input
                id="ensure-instance"
                className="font-mono text-xs"
                placeholder="vazio = herdar start / padrão do tenant"
                value={data.instance_id != null ? String(data.instance_id) : ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  onChange({ instance_id: v || null });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Política de reuso</Label>
              <Select
                value={String(data.reuse_policy || 'open')}
                onValueChange={(reuse_policy) => onChange({ reuse_policy })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Reutilizar aberta (telefone + instância)</SelectItem>
                  <SelectItem value="any">Reutilizar qualquer (mesmo telefone)</SelectItem>
                  <SelectItem value="always_create">Sempre criar nova</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <VariableTextField
              id="ensure-idem"
              label="Chave de idempotência (opcional)"
              multiline={false}
              value={String(data.idempotency_key || '')}
              onChange={(idempotency_key) => onChange({ idempotency_key })}
              flowVariables={flowVariables}
              placeholder="{{order.id}}"
              inputClassName="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Amarras a sessão órfã (webhook sem conversa) a um chat 1:1 (DM-only). Saídas:{' '}
              <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-rose-600">erro</span> (telefone inválido / grupo / sem
              instância / desconectada). Com chave de idempotência, reenvio Woo do mesmo pedido
              reusa a mesma conversa (não abre N chats). Se já estiver em atendimento humano, o
              bot pausa.
            </p>
          </>
        ) : null}

        {type === 'resolve_conversation' ? (
          <>
            <VariableTextField
              id="resolve-msg"
              label="Mensagem ao contato (opcional)"
              rows={3}
              value={String(data.message || '')}
              onChange={(message) => onChange({ message })}
              flowVariables={flowVariables}
              placeholder="Atendimento encerrado. Obrigado!"
            />
            <div className="flex items-center gap-2 pt-1">
              <input
                id="resolve-close"
                type="checkbox"
                className="h-4 w-4"
                checked={data.close_attendance !== false}
                onChange={(e) => onChange({ close_attendance: e.target.checked })}
              />
              <Label htmlFor="resolve-close" className="font-normal">
                Fechar atendimento no chat
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Diferente de <strong>Fim</strong>: também marca a conversa como encerrada
              (`closed`) para o time.
            </p>
          </>
        ) : null}

        {type === 'set_variable' ? (
          <SetVariableFields data={data} onChange={onChange} flowVariables={flowVariables} />
        ) : null}

        {type === 'add_tag' ? (
          <>
            <OptionSelect
              label="Tag do Kanban"
              value={String(data.tag_id || '')}
              placeholder="Selecione uma tag"
              options={opts.tagOptions}
              loading={opts.loading}
              onValueChange={(tagId) => {
                const found = opts.tagOptions.find((o) => o.value === tagId);
                onChange({
                  tag_id: tagId || undefined,
                  tag_label: found?.label || '',
                });
              }}
            />
            <div className="space-y-1.5">
              <Label htmlFor="newtag">Ou criar pelo nome</Label>
              <Input
                id="newtag"
                value={data.tag_id ? '' : String(data.tag_label || '')}
                onChange={(e) =>
                  onChange({ tag_label: e.target.value, tag_id: undefined })
                }
                placeholder="Ex.: lead-quente"
                disabled={Boolean(data.tag_id)}
              />
              {data.tag_id ? (
                <button
                  type="button"
                  className="text-[11px] text-primary underline"
                  onClick={() => onChange({ tag_id: undefined, tag_label: '' })}
                >
                  Limpar seleção e digitar nova
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {type === 'assign_agent' ? (
          <>
            <div className="space-y-1.5">
              <Label>Atribuir para</Label>
              <Select
                value={String(data.mode || 'queue')}
                onValueChange={(v) =>
                  onChange({
                    mode: v,
                    user_id: undefined,
                    team_id: undefined,
                    queue_id: v === 'queue' ? data.queue_id : undefined,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Agente</SelectItem>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="queue">Fila</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {String(data.mode) === 'user' ? (
              <OptionSelect
                label="Agente"
                value={String(data.user_id || '')}
                placeholder="Selecione o agente"
                options={opts.agentOptions}
                loading={opts.loading}
                onValueChange={(user_id) => {
                  const found = opts.agentOptions.find((o) => o.value === user_id);
                  onChange({ user_id, assignee_label: found?.label });
                }}
              />
            ) : null}
            {String(data.mode) === 'team' ? (
              <OptionSelect
                label="Equipe"
                value={String(data.team_id || '')}
                placeholder="Selecione a equipe"
                options={opts.teamOptions}
                loading={opts.loading}
                onValueChange={(team_id) => {
                  const found = opts.teamOptions.find((o) => o.value === team_id);
                  onChange({ team_id, assignee_label: found?.label });
                }}
              />
            ) : null}
            {String(data.mode || 'queue') === 'queue' ? (
              <OptionSelect
                label="Fila"
                value={String(data.queue_id || '')}
                placeholder="Selecione a fila"
                options={opts.queueOptions}
                loading={opts.loading}
                allowEmpty
                emptyLabel="Sem fila específica"
                onValueChange={(queue_id) => {
                  const found = opts.queueOptions.find((o) => o.value === queue_id);
                  onChange({
                    queue_id: queue_id || null,
                    assignee_label: found?.label || 'Sem fila',
                  });
                }}
              />
            ) : null}
          </>
        ) : null}

        {type === 'move_kanban' || type === 'kanban_add_card' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Vincula a <strong>conversa</strong> ao board: se o card ainda não existir, cria;
              se já existir, move para a coluna. O rótulo visual do card segue o contato;
              título opcional vai em metadata.
            </p>
            <OptionSelect
              label="Kanban (board)"
              value={inferredBoardId}
              placeholder="Selecione o board"
              options={opts.boardOptions}
              loading={opts.loading}
              onValueChange={(board_id) => {
                const board = opts.boardOptions.find((o) => o.value === board_id);
                onChange({
                  board_id,
                  board_label: board?.label,
                  column_id: '',
                  column_label: '',
                });
              }}
            />
            <OptionSelect
              label="Coluna"
              value={String(data.column_id || '')}
              placeholder={inferredBoardId ? 'Selecione a coluna' : 'Escolha o board primeiro'}
              options={columnsForBoard}
              loading={opts.loading}
              disabled={!inferredBoardId}
              onValueChange={(column_id) => {
                const col = columnsForBoard.find((o) => o.value === column_id);
                const board = opts.boardOptions.find((o) => o.value === inferredBoardId);
                onChange({
                  board_id: inferredBoardId || undefined,
                  board_label: board?.label,
                  column_id,
                  column_label: col
                    ? `${board?.label || 'Board'} → ${col.label}`
                    : undefined,
                });
              }}
            />
            <VariableTextField
              id="kanban-title"
              label="Título (metadata, opcional)"
              multiline={false}
              value={String(data.title || '')}
              onChange={(title) => onChange({ title })}
              flowVariables={flowVariables}
              placeholder="{{contact.name}} — lead"
            />
            <VariableTextField
              id="kanban-desc"
              label="Descrição (opcional)"
              rows={3}
              value={String(data.description || '')}
              onChange={(description) => onChange({ description })}
              flowVariables={flowVariables}
              placeholder="Contexto do bot…"
            />
            <OptionSelect
              label="Tag (opcional)"
              value={String(data.tag_id || '')}
              placeholder="Nenhuma"
              options={opts.tagOptions}
              loading={opts.loading}
              allowEmpty
              emptyLabel="Nenhuma"
              onValueChange={(tag_id) => {
                const found = opts.tagOptions.find((o) => o.value === tag_id);
                onChange({
                  tag_id: tag_id || undefined,
                  tag_label: found?.label || '',
                });
              }}
            />
          </>
        ) : null}

        {type === 'invoice_assist' ? (
          <>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select
                value={String(data.mode || 'open_menu')}
                onValueChange={(v) => onChange({ mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_open">Última aberta → envia link</SelectItem>
                  <SelectItem value="open_menu">Menu → espera escolha → link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {String(data.mode || 'open_menu') === 'open_menu' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="ia-limit">Máximo no menu</Label>
                  <Input
                    id="ia-limit"
                    type="number"
                    min={1}
                    max={20}
                    value={Number(data.limit) || 8}
                    onChange={(e) => onChange({ limit: Number(e.target.value) || 8 })}
                  />
                </div>
                <VariableTextField
                  id="ia-prompt"
                  label="Mensagem com a lista"
                  rows={5}
                  value={String(
                    data.prompt_template ||
                      'Estas são suas faturas em aberto:\n{{invoice.menu}}\n\nResponda com o número da opção desejada.'
                  )}
                  onChange={(prompt_template) => onChange({ prompt_template })}
            flowVariables={flowVariables}
                  hint="Use {{invoice.menu}} para a lista numerada."
                />
                <VariableTextField
                  id="ia-invalid"
                  label="Se a opção for inválida"
                  rows={2}
                  value={String(
                    data.invalid_message ||
                      'Opção inválida. Digite o número de uma das faturas da lista.'
                  )}
                  onChange={(invalid_message) => onChange({ invalid_message })}
            flowVariables={flowVariables}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="ia-max">Tentativas antes de saída inválida</Label>
                  <Input
                    id="ia-max"
                    type="number"
                    min={1}
                    max={10}
                    value={Number(data.max_invalid) || 3}
                    onChange={(e) => onChange({ max_invalid: Number(e.target.value) || 3 })}
                  />
                </div>
              </>
            ) : null}
            <VariableTextField
              id="ia-link"
              label="Mensagem com o link"
              rows={3}
              value={String(
                data.link_template ||
                  'Segue o link da fatura {{invoice.number}} ({{invoice.total}}):\n{{invoice.public_link}}'
              )}
              onChange={(link_template) => onChange({ link_template })}
            flowVariables={flowVariables}
            />
            <VariableTextField
              id="ia-empty"
              label="Mensagem se não houver fatura (opcional)"
              rows={2}
              value={String(data.empty_message || '')}
              onChange={(empty_message) => onChange({ empty_message })}
            flowVariables={flowVariables}
              placeholder="Não encontrei faturas em aberto."
            />
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-amber-600">vazia</span> /{' '}
              <span className="text-rose-600">inválida</span> (só no modo menu, após tentativas).
            </p>
          </>
        ) : null}

        {type === 'ticket_assist' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Fluxo automático: categoria (botões se ≤3) → assunto → descrição → cria ticket e envia
              o link público <code className="text-[10px]">/ticket/…</code>. A conversa precisa ter{' '}
              <strong>cliente vinculado</strong> (quando a opção abaixo estiver ligada).
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="ta-require-client"
                checked={data.require_client !== false}
                onCheckedChange={(v) => onChange({ require_client: v })}
              />
              <Label htmlFor="ta-require-client" className="font-normal text-sm">
                Exigir cliente vinculado
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select
                value={String(data.priority || 'normal')}
                onValueChange={(v) => onChange({ priority: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <VariableTextField
              id="ta-intro"
              label="Introdução (opcional)"
              rows={2}
              value={String(data.intro_message || '')}
              onChange={(intro_message) => onChange({ intro_message })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-cat"
              label="Pedido de categoria"
              rows={4}
              value={String(
                data.category_prompt ||
                  'Escolha a categoria do chamado:\n{{ticket.menu}}\n\nResponda com o número da opção.'
              )}
              onChange={(category_prompt) => onChange({ category_prompt })}
              flowVariables={flowVariables}
              hint="Use {{ticket.menu}} quando houver mais de 3 categorias (lista numerada)."
            />
            <VariableTextField
              id="ta-subj"
              label="Pergunta do assunto"
              rows={2}
              value={String(data.subject_prompt || 'Qual o assunto do chamado?')}
              onChange={(subject_prompt) => onChange({ subject_prompt })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-desc"
              label="Pergunta da descrição"
              rows={2}
              value={String(data.description_prompt || 'Descreva o problema com detalhes:')}
              onChange={(description_prompt) => onChange({ description_prompt })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-ok"
              label="Mensagem de sucesso"
              rows={4}
              value={String(
                data.success_template ||
                  'Chamado aberto com sucesso!\nNúmero: {{ticket.number}}\nAssunto: {{ticket.subject}}\nAcompanhe aqui: {{ticket.public_url}}'
              )}
              onChange={(success_template) => onChange({ success_template })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-empty-client"
              label="Sem cliente vinculado"
              rows={2}
              value={String(
                data.empty_client_message ||
                  'Para abrir um chamado, vincule um cliente a esta conversa e tente novamente.'
              )}
              onChange={(empty_client_message) => onChange({ empty_client_message })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-empty-cat"
              label="Sem categorias"
              rows={2}
              value={String(
                data.empty_categories_message ||
                  'Não há categorias de chamado cadastradas. Peça ao atendimento para configurar.'
              )}
              onChange={(empty_categories_message) => onChange({ empty_categories_message })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="ta-invalid"
              label="Categoria inválida"
              rows={2}
              value={String(
                data.invalid_message || 'Opção inválida. Escolha uma categoria da lista.'
              )}
              onChange={(invalid_message) => onChange({ invalid_message })}
              flowVariables={flowVariables}
            />
            <div className="space-y-1.5">
              <Label htmlFor="ta-max">Tentativas antes de saída inválida</Label>
              <Input
                id="ta-max"
                type="number"
                min={1}
                max={10}
                value={Number(data.max_invalid) || 3}
                onChange={(e) => onChange({ max_invalid: Number(e.target.value) || 3 })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-amber-600">vazia</span> /{' '}
              <span className="text-rose-600">inválida</span>
            </p>
          </>
        ) : null}

        {type === 'ticket_lookup_assist' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Lista chamados do cliente vinculado, envia o link público{' '}
              <code className="text-[10px]">/ticket/…</code>.
            </p>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select
                value={String(data.mode || 'open_menu')}
                onValueChange={(v) => onChange({ mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_open">Último aberto → envia link</SelectItem>
                  <SelectItem value="open_menu">Menu → espera escolha → link</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="tla-closed"
                checked={data.include_closed === true}
                onCheckedChange={(v) => onChange({ include_closed: v })}
              />
              <Label htmlFor="tla-closed" className="font-normal text-sm">
                Incluir chamados fechados
              </Label>
            </div>
            {String(data.mode || 'open_menu') === 'open_menu' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="tla-limit">Máximo no menu</Label>
                  <Input
                    id="tla-limit"
                    type="number"
                    min={1}
                    max={20}
                    value={Number(data.limit) || 8}
                    onChange={(e) => onChange({ limit: Number(e.target.value) || 8 })}
                  />
                </div>
                <VariableTextField
                  id="tla-prompt"
                  label="Mensagem com a lista"
                  rows={5}
                  value={String(
                    data.prompt_template ||
                      'Seus chamados em aberto:\n{{ticket.menu}}\n\nResponda com o número da opção desejada.'
                  )}
                  onChange={(prompt_template) => onChange({ prompt_template })}
                  flowVariables={flowVariables}
                  hint="Use {{ticket.menu}} para a lista numerada. Com ≤3 itens, o bot envia botões."
                />
                <VariableTextField
                  id="tla-invalid"
                  label="Se a opção for inválida"
                  rows={2}
                  value={String(
                    data.invalid_message ||
                      'Opção inválida. Digite o número de um dos chamados da lista.'
                  )}
                  onChange={(invalid_message) => onChange({ invalid_message })}
                  flowVariables={flowVariables}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="tla-max">Tentativas antes de saída inválida</Label>
                  <Input
                    id="tla-max"
                    type="number"
                    min={1}
                    max={10}
                    value={Number(data.max_invalid) || 3}
                    onChange={(e) => onChange({ max_invalid: Number(e.target.value) || 3 })}
                  />
                </div>
              </>
            ) : null}
            <VariableTextField
              id="tla-link"
              label="Mensagem com o link"
              rows={3}
              value={String(
                data.link_template ||
                  'Chamado {{ticket.number}} — {{ticket.subject}}\nAcompanhe: {{ticket.public_url}}'
              )}
              onChange={(link_template) => onChange({ link_template })}
              flowVariables={flowVariables}
            />
            <VariableTextField
              id="tla-empty"
              label="Mensagem se não houver chamado"
              rows={2}
              value={String(
                data.empty_message || 'Não encontrei chamados em aberto para este cliente.'
              )}
              onChange={(empty_message) => onChange({ empty_message })}
              flowVariables={flowVariables}
            />
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-amber-600">vazia</span> /{' '}
              <span className="text-rose-600">inválida</span> (só no modo menu, após tentativas).
            </p>
          </>
        ) : null}

        {type === 'crm_link_check' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Classifica o contato da conversa e segue por uma das saídas:{' '}
              <span className="text-emerald-600">cliente</span>,{' '}
              <span className="text-sky-600">lead</span> ou{' '}
              <span className="text-amber-700">sem vínculo</span>. Prioridade: cliente &gt; lead.
            </p>
            <div className="flex items-center gap-2">
              <Switch
                id="crm-refresh"
                checked={data.refresh_client_match !== false}
                onCheckedChange={(v) => onChange({ refresh_client_match: v })}
              />
              <Label htmlFor="crm-refresh" className="font-normal text-sm">
                Tentar vincular cliente pelo telefone antes de classificar
              </Label>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Preenche <code className="text-[10px]">{'{{crm.link_kind}}'}</code>,{' '}
              <code className="text-[10px]">{'{{client.id}}'}</code> /{' '}
              <code className="text-[10px]">{'{{lead.id}}'}</code> quando houver.
            </p>
          </>
        ) : null}

        {type === 'crm_convert' ? (
          <>
            <p className="text-[11px] text-muted-foreground">
              Garante lead ou cliente na conversa (cria ou vincula). Fail-closed na saída{' '}
              <span className="text-rose-600">erro</span>.
            </p>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select
                value={String(data.mode || 'to_lead')}
                onValueChange={(v) => onChange({ mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="to_lead">Converter → lead</SelectItem>
                  <SelectItem value="to_client">Converter → cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem de erro (opcional)</Label>
              <Textarea
                rows={2}
                value={String(data.error_message || '')}
                onChange={(e) => onChange({ error_message: e.target.value })}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {String(data.mode || 'to_lead') === 'to_client' ? (
                <>
                  Saídas: <span className="text-emerald-600">ok</span> /{' '}
                  <span className="text-rose-600">erro</span>
                </>
              ) : (
                <>
                  Saídas: <span className="text-emerald-600">ok</span> /{' '}
                  <span className="text-sky-600">já cliente</span> /{' '}
                  <span className="text-rose-600">erro</span>
                </>
              )}
              . Vars: <code className="text-[10px]">{'{{crm.convert_result}}'}</code>,{' '}
              <code className="text-[10px]">{'{{crm.link_kind}}'}</code>.
            </p>
          </>
        ) : null}

        {type === 'lookup_invoice' ? (
          <>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select
                value={String(data.mode || 'last_open')}
                onValueChange={(v) => onChange({ mode: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="last_open">Última fatura em aberto</SelectItem>
                  <SelectItem value="open_menu">Menu de faturas em aberto</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {String(data.mode || 'last_open') === 'open_menu'
                  ? 'Preenche {{invoice.menu}} e invoice._items. Depois use Pergunta + Escolher fatura.'
                  : 'Preenche {{invoice.public_link}}, {{invoice.number}}, {{invoice.total}}, etc.'}
              </p>
            </div>
            {String(data.mode) === 'open_menu' ? (
              <div className="space-y-1.5">
                <Label htmlFor="inv-limit">Máximo no menu</Label>
                <Input
                  id="inv-limit"
                  type="number"
                  min={1}
                  max={20}
                  value={Number(data.limit) || 8}
                  onChange={(e) => onChange({ limit: Number(e.target.value) || 8 })}
                />
              </div>
            ) : null}
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">achou</span> /{' '}
              <span className="text-rose-600">vazia</span>. Requer cliente vinculado à conversa
              (ou telefone igual ao cadastro).
            </p>
          </>
        ) : null}

        {type === 'select_invoice' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="sel-var">Variável com a opção</Label>
              <Input
                id="sel-var"
                value={String(data.variable || 'answer')}
                onChange={(e) => onChange({ variable: e.target.value })}
                placeholder="answer"
              />
              <p className="text-[11px] text-muted-foreground">
                Lê o número digitado (1, 2…) no menu de{' '}
                <code className="text-[10px]">Consultar fatura → menu</code> e preenche{' '}
                <code className="text-[10px]">{'{{invoice.public_link}}'}</code>.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-rose-600">inválida</span>.
            </p>
          </>
        ) : null}

        {type === 'delay' ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="amt">Quantidade</Label>
              <Input
                id="amt"
                type="number"
                min={1}
                value={Number(data.amount) || 1}
                onChange={(e) => onChange({ amount: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Select
                value={String(data.unit || 'minutes')}
                onValueChange={(v) => onChange({ unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        ) : null}

        {type === 'http_request' ? (
          <>
            <HttpMethodTags
              value={String(data.method || 'GET')}
              onChange={(method) => onChange({ method })}
              fallback="GET"
            />
            <VariableTextField
              id="http-url"
              label="URL"
              multiline={false}
              value={String(data.url || '')}
              onChange={(url) => onChange({ url })}
            flowVariables={flowVariables}
              placeholder="https://api.exemplo.com/{{answer}}"
              inputClassName="font-mono text-xs"
            />
            <HeadersJsonFieldsEditor
              headers={data.headers}
              uiMode={String(data.headers_ui || 'fields')}
              onHeadersChange={(headers) => onChange({ headers })}
              onUiModeChange={(headers_ui) => onChange({ headers_ui })}
              flowVariables={flowVariables}
              hint="Secrets (Authorization, token…) são removidos no export."
            />
            {String(data.method || 'GET') !== 'GET' ? (
              <BodyJsonFieldsEditor
                body={String(data.body || '')}
                uiMode={String(data.body_ui || 'fields')}
                onBodyChange={(body) => onChange({ body })}
                onUiModeChange={(body_ui) => onChange({ body_ui })}
                flowVariables={flowVariables}
              />
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="http-timeout">Timeout (ms)</Label>
              <Input
                id="http-timeout"
                type="number"
                min={500}
                max={30000}
                value={Number(data.timeout_ms) || 10000}
                onChange={(e) => onChange({ timeout_ms: Number(e.target.value) || 10000 })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="http-status-var">Variável do status HTTP</Label>
              <Input
                id="http-status-var"
                value={String(data.status_variable || '')}
                onChange={(e) => onChange({ status_variable: e.target.value })}
                placeholder="http_status"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="http-body-var">Variável do body</Label>
              <Input
                id="http-body-var"
                value={String(data.response_variable || '')}
                onChange={(e) => onChange({ response_variable: e.target.value })}
                placeholder="http_body"
              />
            </div>
            <HttpIntegrationTestSection kind="http_request" data={data} onChange={onChange} />
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> (2xx) e{' '}
              <span className="text-rose-600">erro</span> (4xx/5xx/timeout/rede). Variáveis
              mapeadas ficam disponíveis nos dois caminhos.
            </p>
          </>
        ) : null}

        {type === 'webhook_out' ? (
          <>
            <HttpMethodTags
              value={String(data.method || 'POST')}
              onChange={(method) => onChange({ method })}
              fallback="POST"
            />
            <VariableTextField
              id="wh-url"
              label="URL do webhook"
              multiline={false}
              value={String(data.url || '')}
              onChange={(url) => onChange({ url })}
            flowVariables={flowVariables}
              placeholder="https://webhook.site/…"
              inputClassName="font-mono text-xs"
            />
            <HeadersJsonFieldsEditor
              headers={data.headers}
              uiMode={String(data.headers_ui || 'fields')}
              onHeadersChange={(headers) => onChange({ headers })}
              onUiModeChange={(headers_ui) => onChange({ headers_ui })}
              flowVariables={flowVariables}
              hint="Secrets (Authorization, token…) são removidos no export."
            />
            <div className="space-y-1.5">
              <Label>Formato do payload</Label>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Formato do payload">
                {(
                  [
                    { id: 'envelope', label: 'Padrão' },
                    { id: 'envelope_plus', label: 'Padrão + data' },
                    { id: 'custom', label: 'Custom' },
                  ] as const
                ).map((opt) => {
                  const active = String(data.payload_mode || 'envelope') === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onChange({ payload_mode: opt.id })}
                      className={
                        active
                          ? 'rounded-md border border-stone-700 bg-stone-800 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm dark:border-stone-300 dark:bg-stone-200 dark:text-stone-900'
                          : 'rounded-md border border-stone-300 bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-200 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200'
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {String(data.payload_mode || 'envelope') === 'custom'
                  ? 'Envia só o JSON/texto do template (com {{variáveis}}).'
                  : String(data.payload_mode) === 'envelope_plus'
                    ? 'Envelope fixo + campo data montado pelo template.'
                    : 'event, tenant_id, conversation_id, sent_at e variables.'}
              </p>
            </div>
            {String(data.payload_mode || 'envelope') !== 'custom' ? (
              <div className="flex items-center gap-2 pt-1">
                <input
                  id="wh-vars"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={data.include_session_vars !== false}
                  onChange={(e) => onChange({ include_session_vars: e.target.checked })}
                />
                <Label htmlFor="wh-vars" className="font-normal">
                  Incluir variáveis da sessão no envelope
                </Label>
              </div>
            ) : null}
            {String(data.method || 'POST') !== 'GET' &&
            String(data.payload_mode || 'envelope') !== 'envelope' ? (
              <BodyJsonFieldsEditor
                body={String(data.body_template || '')}
                uiMode={String(data.body_ui || 'fields')}
                onBodyChange={(body_template) => onChange({ body_template })}
                onUiModeChange={(body_ui) => onChange({ body_ui })}
                flowVariables={flowVariables}
                label={
                  String(data.payload_mode) === 'envelope_plus'
                    ? 'JSON do campo data'
                    : 'Body custom'
                }
                hint="Use {{variável}} para interpolar valores da sessão."
              />
            ) : null}
            {String(data.method || 'POST') === 'GET' ? (
              <p className="text-[11px] text-muted-foreground">
                GET não envia body — o payload_mode custom/plus é ignorado neste método.
              </p>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">Secret (HMAC, opcional)</Label>
              <Input
                id="wh-secret"
                type="password"
                value={String(data.secret || '')}
                onChange={(e) => onChange({ secret: e.target.value })}
                placeholder="Não exportado"
                autoComplete="off"
              />
              <p className="text-[11px] text-muted-foreground">
                Assina o body em <code>X-PainelCRM-Signature</code>. Removido no export.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-timeout">Timeout (ms)</Label>
              <Input
                id="wh-timeout"
                type="number"
                min={500}
                max={30000}
                value={Number(data.timeout_ms) || 10000}
                onChange={(e) => onChange({ timeout_ms: Number(e.target.value) || 10000 })}
              />
            </div>
            <HttpIntegrationTestSection kind="webhook_out" data={data} onChange={onChange} />
            <p className="text-[11px] text-muted-foreground">
              Saídas: <span className="text-emerald-600">ok</span> /{' '}
              <span className="text-rose-600">erro</span>.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SetVariableFields({
  data,
  onChange,
  flowVariables = [],
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  flowVariables?: FlowDefinedVariable[];
}) {
  const rows = readSetVariableAssignments(data, { forEditor: true });

  const setRows = (next: Array<{ name: string; value: string }>) => {
    onChange({
      assignments: next,
      variable: undefined,
      value: undefined,
      name: undefined,
    });
  };

  return (
    <>
      <p className="text-[11px] text-muted-foreground">
        Defina uma ou mais variáveis da sessão. Nomes com ponto são permitidos (ex.:{' '}
        <code className="text-[10px]">lead.origem</code>). Valores aceitam{' '}
        <code className="text-[10px]">{'{{outra_var}}'}</code>.
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Atribuições</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={rows.length >= 20}
            onClick={() => setRows([...rows, { name: '', value: '' }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Variável
          </Button>
        </div>
        {rows.map((row, index) => (
          <div key={`svar-${index}`} className="space-y-1.5 rounded-lg border p-2.5">
            <div className="flex items-start gap-1.5">
              <div className="grid min-w-0 flex-1 gap-1.5">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nome</Label>
                  <Input
                    className="font-mono text-xs"
                    value={row.name}
                    placeholder="lead.origem"
                    onChange={(e) => {
                      const next = rows.map((r, i) =>
                        i === index ? { ...r, name: e.target.value } : r
                      );
                      setRows(next);
                    }}
                  />
                </div>
                <VariableTextField
                  id={`svar-val-${index}`}
                  label="Valor"
                  multiline={false}
                  value={row.value}
                  onChange={(value) => {
                    const next = rows.map((r, i) => (i === index ? { ...r, value } : r));
                    setRows(next);
                  }}
                  flowVariables={flowVariables}
                  placeholder="Texto ou {{outra_var}}"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mt-5 h-8 w-8 shrink-0 text-destructive"
                disabled={rows.length <= 1}
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                aria-label="Remover variável"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function resolvePublicWebhookUrl(token: string): string {
  const path = buildInboundWebhookPath(token);
  const env = String(import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (env) return `${env}${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return path;
}

function uniquePayloadMapVar(base: string, existing: Array<{ path: string; variable: string }>): string {
  const used = new Set(existing.map((r) => r.variable));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

function resolveListenIngestUrl(ingestUrl: string, ingestPath: string): string {
  if (/^https?:\/\//i.test(ingestUrl)) return ingestUrl;
  const env = String(import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (env) return `${env}${ingestPath}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${ingestPath}`;
  return ingestPath;
}

function WebhookInFields({
  data,
  onChange,
  flowId,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  flowId?: string | null;
}) {
  const token = String(data.token || '');
  const url = token ? resolvePublicWebhookUrl(token) : '';
  const mapRows = Array.isArray(data.payload_map)
    ? (data.payload_map as Array<{ path: string; variable: string }>).map((r) => ({
        path: String(r?.path || ''),
        variable: String(r?.variable || ''),
      }))
    : [];
  const [sampleDraft, setSampleDraft] = useState(() => {
    if (data.last_payload_json != null) {
      try {
        return JSON.stringify(data.last_payload_json, null, 2);
      } catch {
        return '';
      }
    }
    return '';
  });
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [pickPath, setPickPath] = useState<string | null>(null);
  const [pickVar, setPickVar] = useState('');
  const [listening, setListening] = useState(false);
  const [listenUrl, setListenUrl] = useState<string | null>(null);
  const [listenError, setListenError] = useState<string | null>(null);
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleSyncError, setSampleSyncError] = useState<string | null>(null);
  const [sampleWatching, setSampleWatching] = useState(false);
  const sampleWatchAbortRef = useRef(false);
  const listenAbortRef = useRef<{ cancelled: boolean; listenId: string | null }>({
    cancelled: false,
    listenId: null,
  });

  const resolvePublicSampleUrl = (ingestUrl: string, ingestPath: string) => {
    if (ingestUrl.startsWith('http://') || ingestUrl.startsWith('https://')) return ingestUrl;
    if (typeof window !== 'undefined') return `${window.location.origin}${ingestPath}`;
    return ingestPath;
  };

  useEffect(() => {
    if (!flowId) {
      setSampleUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const state = await getWebhookInSample(flowId);
        if (cancelled) return;
        setSampleUrl(resolvePublicSampleUrl(state.ingestUrl, state.ingestPath));
        setSampleSyncError(null);
      } catch (e) {
        if (!cancelled) {
          setSampleSyncError(e instanceof Error ? e.message : 'Falha ao carregar URL de amostra');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [flowId]);

  useEffect(() => {
    return () => {
      listenAbortRef.current.cancelled = true;
      sampleWatchAbortRef.current = true;
      const lid = listenAbortRef.current.listenId;
      if (lid && flowId) {
        void cancelWebhookInListen(flowId, lid).catch(() => undefined);
      }
    };
  }, [flowId]);

  const sampleJson = (() => {
    if (data.last_payload_json != null) return data.last_payload_json;
    try {
      return sampleDraft.trim() ? JSON.parse(sampleDraft) : null;
    } catch {
      return null;
    }
  })();

  const previewMapped =
    sampleJson != null && mapRows.length
      ? applyHttpResponseMap({
          bodyJson: sampleJson,
          bodyText: '',
          status: 200,
          responseMap: mapRows.filter((r) => r.path && r.variable),
        })
      : {};

  const applyCapturedPayload = (payload: unknown, at?: string) => {
    onChange({
      last_payload_json: payload,
      last_payload_at: at || new Date().toISOString(),
    });
    try {
      setSampleDraft(JSON.stringify(payload, null, 2));
    } catch {
      setSampleDraft(String(payload ?? ''));
    }
    setSampleError(null);
  };

  const refreshSampleFromServer = async (opts?: { applyPayload?: boolean }) => {
    if (!flowId) return null;
    const state = await getWebhookInSample(flowId);
    setSampleUrl(resolvePublicSampleUrl(state.ingestUrl, state.ingestPath));
    if (opts?.applyPayload && state.payload != null) {
      applyCapturedPayload(state.payload, state.captured_at || undefined);
    }
    setSampleSyncError(null);
    return state;
  };

  const rotateSample = async () => {
    if (!flowId) {
      setSampleSyncError('Salve o flow antes de rotacionar.');
      return;
    }
    setSampleBusy(true);
    setSampleSyncError(null);
    try {
      const state = await rotateWebhookInSample(flowId);
      setSampleUrl(resolvePublicSampleUrl(state.ingestUrl, state.ingestPath));
    } catch (e) {
      setSampleSyncError(e instanceof Error ? e.message : 'Falha ao rotacionar');
    } finally {
      setSampleBusy(false);
    }
  };

  const startSampleWatch = async () => {
    if (!flowId) {
      setSampleSyncError('Salve o flow antes de aguardar POST.');
      return;
    }
    sampleWatchAbortRef.current = false;
    setSampleWatching(true);
    setSampleSyncError(null);
    const startedAt = data.last_payload_at != null ? String(data.last_payload_at) : '';
    const deadline = Date.now() + 120_000;
    try {
      while (!sampleWatchAbortRef.current && Date.now() < deadline) {
        const state = await getWebhookInSample(flowId);
        setSampleUrl(resolvePublicSampleUrl(state.ingestUrl, state.ingestPath));
        const at = state.captured_at ? String(state.captured_at) : '';
        if (state.payload != null && at && at !== startedAt) {
          applyCapturedPayload(state.payload, at);
          break;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!sampleWatchAbortRef.current && Date.now() >= deadline) {
        setSampleSyncError('Tempo esgotado. Reenvie o webhook ou clique em Aguardar de novo.');
      }
    } catch (e) {
      if (!sampleWatchAbortRef.current) {
        setSampleSyncError(e instanceof Error ? e.message : 'Falha ao aguardar sample');
      }
    } finally {
      setSampleWatching(false);
    }
  };

  const stopSampleWatch = () => {
    sampleWatchAbortRef.current = true;
    setSampleWatching(false);
  };

  const stopListen = async () => {
    listenAbortRef.current.cancelled = true;
    const lid = listenAbortRef.current.listenId;
    listenAbortRef.current.listenId = null;
    setListening(false);
    setListenUrl(null);
    if (lid && flowId) {
      try {
        await cancelWebhookInListen(flowId, lid);
      } catch {
        /* ignore */
      }
    }
  };

  const startListen = async () => {
    if (!flowId) {
      setListenError('Salve o flow antes de ouvir.');
      return;
    }
    setListenError(null);
    listenAbortRef.current = { cancelled: false, listenId: null };
    setListening(true);
    try {
      const started = await startWebhookInListen(flowId, { ttl_ms: 60_000 });
      if (listenAbortRef.current.cancelled) {
        await cancelWebhookInListen(flowId, started.listenId).catch(() => undefined);
        return;
      }
      listenAbortRef.current.listenId = started.listenId;
      const publicUrl = resolveListenIngestUrl(started.ingestUrl, started.ingestPath);
      setListenUrl(publicUrl);

      const deadline = Date.now() + (started.ttlMs || 60_000);
      while (!listenAbortRef.current.cancelled && Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const poll = await pollWebhookInListen(flowId, started.listenId, {
          wait_ms: Math.min(25_000, remaining),
        });
        if (listenAbortRef.current.cancelled) return;
        if (poll.status === 'received') {
          applyCapturedPayload(poll.payload, poll.received_at);
          listenAbortRef.current.listenId = null;
          setListening(false);
          setListenUrl(null);
          return;
        }
      }
      if (!listenAbortRef.current.cancelled) {
        setListenError('Tempo esgotado. Clique em Ouvir e envie o POST de novo.');
      }
    } catch (e) {
      if (!listenAbortRef.current.cancelled) {
        setListenError(e instanceof Error ? e.message : 'Falha no listen');
      }
    } finally {
      if (!listenAbortRef.current.cancelled) {
        setListening(false);
        setListenUrl(null);
        listenAbortRef.current.listenId = null;
      }
    }
  };

  const startPick = (path: string) => {
    const effective = path === 'body' ? '' : path;
    if (!effective) return;
    setPickPath(effective);
    setPickVar(uniquePayloadMapVar(suggestVarNameFromPath(effective), mapRows));
  };

  const confirmPick = () => {
    if (!pickPath) return;
    const variable = pickVar.trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)*$/.test(variable)) return;
    const next = [
      ...mapRows.filter((r) => r.path !== pickPath && r.variable !== variable),
      { path: pickPath, variable },
    ];
    onChange({ payload_map: next });
    setPickPath(null);
  };

  return (
    <>
      <div className="space-y-1.5 rounded-lg border border-border/60 bg-muted/20 p-3">
        <Label>URL de produção</Label>
        <div className="flex gap-1.5">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            title="Copiar URL de produção"
            disabled={!url}
            onClick={() => {
              void navigator.clipboard.writeText(url);
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            title="Rotacionar token de produção (invalida a URL antiga após republicar)"
            onClick={() => {
              onChange({ token: generateInboundWebhookToken() });
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Dispara o flow na versão <strong>publicada</strong>. POST com{' '}
          <code className="text-[10px]">{`{ "conversation_id": "…", … }`}</code>. Rotacionar
          o token só vale após republicar.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-dashed border-emerald-500/40 bg-emerald-500/5 p-3">
        <Label>URL de teste</Label>
        <div className="flex gap-1.5">
          <Input
            readOnly
            value={sampleUrl || (flowId ? 'Carregando…' : 'Salve o flow para gerar a URL')}
            className="font-mono text-[11px]"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            title="Copiar URL de teste"
            disabled={!sampleUrl}
            onClick={() => {
              if (sampleUrl) void navigator.clipboard.writeText(sampleUrl);
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            title="Rotacionar URL de teste"
            disabled={!flowId || sampleBusy}
            onClick={() => void rotateSample()}
          >
            <RefreshCw className={cn('h-4 w-4', sampleBusy && 'animate-spin')} />
          </Button>
        </div>
        <div className="flex gap-2">
          {sampleWatching ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={stopSampleWatch}
            >
              Parar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              className="flex-1"
              disabled={!flowId || !sampleUrl}
              onClick={() => void startSampleWatch()}
            >
              <Radio className="mr-1.5 h-3.5 w-3.5" />
              Ouvir
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            title="Aplica o último JSON recebido na URL de teste"
            disabled={!flowId || sampleBusy}
            onClick={() => {
              void (async () => {
                setSampleBusy(true);
                try {
                  await refreshSampleFromServer({ applyPayload: true });
                } catch (e) {
                  setSampleSyncError(
                    e instanceof Error ? e.message : 'Falha ao atualizar sample',
                  );
                } finally {
                  setSampleBusy(false);
                }
              })();
            }}
          >
            Último envio
          </Button>
        </div>
        {sampleWatching ? (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Aguardando POST na URL de amostra…
          </div>
        ) : null}
        {sampleSyncError ? <p className="text-[11px] text-rose-600">{sampleSyncError}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whin-secret">Secret HMAC (opcional)</Label>
        <Input
          id="whin-secret"
          type="password"
          value={String(data.secret || '')}
          onChange={(e) => onChange({ secret: e.target.value })}
          placeholder="Não exportado"
          autoComplete="off"
        />
        <p className="text-[11px] text-muted-foreground">
          Se preenchido, exige header <code>X-PainelCRM-Signature: sha256=…</code>
        </p>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <Label className="text-[11px]">Mapear payload → variáveis</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() =>
              onChange({
                payload_map: [...mapRows, { path: 'data.id', variable: 'ext_id' }],
              })
            }
          >
            <Plus className="mr-0.5 h-3 w-3" />
            Campo
          </Button>
        </div>
        {mapRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Nenhum ainda. Ouça/cole um JSON e clique num campo, ou adicione manualmente.
          </p>
        ) : (
          mapRows.map((row, i) => (
            <div key={`pm-${i}`} className="flex gap-1.5">
              <Input
                className="h-8 font-mono text-[11px]"
                value={row.path}
                placeholder="data.order.id"
                onChange={(e) => {
                  const next = [...mapRows];
                  next[i] = { ...row, path: e.target.value };
                  onChange({ payload_map: next });
                }}
              />
              <Input
                className="h-8 font-mono text-[11px]"
                value={row.variable}
                placeholder="order_id"
                onChange={(e) => {
                  const next = [...mapRows];
                  next[i] = { ...row, variable: e.target.value };
                  onChange({ payload_map: next });
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onChange({ payload_map: mapRows.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-dashed p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">Ouvir (avançado · 60s)</p>
            <p className="text-[11px] text-muted-foreground">
              URL temporária one-shot. Prefira a <strong>URL de amostra fixa</strong> acima para Woo.
            </p>
          </div>
          {listening ? (
            <Button type="button" size="sm" variant="outline" onClick={() => void stopListen()}>
              Parar
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void startListen()}
              disabled={!flowId}
            >
              <Radio className="mr-1.5 h-3.5 w-3.5" />
              Ouvir 60s
            </Button>
          )}
        </div>
        {listening ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Aguardando POST na URL temporária…
            </div>
            {listenUrl ? (
              <div className="flex gap-1.5">
                <Input readOnly value={listenUrl} className="font-mono text-[11px]" />
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="shrink-0"
                  title="Copiar URL temporária"
                  onClick={() => void navigator.clipboard.writeText(listenUrl)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {listenError ? <p className="text-[11px] text-rose-600">{listenError}</p> : null}
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <Label htmlFor="whin-sample">JSON de exemplo (colar ou ouvir)</Label>
        <Textarea
          id="whin-sample"
          rows={5}
          className="font-mono text-[11px]"
          value={sampleDraft}
          onChange={(e) => {
            setSampleDraft(e.target.value);
            setSampleError(null);
          }}
          placeholder={`{\n  "conversation_id": "…",\n  "order": { "id": "123" }\n}`}
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7"
            onClick={() => {
              try {
                const parsed = sampleDraft.trim() ? JSON.parse(sampleDraft) : null;
                applyCapturedPayload(parsed);
                if (parsed && typeof parsed === 'object') {
                  setSampleDraft(JSON.stringify(parsed, null, 2));
                }
              } catch {
                setSampleError('JSON inválido');
              }
            }}
          >
            Aplicar sample
          </Button>
          {data.last_payload_at ? (
            <span className="self-center text-[11px] text-muted-foreground">
              Capturado {new Date(String(data.last_payload_at)).toLocaleString()}
            </span>
          ) : null}
        </div>
        {sampleError ? <p className="text-[11px] text-rose-600">{sampleError}</p> : null}

        {sampleJson != null && typeof sampleJson === 'object' ? (
          <div className="space-y-1.5">
            <Label className="text-[11px]">Árvore — copie o valor ou fixe para mapear</Label>
            <HttpJsonSampleTree value={sampleJson} onPickPath={(p) => startPick(p)} />
            {pickPath != null ? (
              <div className="space-y-1.5 rounded-md border bg-background p-2">
                <p className="text-[11px]">
                  Mapear <code className="text-[10px]">{pickPath}</code>
                </p>
                <div className="flex gap-1.5">
                  <Input
                    className="h-8 font-mono text-xs"
                    value={pickVar}
                    onChange={(e) => setPickVar(e.target.value)}
                    placeholder="order_id"
                  />
                  <Button type="button" size="sm" className="h-8" onClick={confirmPick}>
                    Criar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => setPickPath(null)}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {Object.keys(previewMapped).length > 0 ? (
          <pre className="max-h-28 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px] whitespace-pre-wrap">
            {JSON.stringify(previewMapped, null, 2)}
          </pre>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Preview do map aparece quando houver sample + paths configurados.
          </p>
        )}
      </div>
    </>
  );
}

function newMenuOptionId(existing: MenuChoiceOption[]): string {
  let i = existing.length + 1;
  let id = `opt_${i}`;
  const used = new Set(existing.map((o) => o.id));
  while (used.has(id)) {
    i += 1;
    id = `opt_${i}`;
  }
  return id;
}

function mediaTypeFromMime(mime: string): 'image' | 'document' | 'audio' {
  const mt = String(mime || '').toLowerCase();
  if (mt.startsWith('image/')) return 'image';
  if (mt.startsWith('audio/')) return 'audio';
  return 'document';
}

function pickerAcceptForMediaType(mediaType: string): MediaPickerAccept {
  if (mediaType === 'image') return 'image';
  if (mediaType === 'document') return 'document';
  return 'any';
}

type EditorSendMessageItem = {
  id: string;
  send_mode: 'text' | 'media';
  text: string;
  media_url: string;
  media_asset_id: string;
  media_asset_label: string;
  media_type: 'image' | 'document' | 'audio';
  caption: string;
  filename: string;
  delay_after?: { amount: number; unit: 'seconds' | 'minutes' | 'hours' };
};

function newSendMessageItemId(existing: EditorSendMessageItem[]): string {
  let i = existing.length + 1;
  let id = `msg_${i}`;
  const used = new Set(existing.map((o) => o.id));
  while (used.has(id)) {
    i += 1;
    id = `msg_${i}`;
  }
  return id;
}

function SendMessageFields({
  data,
  onChange,
  flowVariables = [],
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  flowVariables?: FlowDefinedVariable[];
}) {
  const [pickerIndex, setPickerIndex] = useState<number | null>(null);
  const items: EditorSendMessageItem[] = resolveSendMessageItems(data).map((it) => ({
    id: it.id === 'legacy' ? 'msg_1' : it.id,
    send_mode: it.send_mode,
    text: it.text,
    media_url: it.media_url,
    media_asset_id: it.media_asset_id,
    media_asset_label: it.media_asset_label,
    media_type: it.media_type,
    caption: it.caption,
    filename: it.filename,
    delay_after: it.delay_after,
  }));

  const persist = (next: EditorSendMessageItem[]) => {
    const first = next[0];
    onChange({
      messages: next,
      send_mode: first?.send_mode || 'text',
      text: first?.text || '',
      media_url: first?.media_url || '',
      media_asset_id: first?.media_asset_id || '',
      media_asset_label: first?.media_asset_label || '',
      media_type: first?.media_type || 'image',
      caption: first?.caption || '',
      filename: first?.filename || '',
    });
  };

  const updateItem = (index: number, patch: Partial<EditorSendMessageItem>) => {
    persist(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    const tmp = next[index];
    next[index] = next[j];
    next[j] = tmp;
    persist(next);
  };

  const handlePickAsset = (asset: MediaLibraryAsset) => {
    if (pickerIndex == null) return;
    const nextType = mediaTypeFromMime(asset.mimeType);
    updateItem(pickerIndex, {
      media_asset_id: asset.id,
      media_asset_label: asset.originalFilename || asset.id,
      media_url: '',
      media_type: nextType,
      filename: asset.originalFilename || items[pickerIndex]?.filename || '',
    });
    setPickerIndex(null);
  };

  return (
    <>
      <p className="text-[11px] text-muted-foreground">
        Envie uma ou várias mensagens no mesmo nó, com espera opcional entre elas. O nó{' '}
        <code className="text-[10px]">delay</code> separado continua disponível.
      </p>
      <div className="flex items-center justify-between gap-2">
        <Label>
          Mensagens ({items.length}/{SEND_MESSAGE_MAX_ITEMS})
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7"
          disabled={items.length >= SEND_MESSAGE_MAX_ITEMS}
          onClick={() =>
            persist([
              ...items,
              {
                id: newSendMessageItemId(items),
                send_mode: 'text',
                text: '',
                media_url: '',
                media_asset_id: '',
                media_asset_label: '',
                media_type: 'image',
                caption: '',
                filename: '',
                delay_after: { amount: 0, unit: 'seconds' },
              },
            ])
          }
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Mensagem
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => {
          const mode = item.send_mode === 'media' ? 'media' : 'text';
          const mediaType = item.media_type;
          const assetId = item.media_asset_id.trim();
          const assetLabel = item.media_asset_label.trim();
          const delayAmount = Math.max(0, Number(item.delay_after?.amount) || 0);
          const delayUnit = item.delay_after?.unit || 'seconds';
          const isLast = index === items.length - 1;

          return (
            <div key={item.id} className="space-y-2 rounded-lg border border-border/60 p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  #{index + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                    aria-label="Mover para cima"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isLast}
                    onClick={() => moveItem(index, 1)}
                    aria-label="Mover para baixo"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    disabled={items.length <= 1}
                    onClick={() => persist(items.filter((_, i) => i !== index))}
                    aria-label="Remover mensagem"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Tipo de envio</Label>
                <Select
                  value={mode}
                  onValueChange={(v) =>
                    updateItem(index, { send_mode: v === 'media' ? 'media' : 'text' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Texto</SelectItem>
                    <SelectItem value="media">Mídia (imagem / documento / áudio)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mode === 'text' ? (
                <VariableTextField
                  id={`msg-${item.id}`}
                  label="Mensagem"
                  rows={3}
                  value={item.text}
                  onChange={(text) => updateItem(index, { text })}
                  flowVariables={flowVariables}
                  placeholder="Olá {{contact.name}}! Como posso ajudar?"
                />
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>Tipo de mídia</Label>
                    <Select
                      value={mediaType}
                      onValueChange={(v) =>
                        updateItem(index, {
                          media_type:
                            v === 'document' || v === 'audio' ? v : 'image',
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="image">Imagem</SelectItem>
                        <SelectItem value="document">Documento</SelectItem>
                        <SelectItem value="audio">Áudio</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-0.5">
                        <Label>Biblioteca de mídias</Label>
                        <p className="text-[11px] text-muted-foreground">
                          Asset do tenant (Media Library).
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="shrink-0"
                        onClick={() => setPickerIndex(index)}
                      >
                        <Images className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Escolher
                      </Button>
                    </div>
                    {assetId ? (
                      <div className="flex items-center justify-between gap-2 rounded-md bg-background/80 px-2.5 py-2 text-xs">
                        <span className="truncate font-medium" title={assetLabel || assetId}>
                          {assetLabel || assetId.slice(0, 8)}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 px-2 text-muted-foreground"
                          onClick={() =>
                            updateItem(index, { media_asset_id: '', media_asset_label: '' })
                          }
                        >
                          Remover
                        </Button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Nenhum asset selecionado.</p>
                    )}
                  </div>

                  <VariableTextField
                    id={`media-url-${item.id}`}
                    label="URL da mídia (opcional se houver asset)"
                    rows={2}
                    value={item.media_url}
                    onChange={(media_url) =>
                      updateItem(index, {
                        media_url,
                        ...(String(media_url || '').trim()
                          ? { media_asset_id: '', media_asset_label: '' }
                          : {}),
                      })
                    }
                    flowVariables={flowVariables}
                    placeholder="https://… ou {{vars}}"
                  />
                  {mediaType !== 'audio' ? (
                    <VariableTextField
                      id={`media-caption-${item.id}`}
                      label="Legenda (opcional)"
                      rows={2}
                      value={item.caption}
                      onChange={(caption) => updateItem(index, { caption })}
                      flowVariables={flowVariables}
                      placeholder="Texto junto da mídia"
                    />
                  ) : null}
                  {mediaType === 'document' || mediaType === 'audio' ? (
                    <div className="space-y-1.5">
                      <Label htmlFor={`media-filename-${item.id}`}>Nome do arquivo (opcional)</Label>
                      <Input
                        id={`media-filename-${item.id}`}
                        value={item.filename}
                        onChange={(e) => updateItem(index, { filename: e.target.value })}
                        placeholder={mediaType === 'audio' ? 'mensagem.mp3' : 'proposta.pdf'}
                      />
                    </div>
                  ) : null}
                </>
              )}

              {!isLast ? (
                <div className="grid grid-cols-[1fr_1fr] items-end gap-2 border-t border-border/50 pt-2">
                  <div className="min-w-0 space-y-1">
                    <Label className="block truncate text-xs" title="Espera antes da próxima">
                      Espera
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      max={99999}
                      className="h-8"
                      value={delayAmount}
                      onChange={(e) =>
                        updateItem(index, {
                          delay_after: {
                            amount: Math.max(0, Number(e.target.value) || 0),
                            unit: delayUnit,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Label className="block truncate text-xs" title="Unidade de tempo">
                      Unidade
                    </Label>
                    <Select
                      value={delayUnit}
                      onValueChange={(v) =>
                        updateItem(index, {
                          delay_after: {
                            amount: delayAmount,
                            unit:
                              v === 'minutes' || v === 'hours' ? v : 'seconds',
                          },
                        })
                      }
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Preferir a biblioteca (URL assinada / storage interno). Áudio não leva legenda. Se o envio
        falhar, o fluxo continua.
      </p>

      <MediaPickerDialog
        open={pickerIndex != null}
        onOpenChange={(open) => {
          if (!open) setPickerIndex(null);
        }}
        title="Mídia do nó send_message"
        description="Selecione ou carregue um ficheiro da Media Library para enviar no fluxo."
        accept={pickerAcceptForMediaType(
          pickerIndex != null ? items[pickerIndex]?.media_type || 'image' : 'image'
        )}
        confirmLabel="Usar nesta mensagem"
        onSelect={handlePickAsset}
      />
    </>
  );
}

function WaitInputAcceptFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const acceptRaw = String(data.accept || 'text');
  const accept = acceptRaw === 'media' || acceptRaw === 'any' ? acceptRaw : 'text';
  const varName = String(data.variable || 'arquivo').trim() || 'arquivo';
  const kindsRaw = Array.isArray(data.media_kinds) ? data.media_kinds : ['document', 'image'];
  const kinds = new Set(
    kindsRaw.map((k) => String(k)).filter((k) => ['document', 'image', 'audio', 'video'].includes(k))
  );
  if (kinds.size === 0) {
    kinds.add('document');
    kinds.add('image');
  }

  const toggleKind = (kind: string, on: boolean) => {
    const next = new Set(kinds);
    if (on) next.add(kind);
    else next.delete(kind);
    if (next.size === 0) {
      next.add('document');
      next.add('image');
    }
    onChange({ media_kinds: Array.from(next) });
  };

  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div className="space-y-1.5">
        <Label>Aceitar</Label>
        <Select
          value={accept}
          onValueChange={(v) =>
            onChange({
              accept: v,
              ...(v !== 'text' && !Array.isArray(data.media_kinds)
                ? { media_kinds: ['document', 'image'] }
                : {}),
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="text">Texto</SelectItem>
            <SelectItem value="media">Mídia</SelectItem>
            <SelectItem value="any">Ambos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {accept === 'media' || accept === 'any' ? (
        <>
          <div className="space-y-2">
            <Label>Tipos de mídia</Label>
            {(
              [
                ['document', 'Documento / PDF'],
                ['image', 'Imagem'],
                ['audio', 'Áudio'],
                ['video', 'Vídeo'],
              ] as const
            ).map(([id, label]) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-border"
                  checked={kinds.has(id)}
                  onChange={(e) => toggleKind(id, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wait-invalid">Mensagem se inválido (opcional)</Label>
            <Input
              id="wait-invalid"
              value={String(data.invalid_message || '')}
              onChange={(e) => onChange({ invalid_message: e.target.value })}
              placeholder="Por favor, envie um arquivo…"
            />
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Ao receber mídia, grava{' '}
            <code className="text-[10px]">
              {`{{${varName}.url}}`}
            </code>
            ,{' '}
            <code className="text-[10px]">
              {`{{${varName}.nome}}`}
            </code>{' '}
            e{' '}
            <code className="text-[10px]">
              {`{{${varName}.tipo}}`}
            </code>
            . Para enviar à parceira, use <strong>webhook_out</strong> custom. Em produção o runtime
            copia o ficheiro para storage nosso e grava URL assinada (
            <code className="text-[10px]">/api/media/v1/raw?k=&amp;s=&amp;e=</code>
            ) com TTL configurável (default 48h — env{' '}
            <code className="text-[10px]">FLOW_INBOUND_TEMP_TTL_HOURS</code>
            ). A parceira deve baixar dentro do TTL; o ficheiro <strong>não</strong> entra na Media
            Library de produtos.
          </p>
        </>
      ) : null}
    </div>
  );
}

function WaitInputContactFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const enabled = data.save_to_contact === true;
  const field = String(data.contact_field || 'name');
  return (
    <div className="space-y-3 rounded-md border border-border/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <Label htmlFor="save-contact">Gravar no contato (CRM)</Label>
          <p className="text-[11px] text-muted-foreground">
            Atualiza cliente ou lead vinculado à conversa. Sem vínculo, só a variável de sessão.
          </p>
        </div>
        <Switch
          id="save-contact"
          checked={enabled}
          onCheckedChange={(v) => onChange({ save_to_contact: v })}
        />
      </div>
      {enabled ? (
        <div className="space-y-1.5">
          <Label>Campo do cadastro</Label>
          <Select
            value={
              ['name', 'email', 'phone', 'company', 'cpf_cnpj'].includes(field) ? field : 'name'
            }
            onValueChange={(v) => onChange({ contact_field: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Nome</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
              <SelectItem value="phone">Telefone</SelectItem>
              <SelectItem value="company">Empresa</SelectItem>
              <SelectItem value="cpf_cnpj">CPF/CNPJ (só cliente)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}
    </div>
  );
}

function InputTimeoutFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const enabled = isInputTimeoutEnabled(data);
  return (
    <div className="space-y-2 rounded-lg border p-2.5">
      <div className="flex items-center gap-2">
        <input
          id="timeout-enabled"
          type="checkbox"
          className="h-4 w-4"
          checked={enabled}
          onChange={(e) => onChange({ timeout_enabled: e.target.checked })}
        />
        <Label htmlFor="timeout-enabled" className="font-normal">
          Timeout se não responder
        </Label>
      </div>
      {enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="timeout-amount" className="text-[11px]">
                Tempo
              </Label>
              <Input
                id="timeout-amount"
                type="number"
                min={1}
                max={99999}
                value={Number(data.timeout_amount) || 5}
                onChange={(e) => onChange({ timeout_amount: Number(e.target.value) || 5 })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Unidade</Label>
              <Select
                value={String(data.timeout_unit || 'minutes')}
                onValueChange={(v) => onChange({ timeout_unit: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                  <SelectItem value="days">Dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sem resposta → saída <span className="font-medium text-amber-700">timeout</span>
            {formatTimeoutHint(data) ? ` (${formatTimeoutHint(data)})` : ''}. Publique com essa
            conexão ligada.
          </p>
        </>
      ) : null}
    </div>
  );
}

function ConditionFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const migrated = migrateLegacyConditionData(data);
  const cases = readConditionCasesForEditor(migrated.cases);

  const setCases = (next: ConditionCase[]) => {
    onChange({
      cases: next,
      variable: undefined,
      operator: undefined,
      value: undefined,
    });
  };

  const updateCase = (index: number, patch: Partial<ConditionCase>) => {
    setCases(cases.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const updateRule = (caseIndex: number, ruleIndex: number, patch: Partial<ConditionRule>) => {
    const c = cases[caseIndex];
    if (!c) return;
    const conditions = c.conditions.map((r, i) => (i === ruleIndex ? { ...r, ...patch } : r));
    updateCase(caseIndex, { conditions });
  };

  const needsValue = (op: ConditionOperator) => op !== 'exists' && op !== 'empty';

  return (
    <>
      <p className="text-[11px] text-muted-foreground">
        Avalia os casos em ordem; o primeiro que casar segue pela sua saída. Se nenhum casar →{' '}
        <strong>else</strong>.
      </p>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Casos</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() =>
              setCases([
                ...cases,
                {
                  id: newConditionCaseId(cases),
                  name: `Caso ${cases.length + 1}`,
                  join: 'and',
                  conditions: [{ variable: 'answer', operator: 'eq', value: '' }],
                },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Caso
          </Button>
        </div>

        {cases.map((c, caseIndex) => (
          <div key={`case-${caseIndex}`} className="space-y-2 rounded-lg border p-2.5">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Nome (rótulo no canvas)</Label>
                  <Input
                    value={c.name}
                    onChange={(e) => updateCase(caseIndex, { name: e.target.value })}
                    placeholder={`Caso ${caseIndex + 1}`}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">ID estável (handle)</Label>
                  <Input
                    value={c.id}
                    onChange={(e) =>
                      updateCase(caseIndex, {
                        id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
                      })
                    }
                    onBlur={() => {
                      const cleaned = c.id.replace(/^_+|_+$/g, '').slice(0, 64);
                      if (!cleaned) {
                        updateCase(caseIndex, { id: newConditionCaseId(cases.filter((_, i) => i !== caseIndex)) });
                      } else if (cleaned !== c.id) {
                        updateCase(caseIndex, { id: cleaned });
                      }
                    }}
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Combinar regras</Label>
                  <Select
                    value={c.join}
                    onValueChange={(v) =>
                      updateCase(caseIndex, { join: v === 'or' ? 'or' : 'and' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="and">Todas (E)</SelectItem>
                      <SelectItem value="or">Qualquer (OU)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-destructive"
                disabled={cases.length <= 1}
                onClick={() => setCases(cases.filter((_, i) => i !== caseIndex))}
                aria-label="Remover caso"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-2 border-t pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Condições</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() =>
                    updateCase(caseIndex, {
                      conditions: [
                        ...c.conditions,
                        { variable: 'answer', operator: 'eq', value: '' },
                      ],
                    })
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Regra
                </Button>
              </div>
              {c.conditions.map((rule, ruleIndex) => (
                <div key={ruleIndex} className="space-y-1.5 rounded-md bg-muted/40 p-2">
                  <div className="flex items-center gap-1">
                    <Input
                      className="h-8 flex-1"
                      placeholder="variável"
                      value={rule.variable}
                      onChange={(e) =>
                        updateRule(caseIndex, ruleIndex, { variable: e.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      disabled={c.conditions.length <= 1}
                      onClick={() =>
                        updateCase(caseIndex, {
                          conditions: c.conditions.filter((_, i) => i !== ruleIndex),
                        })
                      }
                      aria-label="Remover regra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Select
                    value={rule.operator}
                    onValueChange={(v) =>
                      updateRule(caseIndex, ruleIndex, {
                        operator: v as ConditionOperator,
                      })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eq">Igual a</SelectItem>
                      <SelectItem value="neq">Diferente de</SelectItem>
                      <SelectItem value="contains">Contém</SelectItem>
                      <SelectItem value="exists">Existe (não vazio)</SelectItem>
                      <SelectItem value="empty">Vazio</SelectItem>
                    </SelectContent>
                  </Select>
                  {needsValue(rule.operator) ? (
                    <Input
                      className="h-8"
                      placeholder="valor"
                      value={rule.value}
                      onChange={(e) =>
                        updateRule(caseIndex, ruleIndex, { value: e.target.value })
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MenuChoiceFields({
  data,
  onChange,
  flowVariables = [],
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  flowVariables?: FlowDefinedVariable[];
}) {
  const mode = String(data.mode || 'button') === 'list' ? 'list' : 'button';
  const options = readMenuOptionsForEditor(data.options);
  const maxOpts = mode === 'button' ? 3 : 10;

  const setOptions = (next: MenuChoiceOption[]) => onChange({ options: next });

  const updateOption = (index: number, patch: Partial<MenuChoiceOption>) => {
    const next = options.map((o, i) => (i === index ? { ...o, ...patch } : o));
    setOptions(next);
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label>Tipo de menu</Label>
        <Select
          value={mode}
          onValueChange={(v) => {
            const nextMode = v === 'list' ? 'list' : 'button';
            const nextOpts =
              nextMode === 'button' && options.length > 3 ? options.slice(0, 3) : options;
            onChange({ mode: nextMode, options: nextOpts });
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="button">Botões (até 3)</SelectItem>
            <SelectItem value="list">Lista (até 10)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <VariableTextField
        id="menu-text"
        label="Texto do menu"
        rows={3}
        value={String(data.text || '')}
        onChange={(text) => onChange({ text })}
        placeholder="Como posso ajudar?"
        flowVariables={flowVariables}
      />

      <VariableTextField
        id="menu-footer"
        label="Rodapé (opcional)"
        rows={1}
        value={String(data.footer_text || '')}
        onChange={(footer_text) => onChange({ footer_text })}
        placeholder=""
        flowVariables={flowVariables}
      />

      {mode === 'list' ? (
        <div className="space-y-1.5">
          <Label htmlFor="list-btn">Texto do botão da lista</Label>
          <Input
            id="list-btn"
            value={String(data.list_button || 'Ver opções')}
            onChange={(e) => onChange({ list_button: e.target.value })}
            maxLength={20}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="menu-var">Salvar escolha em</Label>
        <Input
          id="menu-var"
          value={String(data.variable || 'answer')}
          onChange={(e) => onChange({ variable: e.target.value })}
          placeholder="answer"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Opções / ramificações</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            disabled={options.length >= maxOpts}
            onClick={() =>
              setOptions([
                ...options,
                {
                  id: newMenuOptionId(options),
                  label: `Opção ${options.length + 1}`,
                  description: '',
                  section: '',
                  set_variables: [],
                },
              ])
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Opção
          </Button>
        </div>

        {options.map((opt, index) => (
          <div key={`opt-${index}`} className="space-y-2 rounded-lg border p-2.5">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">ID (handle)</Label>
                  <Input
                    value={opt.id}
                    onChange={(e) =>
                      updateOption(index, {
                        id: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64),
                      })
                    }
                    onBlur={() => {
                      const cleaned = opt.id.replace(/^_+|_+$/g, '').slice(0, 64);
                      if (!cleaned) {
                        updateOption(index, {
                          id: newMenuOptionId(options.filter((_, i) => i !== index)),
                        });
                      } else if (cleaned !== opt.id) {
                        updateOption(index, { id: cleaned });
                      }
                    }}
                    placeholder="opt_a"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Texto do botão</Label>
                  <Input
                    value={opt.label}
                    maxLength={24}
                    onChange={(e) => updateOption(index, { label: e.target.value })}
                  />
                </div>
                {mode === 'list' ? (
                  <>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Descrição</Label>
                      <Input
                        value={opt.description || ''}
                        maxLength={72}
                        onChange={(e) => updateOption(index, { description: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Seção</Label>
                      <Input
                        value={opt.section || ''}
                        maxLength={24}
                        onChange={(e) => updateOption(index, { section: e.target.value })}
                      />
                    </div>
                  </>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                disabled={options.length <= 1}
                onClick={() => setOptions(options.filter((_, i) => i !== index))}
                aria-label="Remover opção"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="space-y-1.5 border-t pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px]">Definir variáveis nesta opção</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={() =>
                    updateOption(index, {
                      set_variables: [
                        ...(opt.set_variables || []),
                        { name: 'choice', value: opt.id },
                      ],
                    })
                  }
                >
                  <Plus className="mr-0.5 h-3 w-3" />
                  Var
                </Button>
              </div>
              {(opt.set_variables || []).map((sv, svi) => (
                <div key={`opt-${index}-sv-${svi}`} className="flex gap-1.5">
                  <Input
                    className="h-8"
                    placeholder="nome"
                    value={sv.name}
                    onChange={(e) => {
                      const set_variables = [...(opt.set_variables || [])];
                      set_variables[svi] = { ...sv, name: e.target.value };
                      updateOption(index, { set_variables });
                    }}
                  />
                  <Input
                    className="h-8"
                    placeholder="valor"
                    value={sv.value}
                    onChange={(e) => {
                      const set_variables = [...(opt.set_variables || [])];
                      set_variables[svi] = { ...sv, value: e.target.value };
                      updateOption(index, { set_variables });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      const set_variables = (opt.set_variables || []).filter((_, i) => i !== svi);
                      updateOption(index, { set_variables });
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <VariableTextField
        id="menu-invalid"
        label="Se a opção for inválida"
        rows={2}
        value={String(data.invalid_message || 'Opção inválida. Escolha uma das alternativas.')}
        onChange={(invalid_message) => onChange({ invalid_message })}
        flowVariables={flowVariables}
      />

      <div className="space-y-1.5">
        <Label htmlFor="menu-max">Tentativas antes do fallback</Label>
        <Input
          id="menu-max"
          type="number"
          min={1}
          max={10}
          value={Number(data.max_invalid) || 3}
          onChange={(e) => onChange({ max_invalid: Number(e.target.value) || 3 })}
        />
      </div>

      <p className="text-[11px] text-muted-foreground">
        Cada opção gera uma saída no canvas. Sem match após tentativas →{' '}
        <span className="text-rose-600">fallback</span>.
      </p>
      <InputTimeoutFields data={data} onChange={onChange} />
    </>
  );
}

