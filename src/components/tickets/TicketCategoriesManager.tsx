import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
      if (ensureSupportCategory && canManage && !list.some((category) => category.name.trim().toLowerCase() === 'suporte')) {
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
      publishCategories([...categories, created]);
      setName('');
      toast.success('Categoria criada');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar categoria');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-5 w-5 text-primary" />
          Categorias de tickets
        </CardTitle>
        <CardDescription>
          Organize os chamados por tipo de atendimento. As categorias aparecem no chat, tickets e suporte público.
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
              />
            </div>
            <Button type="button" onClick={createCategory} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
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
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <Badge key={category.id} variant="secondary" className="rounded-full px-3 py-1">
                {category.name}
              </Badge>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            Nenhuma categoria cadastrada. Crie a primeira categoria para abrir tickets.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
