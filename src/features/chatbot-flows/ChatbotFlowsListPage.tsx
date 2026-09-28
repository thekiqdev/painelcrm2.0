import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Copy, Download, Plus, Upload, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/sonner';
import {
  archiveChatbotFlow,
  createChatbotFlow,
  duplicateChatbotFlow,
  exportChatbotFlow,
  listChatbotFlows,
  publishChatbotFlow,
  revertChatbotFlowToDraft,
  type ChatbotFlow,
} from '@/services/chatbotFlows';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ImportFlowDialog } from './components/ImportFlowDialog';
import { FlowPublishToggle, isFlowPublishToggleOn } from './components/FlowPublishToggle';
import { downloadJsonFile, slugifyFilename } from './lib/flowPortability';

const QK = ['chatbot-flows'] as const;

function publishStateLabel(flow: ChatbotFlow): string {
  if (flow.publish_state === 'published') {
    return `Publicado${flow.published_version != null ? ` v${flow.published_version}` : ''}`;
  }
  if (flow.publish_state === 'outdated') {
    return `Desatualizado${flow.published_version != null ? ` (v${flow.published_version})` : ''}`;
  }
  if (flow.publish_state === 'archived' || flow.status === 'archived') return 'Arquivado';
  return 'Rascunho';
}

export default function ChatbotFlowsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publishBusyId, setPublishBusyId] = useState<string | null>(null);

  const { data: flows = [], isLoading, error } = useQuery({
    queryKey: [...QK, { includeArchived }],
    queryFn: () => listChatbotFlows({ includeArchived }),
  });

  useEffect(() => {
    if (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar flows');
    }
  }, [error]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      toast.error('Informe um nome');
      return;
    }
    try {
      setCreating(true);
      const flow = await createChatbotFlow(name);
      await qc.invalidateQueries({ queryKey: QK });
      setCreateOpen(false);
      setNewName('');
      toast.success('Flow criado');
      navigate(`/chatbot-flows/${flow.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar flow');
    } finally {
      setCreating(false);
    }
  }, [navigate, newName, qc]);

  const handleArchive = useCallback(
    async (id: string) => {
      try {
        setArchivingId(id);
        await archiveChatbotFlow(id);
        await qc.invalidateQueries({ queryKey: QK });
        toast.success('Flow arquivado');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao arquivar');
      } finally {
        setArchivingId(null);
      }
    },
    [qc]
  );

  const handleExport = useCallback(async (flow: ChatbotFlow) => {
    try {
      setBusyId(flow.id);
      const doc = await exportChatbotFlow(flow.id, { source: 'draft' });
      downloadJsonFile(`${slugifyFilename(flow.name)}.chatbot-flow.json`, doc);
      toast.success('Exportado');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao exportar');
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleDuplicate = useCallback(
    async (flow: ChatbotFlow) => {
      try {
        setBusyId(flow.id);
        const usePublished = flow.published_version != null && flow.publish_state === 'published';
        const copy = await duplicateChatbotFlow(flow.id, {
          usePublishedAsDraft: usePublished,
        });
        await qc.invalidateQueries({ queryKey: QK });
        toast.success('Flow duplicado');
        navigate(`/chatbot-flows/${copy.id}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao duplicar');
      } finally {
        setBusyId(null);
      }
    },
    [navigate, qc]
  );

  const handlePublishOn = useCallback(
    async (flow: ChatbotFlow) => {
      try {
        setPublishBusyId(flow.id);
        const result = await publishChatbotFlow(flow.id);
        await qc.invalidateQueries({ queryKey: QK });
        toast.success(`Publicado v${result.version.version}`);
        if (result.warnings?.length) {
          for (const w of result.warnings.slice(0, 2)) toast.message(w, { duration: 8000 });
        }
      } catch (e) {
        const err = e as Error & { issues?: { message?: string }[] };
        const first = err.issues?.[0]?.message;
        toast.error(first || err.message || 'Erro ao publicar', { duration: 8000 });
      } finally {
        setPublishBusyId(null);
      }
    },
    [qc]
  );

  const handlePublishOff = useCallback(
    async (flow: ChatbotFlow) => {
      try {
        setPublishBusyId(flow.id);
        await revertChatbotFlowToDraft(flow.id);
        await qc.invalidateQueries({ queryKey: QK });
        toast.success('Flow em rascunho (desligado no WhatsApp)');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Erro ao despublicar');
      } finally {
        setPublishBusyId(null);
      }
    },
    [qc]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Chatbot Flows</h1>
            <p className="text-sm text-muted-foreground">
              Monte fluxos no canvas. Liga = publicado no WhatsApp; desliga = rascunho.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="mr-1.5 h-4 w-4" />
              Importar
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo flow
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b px-4 py-2 md:px-6">
        <Switch
          id="include-archived"
          checked={includeArchived}
          onCheckedChange={setIncludeArchived}
        />
        <Label htmlFor="include-archived" className="text-sm text-muted-foreground">
          Mostrar arquivados
        </Label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <Workflow className="h-10 w-10 text-muted-foreground/60" />
            <div>
              <p className="font-medium">Nenhum flow ainda</p>
              <p className="text-sm text-muted-foreground">Crie o primeiro fluxo ou importe um JSON.</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-1.5 h-4 w-4" />
                Importar
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Novo flow
              </Button>
            </div>
          </div>
        ) : (
          <ul className="divide-y rounded-lg border">
            {flows.map((flow) => (
              <li
                key={flow.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
              >
                <Link to={`/chatbot-flows/${flow.id}`} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{flow.name}</span>
                    <Badge
                      variant={
                        flow.publish_state === 'published'
                          ? 'default'
                          : flow.publish_state === 'outdated'
                            ? 'outline'
                            : 'secondary'
                      }
                    >
                      {publishStateLabel(flow)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Atualizado{' '}
                    {formatDistanceToNow(new Date(flow.updated_at), {
                      addSuffix: true,
                      locale: ptBR,
                    })}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  {flow.status !== 'archived' ? (
                    <FlowPublishToggle
                      id={`flow-pub-${flow.id}`}
                      checked={isFlowPublishToggleOn(flow)}
                      busy={publishBusyId === flow.id}
                      onPublish={() => handlePublishOn(flow)}
                      onUnpublish={() => handlePublishOff(flow)}
                    />
                  ) : null}
                  <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busyId === flow.id}
                    onClick={() => void handleExport(flow)}
                    title="Exportar"
                  >
                    <Download className="h-4 w-4" />
                    <span className="ml-1.5 hidden lg:inline">Exportar</span>
                  </Button>
                  {flow.status !== 'archived' ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === flow.id}
                        onClick={() => void handleDuplicate(flow)}
                        title="Duplicar"
                      >
                        <Copy className="h-4 w-4" />
                        <span className="ml-1.5 hidden lg:inline">Duplicar</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={archivingId === flow.id}
                        onClick={() => handleArchive(flow.id)}
                        title="Arquivar"
                      >
                        <Archive className="h-4 w-4" />
                        <span className="ml-1.5 hidden sm:inline">Arquivar</span>
                      </Button>
                    </>
                  ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo flow</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="flow-name">Nome</Label>
            <Input
              id="flow-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex.: Boas-vindas"
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={creating} onClick={() => void handleCreate()}>
              {creating ? 'Criando…' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportFlowDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(flow) => {
          void qc.invalidateQueries({ queryKey: QK });
          navigate(`/chatbot-flows/${flow.id}`);
        }}
      />
    </div>
  );
}
