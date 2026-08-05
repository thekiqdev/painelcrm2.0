import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { NODE_LABELS, generateInboundWebhookToken, buildInboundWebhookPath, type EssentialNodeType } from '../lib/nodeCatalog';
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
import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { VariableTextField } from './VariableTextField';
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
import { useMemo } from 'react';
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
            ) : (
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
            )}
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
                Com “Reiniciar”, a keyword encerra a sessão viva e começa o flow do zero.
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
          <WebhookInFields data={data} onChange={onChange} />
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
                    user_id: undefined,
                    team_id: undefined,
                    queue_id: v === 'queue' ? data.queue_id : undefined,
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
          <>
            <div className="space-y-1.5">
              <Label htmlFor="svar">Nome da variável</Label>
              <Input
                id="svar"
                value={String(data.variable || '')}
                onChange={(e) => onChange({ variable: e.target.value })}
              />
            </div>
            <VariableTextField
              id="sval"
              label="Valor"
              multiline={false}
              value={String(data.value ?? '')}
              onChange={(value) => onChange({ value })}
            flowVariables={flowVariables}
              placeholder="Texto ou {{outra_var}}"
            />
          </>
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
              <span className="text-rose-600">erro</span> (timeout/5xx/rede).
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

function resolvePublicWebhookUrl(token: string): string {
  const path = buildInboundWebhookPath(token);
  const env = String(import.meta.env.VITE_PUBLIC_API_URL || import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (env) return `${env}${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return path;
}

function WebhookInFields({
  data,
  onChange,
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const token = String(data.token || '');
  const url = token ? resolvePublicWebhookUrl(token) : '';

  return (
    <>
      <div className="space-y-1.5">
        <Label>URL de entrada</Label>
        <div className="flex gap-1.5">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="shrink-0"
            title="Copiar URL"
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
            title="Gerar novo token"
            onClick={() => {
              onChange({ token: generateInboundWebhookToken() });
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          POST com{' '}
          <code className="text-[10px]">{`{ "conversation_id": "…", "variables": {} }`}</code>.
          Publique o flow para a URL funcionar.
        </p>
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

function SendMessageFields({
  data,
  onChange,
  flowVariables = [],
}: {
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
  flowVariables?: FlowDefinedVariable[];
}) {
  const mode = String(data.send_mode || 'text') === 'media' ? 'media' : 'text';
  return (
    <>
      <div className="space-y-1.5">
        <Label>Tipo de envio</Label>
        <Select
          value={mode}
          onValueChange={(v) => onChange({ send_mode: v === 'media' ? 'media' : 'text' })}
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
          id="msg"
          label="Mensagem"
          rows={4}
          value={String(data.text || '')}
          onChange={(text) => onChange({ text })}
          flowVariables={flowVariables}
          placeholder="Olá {{contact.name}}! Como posso ajudar?"
        />
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Tipo de mídia</Label>
            <Select
              value={
                (() => {
                  const mt = String(data.media_type || 'image');
                  return mt === 'document' || mt === 'audio' ? mt : 'image';
                })()
              }
              onValueChange={(v) => onChange({ media_type: v })}
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
          <VariableTextField
            id="media-url"
            label="URL da mídia"
            rows={2}
            value={String(data.media_url || '')}
            onChange={(media_url) => onChange({ media_url })}
            flowVariables={flowVariables}
            placeholder="https://… ou {{vars}}"
          />
          {String(data.media_type || 'image') !== 'audio' ? (
            <VariableTextField
              id="media-caption"
              label="Legenda (opcional)"
              rows={2}
              value={String(data.caption || '')}
              onChange={(caption) => onChange({ caption })}
              flowVariables={flowVariables}
              placeholder="Texto junto da mídia"
            />
          ) : null}
          {String(data.media_type || 'image') === 'document' ||
          String(data.media_type || 'image') === 'audio' ? (
            <div className="space-y-1.5">
              <Label htmlFor="media-filename">Nome do arquivo (opcional)</Label>
              <Input
                id="media-filename"
                value={String(data.filename || '')}
                onChange={(e) => onChange({ filename: e.target.value })}
                placeholder={
                  String(data.media_type || '') === 'audio' ? 'mensagem.mp3' : 'proposta.pdf'
                }
              />
            </div>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Use uma URL pública acessível pelo WhatsApp. Áudio não leva legenda. Se o envio falhar, o
            fluxo continua (não trava a sessão).
          </p>
        </>
      )}
    </>
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
          <div key={c.id} className="space-y-2 rounded-lg border p-2.5">
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
          <div key={`${opt.id}-${index}`} className="space-y-2 rounded-lg border p-2.5">
            <div className="flex items-start gap-2">
              <div className="grid flex-1 gap-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">ID (handle)</Label>
                  <Input
                    value={opt.id}
                    onChange={(e) =>
                      updateOption(index, {
                        id: e.target.value
                          .trim()
                          .replace(/[^a-zA-Z0-9_-]/g, '_')
                          .slice(0, 64),
                      })
                    }
                    placeholder="opt_a"
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
                <div key={`${opt.id}-sv-${svi}`} className="flex gap-1.5">
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

