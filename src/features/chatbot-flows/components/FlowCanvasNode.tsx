import { memo } from 'react';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Copy, Trash2, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  NODE_LABELS,
  FLOW_NODE_TYPES,
  defaultDataForType,
  generateInboundWebhookToken,
  nodePreview,
  resolveSendMessageItems,
  type EssentialNodeType,
  type GraphValidationIssue,
} from '../lib/nodeCatalog';
import { getNodeVisual } from '../lib/nodeVisuals';
import { normalizeMenuOptions } from '../lib/menuChoiceHelpers';
import {
  conditionCaseHandle,
  migrateLegacyConditionData,
  normalizeConditionCases,
} from '../lib/conditionHelpers';
import { formatTimeoutHint, isInputTimeoutEnabled } from '../lib/inputTimeout';
import { useFlowEditorDirty } from '../lib/flowEditorDirty';
import { useFlowValidation } from '../lib/flowValidationContext';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

type FlowNodeData = {
  label?: string;
  invalid?: boolean;
  validationIssues?: GraphValidationIssue[];
  simStatus?: 'current' | 'done' | 'error';
  simDone?: boolean;
  [key: string]: unknown;
};

function cloneNodeData(data: FlowNodeData, type: string): Record<string, unknown> {
  const raw = { ...(data || {}) };
  delete raw.invalid;
  delete raw.simStatus;
  delete raw.simDone;
  delete raw.validationIssues;
  let copy: Record<string, unknown>;
  try {
    copy = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
  } catch {
    copy = { ...raw };
  }
  if (type === 'webhook_in') {
    copy.token = generateInboundWebhookToken();
  }
  return copy;
}

/** Texto + handle na mesma linha (evita desalinhamento por %). */
function FlowExitRow({
  id: handleId,
  label,
  handleClassName,
  labelClassName,
}: {
  id: string;
  label: string;
  handleClassName: string;
  labelClassName: string;
}) {
  return (
    <div className="relative flex min-h-[16px] items-center justify-end pr-1">
      <span
        className={cn(
          'max-w-[90%] truncate text-right text-[9px] font-medium uppercase tracking-wide',
          labelClassName
        )}
      >
        {label}
      </span>
      <Handle
        type="source"
        position={Position.Right}
        id={handleId}
        className={cn(
          'chatbot-flow-handle !absolute !right-[-6px] !top-1/2 !-translate-y-1/2',
          handleClassName
        )}
      />
    </div>
  );
}

