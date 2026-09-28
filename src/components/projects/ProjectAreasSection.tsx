import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getProjectAreaUrl } from "@/lib/projectRoutes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Boxes, Plus, Settings, Trash2, ArrowRight, CheckCircle2, ListTodo, Users } from "lucide-react";
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
  open?: number;
  overdue?: number;
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
  /** Query de versão (ex.: versionMode=version&versionId=...) para manter filtro ao abrir área. */
  versionQuery?: string;
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
  versionQuery,
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
  const isAdvanced = projectType === "advanced";

  if (!hasAreas(projectType)) return null;

  const openAreaPanel = (area: ProjectArea) => {
    const params = Object.fromEntries(new URLSearchParams(versionQuery));
    navigate(getProjectAreaUrl(projectId, area.id, params));
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
      <div className={isAdvanced ? "mb-3 rounded-2xl border border-border/60 bg-card/60 p-3 shadow-sm md:p-4" : "mb-6 rounded-2xl border border-border/70 bg-card/80 p-4 shadow-sm md:p-5"}>
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Boxes className="h-4 w-4" />
              </span>
              <div>
                <h3 className={isAdvanced ? "text-base font-semibold" : "text-lg font-semibold"}>Áreas do projeto</h3>
                <p className={isAdvanced ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
                  As áreas são compartilhadas entre versões. As tarefas exibidas pertencem à versão selecionada.
                </p>
              </div>
            </div>
          </div>
          <Button type="button" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Nova área
          </Button>
        </div>
        {areas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <Boxes className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 font-medium">Nenhuma área cadastrada</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Adicione áreas para organizar times, domínios ou frentes de entrega.
            </p>
          </div>
        ) : (
          <div className={isAdvanced ? "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"}>
            {areas.map((area) => {
              const progress = getProgress(area.id);
              const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
              const open = progress.open ?? Math.max(progress.total - progress.completed, 0);
              const overdue = progress.overdue ?? 0;
              const primaryResponsible = area.responsible_ids?.[0]
                ? members.find((member) => member.id === area.responsible_ids?.[0])
                : null;
              return (
                <Card
                  key={area.id}
                  role={isAdvanced ? "button" : undefined}
                  tabIndex={isAdvanced ? 0 : undefined}
                  onClick={isAdvanced ? () => openAreaPanel(area) : undefined}
                  onKeyDown={
                    isAdvanced
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAreaPanel(area);
                          }
                        }
                      : undefined
                  }
                  className={
                    isAdvanced
                      ? "group flex min-h-[168px] cursor-pointer flex-col overflow-hidden border-border/70 bg-background/70 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_12px_30px_-22px_hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      : "group flex min-h-[210px] flex-col overflow-hidden border-border/70 bg-background/70 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  }
                >
                  <CardHeader className={isAdvanced ? "pb-1.5" : "pb-2"}>
                    <div className="flex items-start justify-between gap-2">
                      <div className={isAdvanced ? "min-w-0 space-y-1" : "flex items-start gap-3"}>
                        {!isAdvanced ? (
                          <span className="rounded-lg bg-muted p-2 text-muted-foreground">
                            <Boxes className="h-4 w-4" />
                          </span>
                        ) : null}
                        <div className="min-w-0">
                          <h4 className={isAdvanced ? "truncate text-base font-semibold leading-tight" : "font-semibold leading-tight"}>{area.name}</h4>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {primaryResponsible?.name || primaryResponsible?.email || "Sem responsável"} • {progress.total} {progress.total === 1 ? "tarefa" : "tarefas"} • área ativa
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 opacity-80 transition-opacity group-hover:opacity-100"
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
                  <CardContent className={isAdvanced ? "flex flex-1 flex-col gap-2.5 pt-0" : "flex flex-1 flex-col gap-3 pt-0"}>
                    <div className="space-y-1.5">
                      {!isAdvanced ? (
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
                      ) : null}
                      <Progress value={percent} className={isAdvanced ? "h-1.5 rounded-full [&>div]:transition-all [&>div]:duration-700" : "h-2"} />
                    </div>
                    {isAdvanced ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{progress.completed} concluída{progress.completed !== 1 ? "s" : ""}</span>
                        <span>{open} aberta{open !== 1 ? "s" : ""}</span>
                        <span>{overdue} atrasada{overdue !== 1 ? "s" : ""}</span>
                      </div>
                    ) : null}
                    {!isAdvanced && area.responsible_ids && area.responsible_ids.length > 0 ? (
                      <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                        {area.responsible_ids.slice(0, 3).map((id) => {
                          const member = members.find((m) => m.id === id);
                          return (
                            <span key={id} className="rounded-full bg-muted px-2 py-0.5">
                              {member?.name || member?.email || "Responsável"}
                            </span>
                          );
                        })}
                      </div>
                    ) : null}
                    {!isAdvanced ? (
                      <Button
                        className="mt-auto w-full"
                        variant="secondary"
                        size="sm"
                        onClick={() => openAreaPanel(area)}
                      >
                        Abrir área
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    ) : null}
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
