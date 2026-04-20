import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Library,
  FolderPlus,
  FileText,
  Copy,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import {
  type WhatsappTemplateCategory,
  type WhatsappMessageTemplateListRow,
  type WhatsappTemplateItem,
  type TemplateMessageType,
  type WhatsappTemplateType,
  listWhatsappTemplateCategories,
  createWhatsappTemplateCategory,
  patchWhatsappTemplateCategory,
  deleteWhatsappTemplateCategory,
  listWhatsappMessageTemplates,
  getWhatsappMessageTemplate,
  createWhatsappMessageTemplate,
  patchWhatsappMessageTemplate,
  deleteWhatsappMessageTemplate,
  uploadWhatsappTemplateMedia,
} from '@/services/whatsappMessageTemplates';
import { renderMessageTemplate } from '@/utils/renderMessageTemplate';

const PREVIEW_CTX: Record<string, string> = {
  contact_name: 'Maria Silva',
  operator_name: 'João Costa',
  team_name: 'Suporte',
  column_name: 'Negociação',
  board_name: 'Atendimento',
  company_name: 'Acme Lda.',
};

const PLACEHOLDER_HINT = (
  <p className="text-[10px] text-muted-foreground leading-snug">
    Variáveis: <code className="bg-muted px-1 rounded">{'{{contact_name}}'}</code>,{' '}
    <code className="bg-muted px-1 rounded">{'{{operator_name}}'}</code>,{' '}
    <code className="bg-muted px-1 rounded">{'{{team_name}}'}</code>,{' '}
    <code className="bg-muted px-1 rounded">{'{{column_name}}'}</code>,{' '}
    <code className="bg-muted px-1 rounded">{'{{board_name}}'}</code>,{' '}
    <code className="bg-muted px-1 rounded">{'{{company_name}}'}</code>
  </p>
);

function emptyItem(position: number): WhatsappTemplateItem {
  return {
    position,
    message_type: 'text',
    content: '',
    media_url: null,
    storage_provider: null,
    storage_path: null,
    original_filename: null,
    mime_type: null,
    file_size_bytes: null,
    image_width: null,
    image_height: null,
    caption: null,
    delay_seconds: 0,
  };
}

function messageTypeLabel(t: TemplateMessageType): string {
  if (t === 'text') return 'Texto';
  if (t === 'image') return 'Imagem';
  return 'Documento';
}

function templateTypeLabel(t: WhatsappTemplateType): string {
  return t === 'automatic' ? 'Automático' : 'Modelo';
}

function fileNameFromUrl(url: string): string {
  const s = url.trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : s;
  } catch {
    const parts = s.split(/[/\\]/);
    return parts.pop() || s;
  }
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

/** Normaliza itens vindos da API (compat. legado image_url). */
function normalizeTemplateItems(items: WhatsappTemplateItem[]): WhatsappTemplateItem[] {
  return items.map((it, i) => {
    const legacy = it as WhatsappTemplateItem & { image_url?: string | null };
    const media_url = it.media_url ?? legacy.image_url ?? null;
    return {
      ...it,
      position: i,
      media_url,
      storage_provider: it.storage_provider ?? null,
      storage_path: it.storage_path ?? null,
      original_filename: it.original_filename ?? null,
      mime_type: it.mime_type ?? null,
      file_size_bytes: it.file_size_bytes ?? null,
      image_width: it.image_width ?? null,
      image_height: it.image_height ?? null,
    };
  });
}

