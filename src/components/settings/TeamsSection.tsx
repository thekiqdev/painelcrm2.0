import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Users2 } from "lucide-react";
import { toast } from "sonner";
import { SettingsSectionProps } from "./types";
import { teamsService, type Team, type TeamMember } from "@/services/teams";
import { getMyTenantUsers } from "@/services/tenantLimits";

export const TeamsSection: React.FC<SettingsSectionProps> = () => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [tenantUsers, setTenantUsers] = useState<{ id: string; email: string; full_name: string | null }[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadTeams = async () => {
    try {
      const data = await teamsService.getTeams();
      setTeams(data);
      if (selectedTeam && !data.find((t) => t.id === selectedTeam.id)) {
        setSelectedTeam(null);
        setMembers([]);
      } else if (selectedTeam) {
        const m = await teamsService.getTeamMembers(selectedTeam.id);
        setMembers(m);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao carregar equipes");
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadTeams(), getMyTenantUsers().catch(() => [])]).then(([, users]) => {
      setTenantUsers(users);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedTeam) {
      setMembers([]);
      return;
    }
    teamsService
      .getTeamMembers(selectedTeam.id)
      .then(setMembers)
      .catch((err) => toast.error(err?.message ?? "Erro ao carregar membros"));
  }, [selectedTeam?.id]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const team = await teamsService.createTeam({
        name: newName.trim(),
        description: newDescription.trim() || null,
      });
      setTeams((prev) => [...prev, team]);
      setNewName("");
      setNewDescription("");
      setAddDialogOpen(false);
      toast.success("Equipe criada");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao criar equipe");
    }
  };

  const openEdit = (team: Team) => {
    setEditingTeam(team);
    setEditName(team.name);
    setEditDescription(team.description ?? "");
    setEditDialogOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeam || !editName.trim()) return;
    try {
      const updated = await teamsService.updateTeam(editingTeam.id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
      });
      setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (selectedTeam?.id === updated.id) setSelectedTeam(updated);
      setEditDialogOpen(false);
      setEditingTeam(null);
      toast.success("Equipe atualizada");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao atualizar equipe");
    }
  };

  const handleDelete = async (team: Team) => {
    if (!confirm(`Excluir a equipe "${team.name}"?`)) return;
    try {
      await teamsService.deleteTeam(team.id);
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
      if (selectedTeam?.id === team.id) {
        setSelectedTeam(null);
        setMembers([]);
      }
      toast.success("Equipe excluída");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao excluir equipe");
    }
  };

  const handleAddMember = async () => {
    if (!selectedTeam || !selectedUserId) return;
    try {
      await teamsService.addTeamMember(selectedTeam.id, {
        user_id: selectedUserId,
        role: "member",
      });
      const m = await teamsService.getTeamMembers(selectedTeam.id);
      setMembers(m);
      setAddMemberDialogOpen(false);
      setSelectedUserId(null);
      toast.success("Membro adicionado");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao adicionar membro");
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!selectedTeam) return;
    try {
      await teamsService.removeTeamMember(selectedTeam.id, memberId);
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Membro removido");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao remover membro");
    }
  };

  const displayUser = (u: { email: string; full_name: string | null }) =>
    (u.full_name && u.full_name.trim() ? u.full_name : u.email) || u.email;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Equipes</CardTitle>
        <CardDescription>
          Crie equipes (ex.: Comercial, Design) e atribua membros. As equipes podem ser usadas em projetos e para filtrar responsáveis em tarefas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Equipes</h3>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova equipe
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[100px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Nenhuma equipe cadastrada. Clique em &quot;Nova equipe&quot; para criar a primeira.
                  </TableCell>
                </TableRow>
              ) : (
                teams.map((team) => (
                  <TableRow
                    key={team.id}
                    className={selectedTeam?.id === team.id ? "bg-muted/50" : undefined}
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="font-medium text-left hover:underline"
                        onClick={() => setSelectedTeam(team)}
                      >
                        {team.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {team.description || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar equipe"
                          aria-label="Editar equipe"
                          onClick={() => openEdit(team)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir equipe"
                          aria-label="Excluir equipe"
                          onClick={() => handleDelete(team)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}

        {selectedTeam && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-medium flex items-center gap-2">
                <Users2 className="h-4 w-4" />
                Membros — {selectedTeam.name}
              </h3>
              <Button size="sm" variant="outline" onClick={() => setAddMemberDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar membro
              </Button>
            </div>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum membro nesta equipe. Use &quot;Adicionar membro&quot; para incluir usuários da conta.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {members.map((m) => (
                  <li key={m.id} className="flex justify-between items-center">
                    <span>{m.email ?? m.name ?? m.user_id}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleRemoveMember(m.id)}
                    >
                      Remover
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova equipe</DialogTitle>
              <DialogDescription>Informe o nome e, se quiser, uma descrição.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="newName">Nome</Label>
                <Input
                  id="newName"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex: Comercial, Design"
                  required
                />
              </div>
              <div>
                <Label htmlFor="newDesc">Descrição (opcional)</Label>
                <Input
                  id="newDesc"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Breve descrição da equipe"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">Criar</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Editar equipe</DialogTitle>
              <DialogDescription>Altere nome e descrição.</DialogDescription>
            </DialogHeader>
            {editingTeam && (
              <form onSubmit={handleUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="editName">Nome</Label>
                  <Input
                    id="editName"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="editDesc">Descrição (opcional)</Label>
                  <Input
                    id="editDesc"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar membro</DialogTitle>
              <DialogDescription>Escolha um usuário do tenant para adicionar à equipe.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={selectedUserId ?? ""} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {tenantUsers
                    .filter((u) => !members.some((m) => m.user_id === u.id))
                    .map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {displayUser(u)} ({u.email})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {tenantUsers.filter((u) => !members.some((m) => m.user_id === u.id)).length === 0 && (
                <p className="text-sm text-muted-foreground">Todos os usuários já estão nesta equipe.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAddMember} disabled={!selectedUserId}>
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};
