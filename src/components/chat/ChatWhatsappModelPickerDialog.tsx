import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Loader2, Search } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  getWhatsappMessageTemplate,
  listWhatsappMessageTemplates,
  listWhatsappTemplateCategories,
  sendWhatsappMessageTemplateSequence,
  type WhatsappMessageTemplateDetail,
  type WhatsappMessageTemplateListRow,
  type WhatsappTemplateCategory,
} from '@/services/whatsappMessageTemplates';
import { renderMessageTemplate, type MessageTemplateContext } from '@/utils/renderMessageTemplate';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string | null;
  previewContext: MessageTemplateContext;
  onAfterSend?: () => void;
};

const typeLabel = (t: string) => {
  if (t === 'text') return 'Texto';
  if (t === 'image') return 'Imagem';
  if (t === 'document') return 'Documento';
  return t;
};

export function ChatWhatsappModelPickerDialog({
  open,
  onOpenChange,
  conversationId,
  previewContext,
  onAfterSend,
}: Props) {
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [categories, setCategories] = useState<WhatsappTemplateCategory[]>([]);
  const [rows, setRows] = useState<WhatsappMessageTemplateListRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WhatsappMessageTemplateDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sending, setSending] = useState(false);

  const loadCategories = useCallback(async () => {
    const res = await listWhatsappTemplateCategories();
    if (!res.error && res.data?.items) setCategories(res.data.items.filter((c) => c.is_active));
    else setCategories([]);
  }, []);

  const loadModels = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await listWhatsappMessageTemplates({
        template_type: 'model',
        is_active: 'true',
        category_id: categoryId || undefined,
      });
      if (res.error) {
        setRows([]);
        toast.error('Não foi possível carregar modelos', { description: res.error });
        return;
      }
      setRows(res.data?.items ?? []);
    } finally {
      setLoadingList(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (!open) return;
    void loadCategories();
  }, [open, loadCategories]);

  useEffect(() => {
    if (!open) return;
    void loadModels();
  }, [open, loadModels]);

  useEffect(() => {
    if (!open) {
      setQ('');
      setCategoryId('');
      setSelectedId(null);
      setDetail(null);
      setRows([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !selectedId) {
      setDetail(null);
      setLoadingDetail(false);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    setDetail(null);
    void (async () => {
      try {
        const res = await getWhatsappMessageTemplate(selectedId);
        if (cancelled) return;
        if (res.error || !res.data) {
          setDetail(null);
          return;
        }
        setDetail(res.data);
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedId]);

  const filteredRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.category_name ?? '').toLowerCase().includes(needle) ||
        (r.description ?? '').toLowerCase().includes(needle),
    );
  }, [rows, q]);

  const handleSend = async () => {
    if (!conversationId || !selectedId || !detail) return;
    const templateId = selectedId;
    const convId = conversationId;
    onOpenChange(false);
    setSending(true);
    const toastId = toast.loading('Enviando modelo em segundo plano…');
    void (async () => {
      try {
        const res = await sendWhatsappMessageTemplateSequence(templateId, {
          conversation_id: convId,
        });
        if (res.error) {
          toast.error('Não foi possível enviar o modelo', { id: toastId, description: res.error });
          return;
        }
        toast.success('Modelo enviado', { id: toastId });
        onAfterSend?.();
      } finally {
        setSending(false);
      }
    })();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-muted-foreground" />
            Usar modelo
          </DialogTitle>
          <DialogDescription>
            Modelos da aba «Modelos» em Templates WhatsApp. Confirme a pré-visualização e envie a sequência completa
            (texto, imagem ou documento por item). Entre mensagens, o atraso do modelo é limitado a 3s neste envio
            manual.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground">Categoria</p>
            <Select value={categoryId || '__all__'} onValueChange={(v) => setCategoryId(v === '__all__' ? '' : v)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex-1 min-h-0 px-4 pb-2 flex flex-col gap-2">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              A carregar modelos…
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhum modelo ativo encontrado. Crie em Configurações → WhatsApp → Templates WhatsApp → Modelos.
            </p>
          ) : (
            <ScrollArea className="h-[200px] rounded-md border">
              <ul className="p-1">
                {filteredRows.map((r) => {
                  const active = selectedId === r.id;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        className={cn(
                          'w-full text-left rounded-md px-3 py-2.5 text-sm transition-colors',
                          active ? 'bg-muted' : 'hover:bg-muted/60',
                        )}
                      >
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.category_name ?? 'Sem categoria'} · {r.message_count} mensagem(ns)
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          )}

          {selectedId ? (
            <div className="border rounded-md p-2 space-y-2 bg-muted/20">
              <p className="text-[10px] font-medium text-muted-foreground">Pré-visualização da sequência (exemplo)</p>
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  A carregar itens…
                </div>
              ) : detail?.items?.length ? (
                <ScrollArea className="max-h-[220px]">
                  <ol className="space-y-2 pr-2">
                    {detail.items.map((it, idx) => (
                      <li
                        key={`${it.position}-${idx}`}
                        className="rounded border bg-background/80 px-2 py-1.5 text-[11px] space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">
                            {idx + 1}. {typeLabel(it.message_type)}
                          </span>
                          {it.delay_seconds > 0 ? (
                            <span className="text-muted-foreground tabular-nums">+{it.delay_seconds}s</span>
                          ) : null}
                        </div>
                        {it.message_type === 'text' ? (
                          <p className="whitespace-pre-wrap break-words text-foreground/90">
                            {renderMessageTemplate((it.content ?? '').trim(), previewContext) || '—'}
                          </p>
                        ) : (
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground truncate" title={it.media_url ?? ''}>
                              {it.media_url ? 'URL de mídia definida' : 'Sem URL'}
                            </p>
                            {(it.caption ?? '').trim() ? (
                              <p className="whitespace-pre-wrap break-words">
                                {renderMessageTemplate((it.caption ?? '').trim(), previewContext)}
                              </p>
                            ) : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </ScrollArea>
              ) : (
                <p className="text-xs text-muted-foreground">Sem itens para pré-visualizar.</p>
              )}
            </div>
          ) : null}
        </div>

        <DialogFooter className="px-4 py-3 border-t shrink-0 gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!conversationId || !selectedId || !detail?.items?.length || sending}
            onClick={() => void handleSend()}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar modelo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
