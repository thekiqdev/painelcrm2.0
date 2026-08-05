import { useCallback, useEffect, useState } from 'react';
import { Copy, History, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/components/ui/sonner';
import {
  deleteChatbotFlowVersion,
  duplicateChatbotFlow,
  listChatbotFlowVersions,
  restoreChatbotFlowVersion,
  type ChatbotFlow,
  type ChatbotFlowVersionSummary,
} from '@/services/chatbotFlows';
import { cn } from '@/lib/utils';

type Props = {
  flow: ChatbotFlow | null;
  /** Versão carregada no rascunho (selecionada). */
  selectedVersion: number | null;
  onRestored: (flow: ChatbotFlow, restoredVersion: number) => void;
  onDuplicated: (flow: ChatbotFlow) => void;
  onVersionDeleted?: (version: number) => void;
};

function formatPublishedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadgeLabel(
  flow: ChatbotFlow,
  selectedVersion: number | null
): { text: string; className: string } {
  const s = flow.publish_state || 'draft';
  const sel =
    selectedVersion != null
      ? selectedVersion
      : s === 'published'
        ? flow.published_version
        : null;

  if (sel != null) {
    if (s === 'published' && sel === flow.published_version) {
      return {
        text: `Publicado v${sel}`,
        className: 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent',
      };
    }
    if (s === 'outdated') {
      return {
        text: `Rascunho v${sel} · prod v${flow.published_version}`,
        className: 'border-amber-500 text-amber-700 bg-transparent hover:bg-amber-50',
      };
    }
    return {
      text: `Rascunho v${sel}`,
      className: 'border-sky-500 text-sky-800 bg-transparent hover:bg-sky-50',
    };
  }

  if (s === 'published') {
    return {
      text: `Publicado v${flow.published_version}`,
      className: 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent',
    };
  }
  if (s === 'outdated') {
    return {
      text: `Desatualizado (prod v${flow.published_version})`,
      className: 'border-amber-500 text-amber-700 bg-transparent hover:bg-amber-50',
    };
  }
  if (s === 'archived') {
    return { text: 'Arquivado', className: '' };
  }
  return { text: 'Rascunho', className: '' };
}

export function FlowVersionBadge({
  flow,
  selectedVersion,
  onRestored,
  onDuplicated,
  onVersionDeleted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyVersion, setBusyVersion] = useState<number | null>(null);
  const [versions, setVersions] = useState<ChatbotFlowVersionSummary[]>([]);

  const effectiveSelected =
    selectedVersion ??
    (flow?.publish_state === 'published' ? flow.published_version : null);

  const load = useCallback(async () => {
    if (!flow?.id) return;
    try {
      setLoading(true);
      const list = await listChatbotFlowVersions(flow.id);
      setVersions(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao listar versões');
    } finally {
      setLoading(false);
    }
  }, [flow?.id]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!flow) return null;

  const label = statusBadgeLabel(flow, selectedVersion);

  const handleRestore = async (version: number) => {
    if (!flow.id) return;
    const ok = window.confirm(
      `Carregar a versão v${version} no rascunho?\n\nO canvas atual será substituído. A produção só muda se você publicar de novo.`
    );
    if (!ok) return;
    try {
      setBusyVersion(version);
      const result = await restoreChatbotFlowVersion(flow.id, version);
      onRestored(result.flow, result.restored_version);
      setOpen(false);
      toast.success(`Versão v${version} selecionada no rascunho`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao restaurar versão');
    } finally {
      setBusyVersion(null);
    }
  };

  const handleDuplicate = async (version: number) => {
    if (!flow.id) return;
    try {
      setBusyVersion(version);
      const copy = await duplicateChatbotFlow(flow.id, { fromVersion: version });
      toast.success(`Flow criado a partir de v${version}`);
      onDuplicated(copy);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao duplicar versão');
    } finally {
      setBusyVersion(null);
    }
  };

  const handleDelete = async (version: number, isCurrent: boolean) => {
    if (!flow.id) return;
    if (isCurrent) {
      toast.error('Não é possível excluir a versão em produção');
      return;
    }
    const ok = window.confirm(
      `Excluir permanentemente a versão v${version} do histórico?\n\nEsta ação não pode ser desfeita.`
    );
    if (!ok) return;
    try {
      setBusyVersion(version);
      await deleteChatbotFlowVersion(flow.id, version);
      setVersions((prev) => prev.filter((v) => v.version !== version));
      onVersionDeleted?.(version);
      toast.success(`Versão v${version} excluída`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir versão');
    } finally {
      setBusyVersion(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="Ver histórico de versões"
        >
          <Badge
            variant={flow.publish_state === 'published' ? 'default' : 'outline'}
            className={cn('cursor-pointer gap-1', label.className)}
          >
            <History className="h-3 w-3 opacity-80" />
            {label.text}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Versões publicadas</p>
          <p className="text-[11px] text-muted-foreground">
            {effectiveSelected != null
              ? `Selecionada no editor: v${effectiveSelected}`
              : 'Nenhuma versão carregada no rascunho.'}
          </p>
        </div>
        <div className="max-h-72 overflow-auto p-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Carregando…
            </div>
          ) : versions.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">
              Nenhuma versão publicada ainda.
            </p>
          ) : (
            versions.map((v) => {
              const isSelected = effectiveSelected === v.version;
              const busy = busyVersion === v.version;
              return (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-2 py-1.5',
                    isSelected
                      ? 'bg-sky-100 ring-1 ring-sky-400 dark:bg-sky-950/50 dark:ring-sky-600'
                      : 'hover:bg-muted/60'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm font-medium">v{v.version}</span>
                      {isSelected ? (
                        <span className="rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          selecionada
                        </span>
                      ) : null}
                      {v.is_current ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                          em produção
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatPublishedAt(v.published_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      title="Usar no rascunho"
                      disabled={busyVersion != null}
                      onClick={() => void handleRestore(v.version)}
                    >
                      {busy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      title="Duplicar como novo flow"
                      disabled={busyVersion != null}
                      onClick={() => void handleDuplicate(v.version)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 text-rose-600 hover:text-rose-700"
                      title={
                        v.is_current
                          ? 'Não é possível excluir a versão em produção'
                          : 'Excluir versão'
                      }
                      disabled={busyVersion != null || v.is_current}
                      onClick={() => void handleDelete(v.version, v.is_current)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
