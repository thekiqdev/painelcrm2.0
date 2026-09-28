import { useCallback, useEffect, useState } from 'react';
import { Loader2, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ticketsService } from '@/services/tickets';
import type { TicketCategory } from '@/types/tickets';
import { toast } from '@/components/ui/sonner';

type TicketCategoriesManagerProps = {
  canManage?: boolean;
  ensureSupportCategory?: boolean;
  onCategoriesChange?: (categories: TicketCategory[]) => void;
};

export function TicketCategoriesManager({
  canManage = true,
  ensureSupportCategory = false,
  onCategoriesChange,
}: TicketCategoriesManagerProps) {
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleting, setDeleting] = useState<TicketCategory | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const publishCategories = useCallback(
    (next: TicketCategory[]) => {
      setCategories(next);
      onCategoriesChange?.(next);
    },
    [onCategoriesChange],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ticketsService.getTicketCategories();
      publishCategories(list);
      if (
        ensureSupportCategory &&
        canManage &&
        !list.some((category) => category.name.trim().toLowerCase() === 'suporte')
      ) {
        const created = await ticketsService.createTicketCategory({
          name: 'Suporte',
          description: 'Categoria padrão para chamados de suporte.',
          color: '#2563eb',
        });
        publishCategories([...list, created]);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  }, [canManage, ensureSupportCategory, publishCategories]);

  useEffect(() => {
    void load();
  }, [load]);

  const createCategory = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Informe o nome da categoria.');
      return;
    }
    if (categories.some((category) => category.name.trim().toLowerCase() === trimmed.toLowerCase())) {
      toast.error('Já existe uma categoria com esse nome.');
      return;
    }

    setSaving(true);
    try {
      const created = await ticketsService.createTicketCategory({
        name: trimmed,
        description: undefined,
        color: '#2563eb',
      });
      publishCategories([...categories, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setName('');
      toast.success('Categoria criada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar categoria');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (category: TicketCategory) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error('Informe o nome da categoria.');
      return;
    }
    if (
      categories.some(
        (c) => c.id !== editingId && c.name.trim().toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      toast.error('Já existe uma categoria com esse nome.');
      return;
    }

    setSaving(true);
    try {
      const updated = await ticketsService.updateTicketCategory(editingId, { name: trimmed });
      publishCategories(
        categories
          .map((c) => (c.id === editingId ? updated : c))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      );
      cancelEdit();
      toast.success('Categoria atualizada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar categoria');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await ticketsService.deleteTicketCategory(deleting.id);
      publishCategories(categories.filter((c) => c.id !== deleting.id));
      if (editingId === deleting.id) cancelEdit();
      toast.success('Categoria excluída');
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir categoria');
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-primary" />
            Categorias de tickets
          </CardTitle>
          <CardDescription>
            Organize os chamados por tipo de atendimento. As categorias aparecem no chat, tickets,
            chatbot e suporte público.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canManage ? (
            <div className="grid gap-3 rounded-xl border bg-muted/20 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="ticket-category-name">Nova categoria</Label>
                <Input
                  id="ticket-category-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ex.: Suporte, Financeiro, Técnico"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void createCategory();
                    }
                  }}
                />
              </div>
              <Button type="button" onClick={() => void createCategory()} disabled={saving}>
                {saving && !editingId ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Adicionar
              </Button>
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando categorias...
            </div>
          ) : categories.length > 0 ? (
            <ul className="divide-y rounded-xl border">
              {categories.map((category) => {
                const isEditing = editingId === category.id;
                return (
                  <li
                    key={category.id}
                    className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {isEditing ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        disabled={saving}
                        className="sm:max-w-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void saveEdit();
                          }
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color || '#2563eb' }}
                          aria-hidden
                        />
                        <span className="truncate font-medium text-sm">{category.name}</span>
                      </div>
                    )}
                    {canManage ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isEditing ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={saving}
                              onClick={() => void saveEdit()}
                            >
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={saving}
                              onClick={cancelEdit}
                            >
                              Cancelar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2"
                              onClick={() => startEdit(category)}
                              title="Renomear"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="sr-only">Renomear</span>
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-destructive hover:text-destructive"
                              onClick={() => setDeleting(category)}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="sr-only">Excluir</span>
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma categoria cadastrada. Crie a primeira categoria para abrir tickets.
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open && !deletingBusy) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              A categoria <strong>{deleting?.name}</strong> será removida. Chamados que a usavam
              ficam sem categoria (não são apagados).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBusy}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingBusy}
              onClick={() => void confirmDelete()}
            >
              {deletingBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Excluir
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