function FlowNodeInner({ id, data, type, selected }: NodeProps & { data: FlowNodeData }) {
  const { deleteElements, getNode, setNodes, setEdges } = useReactFlow();
  const markDirty = useFlowEditorDirty();
  const validation = useFlowValidation();
  const t = (type || 'default') as EssentialNodeType;
  const title = NODE_LABELS[t] || data.label || t;
  const preview = nodePreview(t, data);
  const visual = getNodeVisual(t);
  const Icon = visual.Icon;
  const sendMsgCount =
    t === 'send_message' ? resolveSendMessageItems(data as Record<string, unknown>).length : 0;
  const nodeIssues = data.validationIssues || [];
  const showValidation = Boolean(data.invalid && nodeIssues.length > 0);
  const popoverOpen = validation?.openIssueNodeId === id;

  const menuOptions = t === 'menu_choice' ? normalizeMenuOptions(data.options) : [];
  const showMenu = t === 'menu_choice';
  const menuHasTimeout = showMenu && isInputTimeoutEnabled(data as Record<string, unknown>);

  const conditionCases =
    t === 'condition'
      ? normalizeConditionCases(migrateLegacyConditionData(data as Record<string, unknown>).cases)
      : [];
  const showCondition = t === 'condition';

  const waitHasTimeout = t === 'wait_input' && isInputTimeoutEnabled(data as Record<string, unknown>);
  const showWaitTimeout = waitHasTimeout;

  const showTarget = t !== 'start' && t !== 'webhook_in';
  const showDualHttp =
    type === 'http_request' ||
    type === 'webhook_out' ||
    type === 'kanban_add_card' ||
    type === 'move_kanban' ||
    type === 'ensure_conversation';
  const showDualInvoice =
    type === 'lookup_invoice' ||
    type === 'select_invoice' ||
    type === 'invoice_assist' ||
    type === 'ticket_assist' ||
    type === 'lookup_ticket' ||
    type === 'select_ticket' ||
    type === 'ticket_lookup_assist';
  const showCrmLink = type === 'crm_link_check';
  const showCrmConvert = type === 'crm_convert';
  const crmConvertMode = String((data as Record<string, unknown>).mode || 'to_lead');
  const showCrmConvertTriple = showCrmConvert && crmConvertMode !== 'to_client';
  const showDefaultSource =
    !showDualHttp &&
    !showDualInvoice &&
    !showCrmLink &&
    !showCrmConvert &&
    !showMenu &&
    !showCondition &&
    !showWaitTimeout &&
    (t === 'start' ||
      t === 'webhook_in' ||
      t === 'send_message' ||
      t === 'wait_input' ||
      t === 'set_variable' ||
      t === 'add_tag' ||
      t === 'assign_agent' ||
      t === 'delay' ||
      t === 'conversation_note');
  const invoiceFailHandle =
    t === 'select_invoice' ||
    t === 'invoice_assist' ||
    t === 'ticket_assist' ||
    t === 'select_ticket' ||
    t === 'ticket_lookup_assist'
      ? 'invalid'
      : 'empty';
  const invoiceOkLabel =
    t === 'select_invoice' ||
    t === 'invoice_assist' ||
    t === 'ticket_assist' ||
    t === 'select_ticket' ||
    t === 'ticket_lookup_assist'
      ? 'ok'
      : 'achou';
  const invoiceFailLabel =
    t === 'select_invoice' || t === 'select_ticket'
      ? 'inválida'
      : t === 'invoice_assist' || t === 'ticket_assist' || t === 'ticket_lookup_assist'
        ? 'vazia/inválida'
        : 'vazia';
  const showInvoiceTriple =
    t === 'invoice_assist' || t === 'ticket_assist' || t === 'ticket_lookup_assist';
  const canDuplicate = t !== 'start' && t !== 'webhook_in';

  const duplicateNode = () => {
    const node = getNode(id);
    if (!node) return;
    const nodeType = String(node.type || type || '');
    if (nodeType === 'start' || nodeType === 'webhook_in') {
      return;
    }
    const nid = `${nodeType}-${crypto.randomUUID().slice(0, 8)}`;
    const dataCopy = cloneNodeData((node.data || {}) as FlowNodeData, nodeType);
    const fallback = (FLOW_NODE_TYPES as readonly string[]).includes(nodeType)
      ? defaultDataForType(nodeType as EssentialNodeType)
      : {};
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      {
        id: nid,
        type: nodeType,
        position: {
          x: (node.position?.x || 0) + 48,
          y: (node.position?.y || 0) + 48,
        },
        data: { ...fallback, ...dataCopy },
        selected: true,
      },
    ]);
    setEdges((eds) => eds.map((e) => ({ ...e, selected: false })));
    markDirty();
  };

  return (
    <div
      className={cn(
        'group relative w-[200px] overflow-visible rounded-xl border border-black/10 bg-card text-left shadow-md',
        ((showMenu && menuOptions.length > 3) ||
          (showCondition && conditionCases.length > 2)) &&
          'w-[220px]',
        selected && 'ring-2 ring-primary ring-offset-1',
        data.invalid && 'ring-2 ring-amber-500 ring-offset-1 shadow-amber-500/25',
        data.simStatus === 'current' && 'ring-2 ring-emerald-500 ring-offset-1 shadow-emerald-500/20',
        data.simStatus === 'done' && 'opacity-90 ring-1 ring-emerald-400/50',
        data.simStatus === 'error' && 'ring-2 ring-rose-500 ring-offset-1'
      )}
    >
      {showValidation ? (
        <div className="nodrag nopan absolute -left-2 -top-2 z-20">
          <Popover
            open={popoverOpen}
            onOpenChange={(open) => {
              validation?.setOpenIssueNodeId(open ? id : null);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full',
                  'border-2 border-amber-500 bg-amber-50 text-amber-700 shadow-md',
                  'hover:bg-amber-100'
                )}
                title="Ver problema neste nó"
                aria-label="Ver problema neste nó"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="right"
              className="w-80 space-y-3 p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                  Problema neste nó
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{title}</p>
              </div>
              <ul className="space-y-3">
                {nodeIssues.map((issue, idx) => (
                  <li key={`${issue.code}-${idx}`} className="space-y-2 rounded-md border bg-muted/30 p-2">
                    <p className="text-xs font-medium text-foreground">{issue.message}</p>
                    {issue.hint ? (
                      <p className="text-[11px] leading-snug text-muted-foreground">{issue.hint}</p>
                    ) : null}
                    {issue.autofix && validation ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 w-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          validation.autofixIssue(issue);
                        }}
                      >
                        <Wrench className="mr-1.5 h-3.5 w-3.5" />
                        {issue.autofixLabel || 'Corrigir automaticamente'}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}

      <div
        className={cn(
          'nodrag nopan absolute -right-2 -top-2 z-10 flex gap-1',
          'opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-within:opacity-100',
          selected && 'opacity-100'
        )}
      >
        {canDuplicate ? (
          <button
            type="button"
            className={cn(
              'flex h-6 w-6 items-center justify-center',
              'rounded-full border bg-background text-muted-foreground shadow-sm',
              'hover:bg-primary hover:text-primary-foreground hover:border-primary'
            )}
            title="Duplicar nó"
            aria-label="Duplicar nó"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              duplicateNode();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <Copy className="h-3 w-3" />
          </button>
        ) : null}
        <button
          type="button"
          className={cn(
            'flex h-6 w-6 items-center justify-center',
            'rounded-full border bg-background text-muted-foreground shadow-sm',
            'hover:bg-destructive hover:text-destructive-foreground hover:border-destructive'
          )}
          title="Excluir nó"
          aria-label="Excluir nó"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            void deleteElements({ nodes: [{ id }] });
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className="chatbot-flow-handle !bg-slate-500"
        />
      ) : null}

      <div
        className={cn(
          'flex items-center gap-2 rounded-t-xl px-3 py-2',
          visual.headerClass
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-95" aria-hidden />
        <span className="truncate text-xs font-semibold tracking-wide">{title}</span>
      </div>

      <div className="rounded-b-xl bg-background px-3 py-2.5">
        {sendMsgCount > 1 ? (
          <span className="mb-1 inline-flex rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">
            {sendMsgCount} msgs
          </span>
        ) : null}
        <p className="line-clamp-3 text-[12px] leading-snug text-foreground/90">{preview}</p>
        {formatTimeoutHint(data as Record<string, unknown>) &&
        (t === 'wait_input' || t === 'menu_choice') ? (
          <p className="mt-1 text-[10px] font-medium text-amber-700">
            {formatTimeoutHint(data as Record<string, unknown>)}
          </p>
        ) : null}

        {showCondition ? (
          <div className="mt-2 space-y-0.5">
            {conditionCases.map((c, i) => {
              const handleId = conditionCaseHandle(c.id || `c${i + 1}`);
              return (
                <div
                  key={`cond-row-${i}`}
                  className="relative flex min-h-[16px] items-center justify-end pr-1"
                >
                  <span className="max-w-[90%] truncate text-right text-[9px] font-medium tracking-wide text-amber-700">
                    {c.name || c.id || `Caso ${i + 1}`}
                  </span>
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={handleId}
                    className="chatbot-flow-handle !absolute !right-[-6px] !top-1/2 !-translate-y-1/2 !bg-amber-500"
                  />
                </div>
              );
            })}
            <div className="relative flex min-h-[16px] items-center justify-end pr-1">
              <span className="text-[9px] font-medium uppercase tracking-wide text-rose-600">
                else
              </span>
              <Handle
                type="source"
                position={Position.Right}
                id="else"
                className="chatbot-flow-handle !absolute !right-[-6px] !top-1/2 !-translate-y-1/2 !bg-rose-500"
              />
            </div>
          </div>
        ) : null}

        {showDualHttp ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="default"
              label="ok"
              labelClassName="text-emerald-600"
              handleClassName="!bg-emerald-500"
            />
            <FlowExitRow
              id="error"
              label="erro"
              labelClassName="text-rose-600"
              handleClassName="!bg-rose-500"
            />
          </div>
        ) : null}

        {showDualInvoice && !showInvoiceTriple ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="default"
              label={invoiceOkLabel}
              labelClassName="text-emerald-600"
              handleClassName="!bg-emerald-500"
            />
            <FlowExitRow
              id={invoiceFailHandle}
              label={invoiceFailLabel}
              labelClassName="text-rose-600"
              handleClassName="!bg-rose-500"
            />
          </div>
        ) : null}

        {showInvoiceTriple ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="default"
              label="ok"
              labelClassName="text-emerald-600"
              handleClassName="!bg-emerald-500"
            />
            <FlowExitRow
              id="empty"
              label="vazia"
              labelClassName="text-amber-600"
              handleClassName="!bg-amber-500"
            />
            <FlowExitRow
              id="invalid"
              label="inválida"
              labelClassName="text-rose-600"
              handleClassName="!bg-rose-500"
            />
          </div>
        ) : null}

        {showCrmLink ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="client"
              label="cliente"
              labelClassName="text-emerald-600"
              handleClassName="!bg-emerald-500"
            />
            <FlowExitRow
              id="lead"
              label="lead"
              labelClassName="text-sky-600"
              handleClassName="!bg-sky-500"
            />
            <FlowExitRow
              id="unlinked"
              label="sem vínculo"
              labelClassName="text-amber-700"
              handleClassName="!bg-amber-500"
            />
          </div>
        ) : null}

        {showCrmConvert ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="default"
              label="ok"
              labelClassName="text-emerald-600"
              handleClassName="!bg-emerald-500"
            />
            {showCrmConvertTriple ? (
              <FlowExitRow
                id="already_client"
                label="já cliente"
                labelClassName="text-sky-600"
                handleClassName="!bg-sky-500"
              />
            ) : null}
            <FlowExitRow
              id="error"
              label="erro"
              labelClassName="text-rose-600"
              handleClassName="!bg-rose-500"
            />
          </div>
        ) : null}

        {showMenu ? (
          <div className="mt-2 space-y-0.5">
            {menuOptions.map((o, i) => (
              <div
                key={`menu-row-${i}`}
                className="relative flex min-h-[16px] items-center justify-end pr-1"
              >
                <span className="max-w-[90%] truncate text-right text-[9px] font-medium tracking-wide text-violet-700">
                  {o.label || o.id || `Opção ${i + 1}`}
                </span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={o.id || `opt_${i + 1}`}
                  className="chatbot-flow-handle !absolute !right-[-6px] !top-1/2 !-translate-y-1/2 !bg-violet-500"
                />
              </div>
            ))}
            <FlowExitRow
              id="fallback"
              label="fallback"
              labelClassName="text-rose-600"
              handleClassName="!bg-rose-500"
            />
            {menuHasTimeout ? (
              <FlowExitRow
                id="timeout"
                label="timeout"
                labelClassName="text-amber-700"
                handleClassName="!bg-amber-500"
              />
            ) : null}
          </div>
        ) : null}

        {showWaitTimeout ? (
          <div className="mt-2 space-y-0.5">
            <FlowExitRow
              id="default"
              label="ok"
              labelClassName="text-slate-600"
              handleClassName="!bg-slate-500"
            />
            <FlowExitRow
              id="timeout"
              label="timeout"
              labelClassName="text-amber-700"
              handleClassName="!bg-amber-500"
            />
          </div>
        ) : null}
      </div>

      {showDefaultSource ? (
        <Handle
          type="source"
          position={Position.Right}
          id="default"
          className="chatbot-flow-handle !bg-slate-700"
        />
      ) : null}
    </div>
  );
}

export const FlowCanvasNode = memo(FlowNodeInner);
