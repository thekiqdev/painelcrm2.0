import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Settings, Trash2, ArrowRight, CheckCircle2, ListTodo, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
import { ProjectArea } from "./types";
import { hasAreas } from "@/lib/projectFeatures";
import { Member } from "@/components/shared/types";
import { Checkbox } from "@/components/ui/checkbox";

export interface AreaProgress {
  total: number;
  completed: number;
}

export interface AreaTeam {
  id: string;
  name: string;
}

interface ProjectAreasSectionProps {
  projectType?: string | null;
  projectId: string;
  areas: ProjectArea[];
  areaProgress?: Record<string, AreaProgress>;
  /** Membros da empresa (na configuração da área serão filtrados pelos que estão no projeto). */
  members?: Member[];
  /** Equipes da empresa (na configuração da área serão filtradas pelas que estão no projeto). */
  teams?: AreaTeam[];
  /** IDs dos responsáveis selecionados no projeto; só esses aparecem na seleção da área. */
  projectResponsibleIds?: string[];
  /** IDs das equipes selecionadas no projeto; só essas aparecem na seleção da área. */
  projectTeamIds?: string[];
  onAreasChange: (areas: ProjectArea[]) => void;
  onCreateArea: (name: string) => Promise<ProjectArea>;
  onUpdateArea: (areaId: string, data: { name: string; responsible_ids?: string[]; team_ids?: string[] }) => Promise<ProjectArea>;
  onDeleteArea: (areaId: string) => Promise<void>;
}

export function ProjectAreasSection({
  projectType,
  projectId,
  areas,
  areaProgress = {},
  members = [],
  teams = [],
  projectResponsibleIds = [],
  projectTeamIds = [],
  onAreasChange,
  onCreateArea,
  onUpdateArea,
  onDeleteArea,
}: ProjectAreasSectionProps) {
  const membersInProject = projectResponsibleIds.length > 0
    ? members.filter((m) => projectResponsibleIds.includes(m.id))
    : members;
  const teamsInProject = projectTeamIds.length > 0
    ? teams.filter((t) => projectTeamIds.includes(t.id))
    : teams;
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<ProjectArea | null>(null);
  const [areaName, setAreaName] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  if (!hasAreas(projectType)) return null;

  const openAreaPanel = (area: ProjectArea) => {
    navigate(`/projects/${projectId}/area/${area.id}`);
  };

  const getProgress = (areaId: string): AreaProgress => {
    return areaProgress[areaId] ?? { total: 0, completed: 0 };
  };

  const handleOpenCreate = () => {
    setEditingArea(null);
    setAreaName("");
    setDialogOpen(true);
  };

  const handleOpenSettings = (area: ProjectArea) => {
    setEditingArea(area);
    setAreaName(area.name);
    setResponsibleIds(area.responsible_ids ?? []);
    setTeamIds(area.team_ids ?? []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const name = areaName.trim();
    if (!name) return;
    setSaving(true);
    try {
      if (editingArea) {
        const updated = await onUpdateArea(editingArea.id, {
          name,
          responsible_ids: responsibleIds,
          team_ids: teamIds,
        });
        onAreasChange(
          areas.map((a) => (a.id === updated.id ? { ...a, ...updated } : a))
        );
      } else {
        const created = await onCreateArea(name);
        onAreasChange([...areas, created]);
      }
      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleResponsible = (memberId: string) => {
    setResponsibleIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const toggleTeam = (tid: string) => {
    setTeamIds((prev) =>
      prev.includes(tid) ? prev.filter((id) => id !== tid) : [...prev, tid]
    );
  };

  const handleDelete = async (area: ProjectArea) => {
    if (!window.confirm(`Excluir a área "${area.name}"?`)) return;
    try {
      await onDeleteArea(area.id);
      onAreasChange(areas.filter((a) => a.id !== area.id));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="mb-6 rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Áreas do projeto</h3>
          <Button type="button" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova área
          </Button>
        </div>
        {areas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma área cadastrada. Adicione áreas para organizar times ou domínios.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {areas.map((area) => {
              const progress = getProgress(area.id);
              const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
              return (
                <Card
                  key={area.id}
                  className="group flex flex-col overflow-hidden transition-shadow hover:shadow-md"
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold leading-tight">{area.name}</h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSettings(area);
                        }}
                      >
                        <span className="sr-only">Configurações</span>
                        <Settings className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-3 pt-0">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <ListTodo className="h-3.5 w-3.5" />
                          {progress.total} {progress.total === 1 ? "tarefa" : "tarefas"}
                        </span>
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                          {progress.completed} concluída{progress.completed !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <Progress value={percent} className="h-2" />
                    </div>
                    <Button
                      className="mt-auto w-full"
                      variant="secondary"
                      size="sm"
                      onClick={() => openAreaPanel(area)}
                    >
                      Abrir área
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {editingArea ? "Configurações da área" : "Nova área"}
            </DialogTitle>
            <DialogDescription>
              {editingArea
                ? "Edite o título e os responsáveis que podem visualizar esta área."
                : "Adicione uma área para organizar o projeto (ex.: time, domínio)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="area-name">Título da área</Label>
              <Input
                id="area-name"
                value={areaName}
                onChange={(e) => setAreaName(e.target.value)}
                placeholder="Ex.: Frontend, Backend"
              />
            </div>
            {editingArea && (membersInProject.length > 0 || projectResponsibleIds.length === 0) && (
              <div className="grid gap-2">
                <Label>Responsáveis que podem visualizar a área</Label>
                {projectResponsibleIds.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                    {membersInProject.map((member) => (
                      <label
                        key={member.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={responsibleIds.includes(member.id)}
                          onCheckedChange={() => toggleResponsible(member.id)}
                        />
                        <span>{member.name || member.email || member.id}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Selecione responsáveis no projeto para poder atribuí-los às áreas.
                  </p>
                )}
              </div>
            )}
            {editingArea && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-1.5">
                  <Users className="h-4 w-4" />
                  Equipes que podem visualizar a área
                </Label>
                <div className="max-h-40 overflow-y-auto rounded-md border p-3 space-y-2">
                  {teamsInProject.length > 0 ? (
                    teamsInProject.map((team) => (
                      <label
                        key={team.id}
                        className="flex items-center gap-2 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={teamIds.includes(team.id)}
                          onCheckedChange={() => toggleTeam(team.id)}
                        />
                        <span>{team.name}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {projectTeamIds.length === 0
                        ? "Selecione equipes no projeto para poder atribuí-las às áreas."
                        : "Nenhuma equipe cadastrada. Adicione equipes em Configurações para poder atribuí-las à área."}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {editingArea && (
              <Button
                type="button"
                variant="destructive"
                className="mr-auto sm:mr-0 sm:order-first"
                onClick={() => {
                  if (!editingArea || !window.confirm(`Excluir a área "${editingArea.name}"?`)) return;
                  handleDelete(editingArea);
                  setDialogOpen(false);
                  setEditingArea(null);
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir área
              </Button>
            )}
            <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !areaName.trim()}>
                {editingArea ? "Salvar" : "Criar"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
