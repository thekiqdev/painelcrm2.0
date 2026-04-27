import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { proposalTemplatesService, type ProposalTemplate } from "@/services/proposalTemplates";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";

export default function ProposalTemplates() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { canCreate, canEditRecord, canDeleteRecord, loading: permLoading } = useModulePermissions();
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await proposalTemplatesService.list();
      setTemplates(data);
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível carregar os modelos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const handleDelete = async (t: ProposalTemplate) => {
    if (!user?.id) return;
    if (!canDeleteRecord("proposals", t.user_id, user.id)) {
      toast.error("Sem permissão para excluir este modelo");
      return;
    }
    try {
      await proposalTemplatesService.delete(t.id);
      toast.success("Modelo excluído");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível excluir";
      toast.error(msg);
    }
  };

  const toggleActive = async (t: ProposalTemplate) => {
    if (!user?.id) return;
    if (!canEditRecord("proposals", t.user_id, user.id)) {
      toast.error("Sem permissão para alterar este modelo");
      return;
    }
    try {
      await proposalTemplatesService.update(t.id, { is_active: !t.is_active });
      toast.success(t.is_active ? "Modelo desativado" : "Modelo ativado");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    }
  };

  const canAdd = canCreate("proposals") && !permLoading;

  return (
    <div className="space-y-6">
      <div className="md:hidden sticky top-0 z-30 -mx-0.5 border-b border-border/70 bg-background/95 px-0.5 pb-2 pt-1 backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <MobilePageHeader
          title="Modelos"
          leading={
            <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => navigate("/proposals")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          }
          primaryAction={{
            icon: <Plus className="h-5 w-5" aria-hidden />,
            ariaLabel: "Novo modelo",
            onClick: () => {
              if (canAdd) navigate("/proposals/templates/new");
            },
            disabled: !canAdd,
          }}
        />
      </div>

      <div className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/proposals")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <FileText className="h-7 w-7" />
              Modelos de proposta
            </h1>
            <p className="text-sm text-muted-foreground">
              Modelos reutilizáveis para criar propostas no módulo e no Kanban do chat — entidade própria, separada
              de rascunhos. Configure cada coluna do Kanban para usar um destes modelos quando precisar de pré-preenchimento.
            </p>
          </div>
        </div>
        <Button disabled={!canAdd} onClick={() => navigate("/proposals/templates/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Novo modelo
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : templates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                  Nenhum modelo cadastrado. Crie um para usar na coluna do Kanban ou ao criar propostas.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => {
                const canEdit = user?.id ? canEditRecord("proposals", t.user_id, user.id) : false;
                const canDel = user?.id ? canDeleteRecord("proposals", t.user_id, user.id) : false;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <div className="font-medium">{t.name}</div>
                      {t.default_title ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          Título sugerido: {t.default_title}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {t.is_active ? (
                        <Badge className="bg-green-600">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.updated_at
                        ? format(new Date(t.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => void toggleActive(t)}
                      >
                        {t.is_active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canEdit}
                        onClick={() => navigate(`/proposals/templates/${t.id}/edit`)}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Editar
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" disabled={!canDel}>
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Excluir
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Colunas do Kanban que usam este modelo deixam de encontrá-lo; reconfigure a coluna se
                              necessário. Propostas já criadas não são apagadas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void handleDelete(t)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
