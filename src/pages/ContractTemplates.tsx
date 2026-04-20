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
import { contractsService } from "@/services/contracts";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import type { ContractTemplate } from "@/types/contracts";

export default function ContractTemplates() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    try {
      setLoading(true);
      const data = await contractsService.getContractTemplates();
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

  const handleDelete = async (t: ContractTemplate) => {
    try {
      await contractsService.deleteContractTemplate(t.id);
      toast.success("Modelo excluído");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Não foi possível excluir";
      toast.error(msg);
    }
  };

  const toggleActive = async (t: ContractTemplate) => {
    try {
      await contractsService.updateContractTemplate(t.id, { is_active: !t.is_active });
      toast.success(t.is_active ? "Modelo desativado" : "Modelo ativado");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/contracts")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="h-7 w-7" />
              Modelos de contrato
            </h1>
            <p className="text-sm text-muted-foreground">
              Modelos reutilizáveis ao criar novos contratos. Criar e editar usam páginas dedicadas. Permissões no
              módulo Contratos; só o criador pode alterar quando a regra &quot;só próprios&quot; estiver ativa.
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/contracts/templates/new")}>
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
                  Nenhum modelo cadastrado. Crie um para usar em &quot;Novo contrato&quot;.
                </TableCell>
              </TableRow>
            ) : (
              templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description ? (
                      <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
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
                    {format(new Date(t.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="outline" size="sm" onClick={() => void toggleActive(t)}>
                      {t.is_active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/contracts/templates/${t.id}/edit`)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Excluir
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir modelo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Não é possível excluir se existir contrato vinculado a este modelo.
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
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
