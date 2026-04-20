import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import {
  listTenantChatTemplates,
  type TenantChatTemplate,
} from '@/services/tenantChatTemplates';
import { renderMessageTemplate, type MessageTemplateContext } from '@/utils/renderMessageTemplate';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: MessageTemplateContext;
  /** Texto já renderizado inserido no input; não envia mensagem. */
  onApply: (renderedText: string) => void;
};

function previewSnippet(content: string, max = 72): string {
  const line = content.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max)}…`;
}

export function ChatKanbanTemplatePickerDialog({ open, onOpenChange, context, onApply }: Props) {
  const [tab, setTab] = useState<'internal' | 'official'>('internal');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<TenantChatTemplate[]>([]);
  const [selected, setSelected] = useState<TenantChatTemplate | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadInternal = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listTenantChatTemplates({
        type: 'internal',
        is_active: 'true',
      });
      if (res.error) {
        setLoadError(res.error);
        setItems([]);
        return;
      }
      setItems(res.data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || tab !== 'internal') return;
    void loadInternal();
  }, [open, tab, loadInternal]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setQ('');
      setTab('internal');
      setLoadError(null);
    }
  }, [open]);

  const filteredLocal = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        (t.category ?? '').toLowerCase().includes(needle) ||
        t.content.toLowerCase().includes(needle),
    );
  }, [items, q]);

  const renderedPreview = selected
    ? renderMessageTemplate(selected.content, context)
    : '';

  const handleUseTemplate = () => {
    if (!selected || tab !== 'internal') return;
    onApply(renderedPreview);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Usar template
          </DialogTitle>
          <DialogDescription>
            Escolha um template interno ativo. O texto é colocado no campo de mensagem para poder editar
            antes de enviar.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'internal' | 'official')} className="flex-1 flex flex-col min-h-0 px-4">
          <TabsList className="grid w-full grid-cols-2 shrink-0 mb-3">
            <TabsTrigger value="internal">Internos</TabsTrigger>
            <TabsTrigger value="official">Oficiais WhatsApp</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="flex-1 flex flex-col min-h-0 mt-0 data-[state=inactive]:hidden">
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nome ou categoria…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            {loadError ? (
              <p className="text-sm text-destructive py-4">{loadError}</p>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                A carregar templates…
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum template interno ativo encontrado. Crie em Configurações → WhatsApp → Templates.
              </p>
            ) : filteredLocal.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum resultado para «{q.trim()}». Tente outro termo.
              </p>
            ) : (
              <ScrollArea className="h-[220px] rounded-md border">
                <ul className="p-1">
                  {filteredLocal.map((t) => {
                    const active = selected?.id === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(t)}
                          className={cn(
                            'w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors',
                            active ? 'bg-muted' : 'hover:bg-muted/60',
                          )}
                        >
                          <div className="font-medium truncate">{t.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t.category || 'Sem categoria'} · {previewSnippet(t.content)}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            )}

            {selected && tab === 'internal' ? (
              <div className="mt-3 space-y-2 shrink-0 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Pré-visualização (renderizada)</p>
                <div className="rounded-md bg-muted/50 border px-3 py-2 text-sm max-h-32 overflow-y-auto whitespace-pre-wrap break-words">
                  {renderedPreview || '—'}
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="official" className="mt-0 pb-4 data-[state=inactive]:hidden">
            <Alert>
              <AlertTitle>Em breve</AlertTitle>
              <AlertDescription>
                O cadastro de templates oficiais está disponível em Configurações, mas o envio pelo
                provedor ainda não está ligado neste fluxo. Use templates <strong>internos</strong> para
                preencher a mensagem manualmente.
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        <DialogFooter className="px-4 py-3 border-t shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!selected || tab !== 'internal'}
            onClick={handleUseTemplate}
          >
            Inserir no campo de mensagem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
