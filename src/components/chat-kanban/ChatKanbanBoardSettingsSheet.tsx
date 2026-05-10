import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from '@/components/ui/sonner';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { apiClient } from '@/integrations/api/client';
import {
  chatKanbanService,
  type ChatKanbanBoardVisibilityMode,
} from '@/services/chatKanban';
import { getMyTenantUsers, type TenantUser } from '@/services/tenantLimits';
type TeamRow = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string | null;
  onSaved?: () => void;
  /** Chamado após eliminar o quadro (ex.: refrescar listagem). */
  onDeleted?: () => void;
};

export function ChatKanbanBoardSettingsSheet({ open, onOpenChange, boardId, onSaved, onDeleted }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [visibilityMode, setVisibilityMode] = useState<ChatKanbanBoardVisibilityMode>('tenant_all');
  const [userIds, setUserIds] = useState<Set<string>>(() => new Set());
  const [teamIds, setTeamIds] = useState<Set<string>>(() => new Set());
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingBoard, setDeletingBoard] = useState(false);

  const loadData = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const [settings, users, teamsRes] = await Promise.all([
        chatKanbanService.getBoardSettings(boardId),
        getMyTenantUsers().catch(() => [] as TenantUser[]),
        apiClient.get<TeamRow[]>('/api/teams'),
      ]);
      const b = settings.board;
      setName(b.name ?? '');
      setDescription(b.description ?? '');
      setIsActive(b.is_active !== false);
      const vm =
        b.visibility_mode === 'restricted' ? 'restricted' : ('tenant_all' as ChatKanbanBoardVisibilityMode);
      setVisibilityMode(vm);
      setUserIds(new Set(settings.allowed_user_ids ?? []));
      setTeamIds(new Set(settings.allowed_team_ids ?? []));
      setTenantUsers(users);
      if (!teamsRes.error && Array.isArray(teamsRes.data)) {
        setTeams(teamsRes.data);
      } else {
        setTeams([]);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao carregar definições do quadro');
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }, [boardId, onOpenChange]);

  useEffect(() => {
    if (!open || !boardId) return;
    void loadData();
  }, [open, boardId, loadData]);

  const toggleUser = (id: string, checked: boolean) => {
    setUserIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const toggleTeam = (id: string, checked: boolean) => {
    setTeamIds((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const handleSave = async () => {
    if (!boardId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('O nome do quadro é obrigatório');
      return;
    }
    setSaving(true);
    try {
      const uids = [...userIds];
      const tids = [...teamIds];
      await chatKanbanService.patchBoard(boardId, {
        name: trimmed,
        description: description.trim() ? description.trim() : null,
        is_active: isActive,
        visibility_mode: visibilityMode,
        allowed_user_ids: visibilityMode === 'restricted' ? uids : [],
        allowed_team_ids: visibilityMode === 'restricted' ? tids : [],
      });
      toast.success('Definições do quadro guardadas');
      onOpenChange(false);
      onSaved?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBoard = async () => {
    if (!boardId) return;
    setDeletingBoard(true);
    try {
      await chatKanbanService.patchBoard(boardId, { is_active: false });
      await chatKanbanService.deleteBoard(boardId);
      toast.success('Quadro eliminado');
      setDeleteDialogOpen(false);
      onOpenChange(false);
      onDeleted?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao eliminar o quadro');
    } finally {
      setDeletingBoard(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col gap-0 p-0">
        <div className="p-6 pb-2">
          <SheetHeader>
            <SheetTitle>Configuração do quadro</SheetTitle>
            <SheetDescription>
              Nome, estado do quadro e quem pode ver este Kanban. Apenas o criador do quadro ou administrador da
              empresa pode alterar estas opções.
            </SheetDescription>
          </SheetHeader>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            A carregar…
          </div>
        ) : (
          <>
            <Tabs defaultValue="geral" className="flex flex-1 flex-col min-h-0 px-6">
              <TabsList className="grid w-full grid-cols-2 shrink-0">
                <TabsTrigger value="geral">Geral</TabsTrigger>
                <TabsTrigger value="perm">Permissões</TabsTrigger>
              </TabsList>
              <TabsContent value="geral" className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="kb-name">Nome do quadro</Label>
                  <Input id="kb-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="kb-desc">Descrição (opcional)</Label>
                  <Textarea
                    id="kb-desc"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={saving}
                    placeholder="Notas internas sobre o uso deste quadro…"
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="kb-active">Quadro ativo</Label>
                    <p className="text-xs text-muted-foreground">
                      Quadros inativos deixam de aparecer na lista para quem não é criador nem administrador.
                    </p>
                  </div>
                  <Switch id="kb-active" checked={isActive} onCheckedChange={setIsActive} disabled={saving} />
                </div>

                {!isActive ? (
                  <>
                    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminar este quadro?</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <span className="block">
                              Esta ação não pode ser desfeita. Todas as colunas e cartões deste Kanban serão
                              removidos. As conversas em WhatsApp não são apagadas.
                            </span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel type="button" disabled={deletingBoard}>
                            Cancelar
                          </AlertDialogCancel>
                          <button
                            type="button"
                            className={cn(buttonVariants({ variant: 'destructive' }))}
                            disabled={deletingBoard}
                            onClick={() => void handleDeleteBoard()}
                          >
                            {deletingBoard ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Eliminar permanentemente'
                            )}
                          </button>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <div className="rounded-lg border border-destructive/35 bg-destructive/[0.06] p-4 space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-destructive">Excluir quadro</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Com <strong>Quadro ativo</strong> desligado, pode eliminar este Kanban definitivamente (confirme
                          na janela seguinte).
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="gap-2"
                        disabled={saving || deletingBoard}
                        onClick={() => setDeleteDialogOpen(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir quadro permanentemente
                      </Button>
                    </div>
                  </>
                ) : null}
              </TabsContent>
              <TabsContent value="perm" className="flex min-h-0 flex-1 flex-col gap-4 py-4">
                <p className="text-sm text-muted-foreground">
                  Defina quem pode ver este quadro na listagem. Administradores da empresa e o criador do quadro
                  mantêm sempre acesso de gestão.
                </p>
                <RadioGroup
                  value={visibilityMode}
                  onValueChange={(v) => setVisibilityMode(v as ChatKanbanBoardVisibilityMode)}
                  className="space-y-3"
                  disabled={saving}
                >
                  <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                    <RadioGroupItem value="tenant_all" id="vis-all" className="mt-1" />
                    <Label htmlFor="vis-all" className="font-normal cursor-pointer leading-snug">
                      Visível para todos
                      <span className="block text-xs text-muted-foreground mt-1">
                        Qualquer utilizador com acesso ao Kanban vê este quadro (desde que o quadro esteja ativo).
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                    <RadioGroupItem value="restricted" id="vis-rest" className="mt-1" />
                    <Label htmlFor="vis-rest" className="font-normal cursor-pointer leading-snug">
                      Restrito a utilizadores e/ou equipes
                      <span className="block text-xs text-muted-foreground mt-1">
                        Apenas quem estiver nas listas abaixo (ou nas equipes escolhidas) vê o quadro, além de admins
                        e do criador.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>

                {visibilityMode === 'restricted' ? (
                  <div className="grid gap-4 sm:grid-cols-2 flex-1 min-h-0">
                    <div className="flex min-h-0 flex-col gap-2 border border-border/50 rounded-md p-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Utilizadores</Label>
                      <ScrollArea className="h-[200px] pr-2">
                        <div className="space-y-2">
                          {tenantUsers.map((u) => (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 text-sm cursor-pointer select-none"
                            >
                              <Checkbox
                                checked={userIds.has(u.id)}
                                onCheckedChange={(c) => toggleUser(u.id, c === true)}
                                disabled={saving}
                              />
                              <span className="truncate">
                                {u.full_name?.trim() || u.email}
                                {u.email && u.full_name?.trim() ? (
                                  <span className="text-muted-foreground text-xs block truncate">{u.email}</span>
                                ) : null}
                              </span>
                            </label>
                          ))}
                          {tenantUsers.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem utilizadores listados.</p>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>
                    <div className="flex min-h-0 flex-col gap-2 border border-border/50 rounded-md p-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">Equipes</Label>
                      <ScrollArea className="h-[200px] pr-2">
                        <div className="space-y-2">
                          {teams.map((t) => (
                            <label
                              key={t.id}
                              className="flex items-center gap-2 text-sm cursor-pointer select-none"
                            >
                              <Checkbox
                                checked={teamIds.has(t.id)}
                                onCheckedChange={(c) => toggleTeam(t.id, c === true)}
                                disabled={saving}
                              />
                              <span className="truncate">{t.name}</span>
                            </label>
                          ))}
                          {teams.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem equipes nesta empresa.</p>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>

            <SheetFooter className="border-t border-border/60 p-4 gap-2 sm:justify-end bg-background">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