export function WhatsappMessageTemplatesPanel() {
  const [categories, setCategories] = useState<WhatsappTemplateCategory[]>([]);
  const [rowsAutomatic, setRowsAutomatic] = useState<WhatsappMessageTemplateListRow[]>([]);
  const [rowsModel, setRowsModel] = useState<WhatsappMessageTemplateListRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** Navegação principal: cada aba tem a sua listagem e filtros independentes. */
  const [mainTab, setMainTab] = useState<WhatsappTemplateType>('automatic');
  const [qAuto, setQAuto] = useState('');
  const [filterCategoryAuto, setFilterCategoryAuto] = useState('');
  const [filterActiveAuto, setFilterActiveAuto] = useState<'' | 'true' | 'false'>('');
  const [qModel, setQModel] = useState('');
  const [filterCategoryModel, setFilterCategoryModel] = useState('');
  const [filterActiveModel, setFilterActiveModel] = useState<'' | 'true' | 'false'>('');

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formTemplateType, setFormTemplateType] = useState<WhatsappTemplateType>('model');
  const [formItems, setFormItems] = useState<WhatsappTemplateItem[]>([emptyItem(0)]);
  const [saving, setSaving] = useState(false);
  const [uploadingByIndex, setUploadingByIndex] = useState<Record<number, boolean>>({});

  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catEditId, setCatEditId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState('');
  const [catActive, setCatActive] = useState(true);
  const [catSaving, setCatSaving] = useState(false);
  const [catDeleteId, setCatDeleteId] = useState<string | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    const res = await listWhatsappTemplateCategories();
    if (res.error) {
      toast.error(res.error);
      setCategories([]);
      return;
    }
    setCategories(res.data?.items ?? []);
  }, []);

  const loadTemplates = useCallback(
    async (templateTypeOverride?: WhatsappTemplateType) => {
      const tab = templateTypeOverride ?? mainTab;
      setLoading(true);
      const isAuto = tab === 'automatic';
      const res = await listWhatsappMessageTemplates({
        q: (isAuto ? qAuto : qModel).trim() || undefined,
        category_id: (isAuto ? filterCategoryAuto : filterCategoryModel) || undefined,
        is_active: isAuto ? filterActiveAuto : filterActiveModel,
        template_type: tab,
      });
      if (res.error) {
        toast.error(res.error);
        if (isAuto) setRowsAutomatic([]);
        else setRowsModel([]);
      } else {
        const items = res.data?.items ?? [];
        if (isAuto) setRowsAutomatic(items);
        else setRowsModel(items);
      }
      setLoading(false);
    },
    [
      mainTab,
      qAuto,
      qModel,
      filterCategoryAuto,
      filterCategoryModel,
      filterActiveAuto,
      filterActiveModel,
    ],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const openCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormCategoryId(categories[0]?.id ?? '');
    setFormDescription('');
    setFormActive(true);
    setFormTemplateType('model');
    setFormItems([emptyItem(0)]);
    setUploadingByIndex({});
    setSheetOpen(true);
  };

  const openEdit = async (id: string) => {
    const res = await getWhatsappMessageTemplate(id);
    if (res.error || !res.data) {
      toast.error(res.error || 'Não foi possível carregar o template.');
      return;
    }
    const d = res.data;
    setEditingId(id);
    setFormName(d.name);
    setFormCategoryId(d.category_id);
    setFormDescription(d.description ?? '');
    setFormActive(d.is_active);
    setFormTemplateType(d.template_type ?? 'model');
    setFormItems(
      (d.items || []).length > 0 ? normalizeTemplateItems(d.items as WhatsappTemplateItem[]) : [emptyItem(0)],
    );
    setUploadingByIndex({});
    setSheetOpen(true);
  };

  const addItem = () => {
    setFormItems((prev) => [...prev, emptyItem(prev.length)]);
  };

  const removeItem = (index: number) => {
    setFormItems((prev) => prev.filter((_, i) => i !== index).map((it, i) => ({ ...it, position: i })));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    setFormItems((prev) => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next.map((it, i) => ({ ...it, position: i }));
    });
  };

  const updateItem = (index: number, patch: Partial<WhatsappTemplateItem>) => {
    setFormItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const clearItemFile = (index: number) => {
    updateItem(index, {
      media_url: null,
      storage_provider: null,
      storage_path: null,
      original_filename: null,
      mime_type: null,
      file_size_bytes: null,
      image_width: null,
      image_height: null,
    });
  };

  const handleItemFileUpload = async (index: number, file: File, messageType: TemplateMessageType) => {
    const mediaType = messageType === 'image' ? 'image' : 'document';
    setUploadingByIndex((prev) => ({ ...prev, [index]: true }));
    try {
      const res = await uploadWhatsappTemplateMedia(file, mediaType);
      if (res.error || !res.data) {
        toast.error(res.error || 'Falha no upload');
        return;
      }
      updateItem(index, {
        media_url: res.data.media_url,
        storage_provider: res.data.storage_provider,
        storage_path: res.data.storage_path,
        original_filename: res.data.original_filename,
        mime_type: res.data.mime_type,
        file_size_bytes: res.data.file_size_bytes,
        image_width: res.data.image_width,
        image_height: res.data.image_height,
      });
      toast.success('Upload concluído');
    } finally {
      setUploadingByIndex((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleSaveTemplate = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error('Nome do template é obrigatório.');
      return;
    }
    if (!formCategoryId) {
      toast.error('Selecione uma categoria.');
      return;
    }
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (it.message_type === 'text' && !it.content?.trim()) {
        toast.error(`Mensagem ${i + 1}: preencha o texto.`);
        return;
      }
      if (
        (it.message_type === 'image' || it.message_type === 'document') &&
        !it.storage_path?.trim() &&
        !it.media_url?.trim()
      ) {
        toast.error(`Mensagem ${i + 1}: faça o upload do ficheiro.`);
        return;
      }
      if (it.delay_seconds < 0 || it.delay_seconds > 3600) {
        toast.error(`Mensagem ${i + 1}: delay deve estar entre 0 e 3600 s.`);
        return;
      }
    }

    const payload = {
      name,
      category_id: formCategoryId,
      description: formDescription.trim() || null,
      is_active: formActive,
      items: formItems.map((it) => ({
        message_type: it.message_type,
        content: it.message_type === 'text' ? it.content : null,
        media_url:
          it.message_type === 'image' || it.message_type === 'document' ? it.media_url : null,
        storage_provider:
          it.message_type === 'image' || it.message_type === 'document' ? it.storage_provider : null,
        storage_path:
          it.message_type === 'image' || it.message_type === 'document' ? it.storage_path : null,
        original_filename:
          it.message_type === 'image' || it.message_type === 'document' ? it.original_filename : null,
        mime_type: it.message_type === 'image' || it.message_type === 'document' ? it.mime_type : null,
        file_size_bytes:
          it.message_type === 'image' || it.message_type === 'document' ? it.file_size_bytes : null,
        image_width: it.message_type === 'image' ? it.image_width : null,
        image_height: it.message_type === 'image' ? it.image_height : null,
        caption:
          it.message_type === 'image' || it.message_type === 'document' ? it.caption : null,
        delay_seconds: it.delay_seconds,
      })),
    };

    setSaving(true);
    try {
      if (editingId) {
        const res = await patchWhatsappMessageTemplate(editingId, payload);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Template atualizado.');
      } else {
        const res = await createWhatsappMessageTemplate(payload);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Template criado.');
      }
      setSheetOpen(false);
      await loadTemplates();
    } finally {
      setSaving(false);
    }
  };

  const openNewCategory = () => {
    setCatEditId(null);
    setCatName('');
    setCatColor('');
    setCatActive(true);
    setCatDialogOpen(true);
  };

  const openEditCategory = (c: WhatsappTemplateCategory) => {
    setCatEditId(c.id);
    setCatName(c.name);
    setCatColor(c.color ?? '');
    setCatActive(c.is_active);
    setCatDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    const n = catName.trim();
    if (!n) {
      toast.error('Nome da categoria é obrigatório.');
      return;
    }
    setCatSaving(true);
    try {
      if (catEditId) {
        const res = await patchWhatsappTemplateCategory(catEditId, {
          name: n,
          color: catColor.trim() || null,
          is_active: catActive,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Categoria atualizada.');
      } else {
        const res = await createWhatsappTemplateCategory({
          name: n,
          color: catColor.trim() || null,
          is_active: true,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success('Categoria criada.');
        if (res.data?.id) setFormCategoryId(res.data.id);
      }
      setCatDialogOpen(false);
      setCatEditId(null);
      setCatName('');
      setCatColor('');
      await loadCategories();
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!catDeleteId) return;
    const id = catDeleteId;
    const res = await deleteWhatsappTemplateCategory(id);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Categoria eliminada.');
    setCatDeleteId(null);
    if (filterCategoryAuto === id) setFilterCategoryAuto('');
    if (filterCategoryModel === id) setFilterCategoryModel('');
    await loadCategories();
    await loadTemplates('automatic');
    await loadTemplates('model');
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const res = await deleteWhatsappMessageTemplate(deleteId);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success('Template eliminado.');
    setDeleteId(null);
    await loadTemplates();
  };

  const handleDuplicate = async (id: string, sourceTemplateType: WhatsappTemplateType) => {
    setDuplicatingId(id);
    try {
      const res = await getWhatsappMessageTemplate(id);
      if (res.error || !res.data) {
        toast.error(res.error || 'Não foi possível carregar o template.');
        return;
      }
      const d = res.data;
      const items = normalizeTemplateItems((d.items || []) as WhatsappTemplateItem[]);
      const payload = {
        name: `${d.name.trim()} (cópia)`,
        category_id: d.category_id,
        description: d.description?.trim() || null,
        is_active: false,
        items: items.map((it) => ({
          message_type: it.message_type,
          content: it.message_type === 'text' ? it.content : null,
          media_url:
            it.message_type === 'image' || it.message_type === 'document' ? it.media_url : null,
          storage_provider:
            it.message_type === 'image' || it.message_type === 'document' ? it.storage_provider : null,
          storage_path:
            it.message_type === 'image' || it.message_type === 'document' ? it.storage_path : null,
          original_filename:
            it.message_type === 'image' || it.message_type === 'document' ? it.original_filename : null,
          mime_type: it.message_type === 'image' || it.message_type === 'document' ? it.mime_type : null,
          file_size_bytes:
            it.message_type === 'image' || it.message_type === 'document' ? it.file_size_bytes : null,
          image_width: it.message_type === 'image' ? it.image_width : null,
          image_height: it.message_type === 'image' ? it.image_height : null,
          caption:
            it.message_type === 'image' || it.message_type === 'document' ? it.caption : null,
          delay_seconds: it.delay_seconds,
        })),
      };
      const createRes = await createWhatsappMessageTemplate(payload);
      if (createRes.error) {
        toast.error(createRes.error);
        return;
      }
      if (sourceTemplateType === 'automatic') {
        toast.success('Modelo criado a partir do template automático.');
        setMainTab('model');
        await loadTemplates('model');
      } else {
        toast.success('Cópia criada.');
        await loadTemplates('model');
      }
    } finally {
      setDuplicatingId(null);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Templates WhatsApp</h2>
          <p className="text-sm text-muted-foreground max-w-2xl">
            <strong className="font-medium text-foreground">Automáticos</strong> são usados nas automações operacionais;
            os <strong className="font-medium text-foreground">modelos</strong> são mensagens reutilizáveis da empresa.
            Cada template pode ter várias mensagens (texto, imagem ou documento), legenda e delay — pronto para Kanbam e
            chat em etapas seguintes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button type="button" variant="outline" size="sm" onClick={openNewCategory}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Nova categoria
          </Button>
        </div>
      </div>

      <Tabs
        value={mainTab}
        onValueChange={(v) => setMainTab(v as WhatsappTemplateType)}
        className="w-full space-y-4"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1">
          <TabsTrigger value="automatic" className="text-sm py-2">
            Automáticos
          </TabsTrigger>
          <TabsTrigger value="model" className="text-sm py-2">
            Modelos
          </TabsTrigger>
        </TabsList>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground max-w-2xl">
            {mainTab === 'automatic' ? (
              <>
                Mensagens usadas pelo sistema em automações operacionais (transferências, encerramento, Kanbam,
                cobrança, etc.). Pode editar, ativar ou duplicar como modelo na outra aba.
              </>
            ) : (
              <>
                Modelos criados pela empresa para reutilizar no chat, no Kanbam e em envios futuros. Cada um pode ter
                várias mensagens com delay.
              </>
            )}
          </p>
          {mainTab === 'model' ? (
            <Button type="button" size="sm" onClick={openCreate} disabled={categories.length === 0} className="shrink-0">
              <Plus className="h-4 w-4 mr-2" />
              Novo template
            </Button>
          ) : null}
        </div>

      {categories.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Crie primeiro uma categoria para poder adicionar templates.
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="rounded-md border bg-muted/20 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground mb-2">Categorias</p>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <div
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full border bg-background pl-2.5 pr-1 py-0.5 text-xs"
              >
                {c.color ? (
                  <span className="h-2.5 w-2.5 rounded-full shrink-0 border" style={{ backgroundColor: c.color }} />
                ) : null}
                <span className="max-w-[140px] truncate">{c.name}</span>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditCategory(c)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setCatDeleteId(c.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

        <TabsContent value="automatic" className="mt-0 space-y-4 focus-visible:outline-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <Label className="text-xs">Buscar</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Nome ou descrição…"
                value={qAuto}
                onChange={(e) => setQAuto(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 w-full lg:w-48">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={filterCategoryAuto || '__all'}
                onValueChange={(v) => setFilterCategoryAuto(v === '__all' ? '' : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-full lg:w-44">
              <Label className="text-xs">Estado</Label>
              <Select
                value={filterActiveAuto || '__all'}
                onValueChange={(v) => setFilterActiveAuto(v === '__all' ? '' : (v as 'true' | 'false'))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos</SelectItem>
                  <SelectItem value="true">Ativos</SelectItem>
                  <SelectItem value="false">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            {loading && mainTab === 'automatic' ? (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Mensagens</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Atualizado</TableHead>
                    <TableHead className="w-[120px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsAutomatic.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Nenhum template automático. Os padrão do sistema aparecem após sincronizar (ou crie categorias e
                        volte a carregar).
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsAutomatic.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.category_name}</TableCell>
                        <TableCell>
                          <Badge variant={row.is_active ? 'default' : 'secondary'}>
                            {row.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{row.message_count}</TableCell>
                        <TableCell>
                          {row.seed_key ? (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <Library className="h-3.5 w-3.5 shrink-0" />
                              Padrão do sistema
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Personalizado</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(row.id)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={duplicatingId === row.id}
                              title="Duplicar como modelo (aba Modelos)"
                              onClick={() => void handleDuplicate(row.id, 'automatic')}
                            >
                              {duplicatingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        <TabsContent value="model" className="mt-0 space-y-4 focus-visible:outline-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="space-y-1.5 flex-1 min-w-[160px]">
              <Label className="text-xs">Buscar</Label>
              <Input
                className="h-9 text-sm"
                placeholder="Nome ou descrição…"
                value={qModel}
                onChange={(e) => setQModel(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 w-full lg:w-48">
              <Label className="text-xs">Categoria</Label>
              <Select
                value={filterCategoryModel || '__all'}
                onValueChange={(v) => setFilterCategoryModel(v === '__all' ? '' : v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 w-full lg:w-44">
              <Label className="text-xs">Estado</Label>
              <Select
                value={filterActiveModel || '__all'}
                onValueChange={(v) => setFilterActiveModel(v === '__all' ? '' : (v as 'true' | 'false'))}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos</SelectItem>
                  <SelectItem value="true">Ativos</SelectItem>
                  <SelectItem value="false">Inativos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border">
            {loading && mainTab === 'model' ? (
              <div className="flex justify-center py-12 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Mensagens</TableHead>
                    <TableHead>Atualizado</TableHead>
                    <TableHead className="w-[140px] text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowsModel.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        Nenhum modelo ainda. Use &quot;Novo template&quot; para criar mensagens reutilizáveis para o chat e
                        Kanbam.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rowsModel.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell>{row.category_name}</TableCell>
                        <TableCell>
                          <Badge variant={row.is_active ? 'default' : 'secondary'}>
                            {row.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">{row.message_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(row.updated_at)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(row.id)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={duplicatingId === row.id}
                              title="Duplicar"
                              onClick={() => void handleDuplicate(row.id, 'model')}
                            >
                              {duplicatingId === row.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              disabled={!!row.seed_key}
                              title={row.seed_key ? 'Reservado ao sistema' : 'Eliminar'}
                              onClick={() => setDeleteId(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col gap-0 p-0 overflow-hidden">
          <SheetHeader className="px-6 pt-6 pb-2 space-y-1 text-left shrink-0">
            <SheetTitle>{editingId ? 'Editar template' : 'Novo template'}</SheetTitle>
            <SheetDescription>
              Defina a sequência de mensagens. O delay é aplicado antes de enviar cada item (0–3600 s).
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input className="h-9 text-sm" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            {editingId ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">Tipo do template</span>
                <Badge variant="secondary" className="text-xs font-normal">
                  {templateTypeLabel(formTemplateType)}
                </Badge>
                {formTemplateType === 'automatic' ? (
                  <span className="text-[10px] text-muted-foreground">
                    Automáticos são criados pelo sistema; pode editar mensagens e estado.
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Modelo criado pela empresa.</span>
                )}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                Novos templates são sempre do tipo <strong className="text-foreground">Modelo</strong> (reutilização
                pelo tenant). Os <strong className="text-foreground">Automáticos</strong> são instalados como padrão do
                sistema.
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecionar" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Textarea
                className="text-sm min-h-[60px]"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="tpl-active" className="text-xs cursor-pointer">
                Template ativo
              </Label>
              <Switch id="tpl-active" checked={formActive} onCheckedChange={setFormActive} />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Sequência de mensagens</Label>
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Mensagem
                </Button>
              </div>
              {PLACEHOLDER_HINT}
              <Accordion type="multiple" className="space-y-2">
                {formItems.map((it, index) => (
                  <AccordionItem value={`m-${index}`} key={index} className="border rounded-md px-2">
                    <AccordionTrigger className="text-sm py-2 hover:no-underline">
                      <span className="flex items-center gap-2">
                        Mensagem {index + 1}
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {messageTypeLabel(it.message_type)}
                        </Badge>
                        {it.delay_seconds > 0 ? (
                          <span className="text-[10px] text-muted-foreground">delay {it.delay_seconds}s</span>
                        ) : null}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-3 pb-3 pt-0">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === 0}
                          onClick={() => moveItem(index, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === formItems.length - 1}
                          onClick={() => moveItem(index, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive"
                          disabled={formItems.length <= 1}
                          onClick={() => removeItem(index)}
                        >
                          Remover
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tipo</Label>
                        <Select
                          value={it.message_type}
                          onValueChange={(v) => {
                            const mt = v as TemplateMessageType;
                            updateItem(index, {
                              message_type: mt,
                              content: mt === 'text' ? it.content || '' : null,
                              media_url: mt === 'image' || mt === 'document' ? it.media_url || null : null,
                              storage_provider:
                                mt === 'image' || mt === 'document' ? it.storage_provider ?? null : null,
                              storage_path: mt === 'image' || mt === 'document' ? it.storage_path ?? null : null,
                              original_filename:
                                mt === 'image' || mt === 'document' ? it.original_filename ?? null : null,
                              mime_type: mt === 'image' || mt === 'document' ? it.mime_type ?? null : null,
                              file_size_bytes:
                                mt === 'image' || mt === 'document' ? it.file_size_bytes ?? null : null,
                              image_width: mt === 'image' ? it.image_width ?? null : null,
                              image_height: mt === 'image' ? it.image_height ?? null : null,
                              caption: mt === 'image' || mt === 'document' ? it.caption : null,
                            });
                          }}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="image">Imagem</SelectItem>
                            <SelectItem value="document">Documento (PDF / ficheiro)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {it.message_type === 'text' ? (
                        <div className="space-y-1.5">
                          <Label className="text-xs">Conteúdo</Label>
                          <Textarea
                            className="text-sm min-h-[80px] font-mono text-xs"
                            value={it.content ?? ''}
                            onChange={(e) => updateItem(index, { content: e.target.value })}
                          />
                          <p className="text-[10px] text-muted-foreground">
                            Pré-visualização:{' '}
                            <span className="text-foreground whitespace-pre-wrap">
                              {renderMessageTemplate(it.content ?? '', PREVIEW_CTX) || '—'}
                            </span>
                          </p>
                        </div>
                      ) : it.message_type === 'image' ? (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Arquivo da imagem</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                                className="h-9 text-sm"
                                disabled={!!uploadingByIndex[index]}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.currentTarget.value = '';
                                  if (!file) return;
                                  void handleItemFileUpload(index, file, 'image');
                                }}
                              />
                              {it.storage_path || it.media_url ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => clearItemFile(index)}
                                  title="Remover ficheiro"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            {uploadingByIndex[index] ? (
                              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                A enviar imagem…
                              </p>
                            ) : it.original_filename ? (
                              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <Upload className="h-3.5 w-3.5" />
                                {it.original_filename} ({formatBytes(it.file_size_bytes)})
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Legenda (opcional)</Label>
                            <Textarea
                              className="text-sm min-h-[50px]"
                              value={it.caption ?? ''}
                              onChange={(e) => updateItem(index, { caption: e.target.value })}
                            />
                          </div>
                          {it.media_url?.trim() ? (
                            <div className="rounded-md border p-2 bg-muted/20">
                              <img
                                src={it.media_url}
                                alt=""
                                className="max-h-40 w-auto object-contain mx-auto"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Arquivo do documento (PDF)</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                type="file"
                                accept="application/pdf"
                                className="h-9 text-sm"
                                disabled={!!uploadingByIndex[index]}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  e.currentTarget.value = '';
                                  if (!file) return;
                                  void handleItemFileUpload(index, file, 'document');
                                }}
                              />
                              {it.storage_path || it.media_url ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => clearItemFile(index)}
                                  title="Remover ficheiro"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            {uploadingByIndex[index] ? (
                              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                A enviar documento…
                              </p>
                            ) : it.original_filename ? (
                              <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                                <Upload className="h-3.5 w-3.5" />
                                {it.original_filename} ({formatBytes(it.file_size_bytes)})
                              </p>
                            ) : null}
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Texto / legenda (opcional)</Label>
                            <Textarea
                              className="text-sm min-h-[50px]"
                              value={it.caption ?? ''}
                              onChange={(e) => updateItem(index, { caption: e.target.value })}
                            />
                          </div>
                          {it.media_url?.trim() ? (
                            <div className="rounded-md border p-2 bg-muted/20 flex items-center gap-2 text-sm">
                              <FileText className="h-8 w-8 shrink-0 text-muted-foreground" />
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {it.original_filename || fileNameFromUrl(it.media_url)}
                                </p>
                                <a
                                  href={it.media_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-primary hover:underline truncate block"
                                >
                                  Abrir ficheiro
                                </a>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <Label className="text-xs">Delay antes desta mensagem (segundos)</Label>
                        <Input
                          type="number"
                          min={0}
                          max={3600}
                          className="h-9 text-sm w-32"
                          value={it.delay_seconds}
                          onChange={(e) =>
                            updateItem(index, { delay_seconds: Math.min(3600, Math.max(0, Number(e.target.value) || 0)) })
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">0 = envio imediato após o passo anterior.</p>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
          <SheetFooter className="px-6 py-4 border-t shrink-0 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSaveTemplate()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog
        open={catDialogOpen}
        onOpenChange={(o) => {
          setCatDialogOpen(o);
          if (!o) setCatEditId(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{catEditId ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>Organize templates por contexto (ex.: Atendimento, Pagamento).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input className="h-9" value={catName} onChange={(e) => setCatName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cor (opcional)</Label>
              <div className="flex gap-2 items-center">
                <Input
                  type="color"
                  className={cn('h-9 w-14 p-1 cursor-pointer')}
                  value={catColor || '#0ea5e9'}
                  onChange={(e) => setCatColor(e.target.value)}
                />
                <Input
                  className="h-9 flex-1 text-sm"
                  placeholder="#hex ou vazio"
                  value={catColor}
                  onChange={(e) => setCatColor(e.target.value)}
                />
              </div>
            </div>
            {catEditId ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="cat-active" className="text-xs cursor-pointer">
                  Categoria ativa
                </Label>
                <Switch id="cat-active" checked={catActive} onCheckedChange={setCatActive} />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCatDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void handleSaveCategory()} disabled={catSaving}>
              {catSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : catEditId ? 'Guardar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!catDeleteId} onOpenChange={(o) => !o && setCatDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              Só é possível se não existirem templates nesta categoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => void handleDeleteCategory()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar template?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void handleDelete()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
