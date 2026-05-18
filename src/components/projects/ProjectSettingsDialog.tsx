import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SystemRichEditor } from "@/components/editor";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, X, DollarSign, Save, FileText, Trash2, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ProjectSettingsVersionsTab,
  type ProjectSettingsVersionsTabProps,
} from "@/components/projects/ProjectSettingsVersionsTab";
import { format } from "date-fns";
import { Project } from "./types";
import { Member } from "@/components/shared/types";
import { useToast } from "@/hooks/use-toast";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";

interface TeamOption {
  id: string;
  name: string;
}

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  members: Member[];
  teams?: TeamOption[];
  onSave: (updatedProject: Partial<Project>) => void;
  canDeleteProject?: boolean;
  onDeleteProject?: () => Promise<void>;
  versionsConfig?: ProjectSettingsVersionsTabProps;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  members,
  teams = [],
  onSave,
  canDeleteProject = false,
  onDeleteProject,
  versionsConfig,
}: ProjectSettingsDialogProps) {
  const showVersionsTab = Boolean(versionsConfig);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [projectName, setProjectName] = useState(project.name);
  const [projectDescription, setProjectDescription] = useState(project.description);
  const [projectStatus, setProjectStatus] = useState(project.status);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    project.dueDate ? new Date(project.dueDate) : undefined
  );
  const [ownerId, setOwnerId] = useState<string>(project.members[0]?.id || "");
  const [teamId, setTeamId] = useState<string | null>(project.team_id ?? null);
  const [projectTeamIds, setProjectTeamIds] = useState<string[]>(project.team_ids ?? (project.team_id ? [project.team_id] : []));

  useEffect(() => {
    if (open) {
      setProjectName(project.name);
      setProjectDescription(project.description);
      setProjectStatus(project.status);
      setDueDate(project.dueDate ? new Date(project.dueDate) : undefined);
      setTeamId(project.team_id ?? null);
      setProjectTeamIds(project.team_ids ?? (project.team_id ? [project.team_id] : []));
      const rids = project.responsible_ids ?? [];
      setProjectMembers(rids.length > 0 ? members.filter((m) => rids.includes(m.id)) : (project.members ?? []));
    }
  }, [open, project.id, project.name, project.description, project.status, project.dueDate, project.team_id, project.team_ids, project.responsible_ids, project.members, members]);

  // Team tab state
  const [projectMembers, setProjectMembers] = useState<Member[]>(project.members);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  
  // Budget tab state
  const [budget, setBudget] = useState<number>(0);
  const [billableByHour, setBillableByHour] = useState(false);
  const [defaultHourlyRate, setDefaultHourlyRate] = useState<number>(0);
  const [costCenter, setCostCenter] = useState("");

  const handleSave = () => {
    const responsibleIds = projectMembers.map((m) => m.id);
    const teamIds = projectTeamIds.length > 0 ? projectTeamIds : (teamId ? [teamId] : []);
    const updatedProject: Partial<Project> = {
      name: projectName,
      description: projectDescription,
      status: projectStatus,
      dueDate: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      members: projectMembers,
      team_id: teamIds[0] ?? teamId ?? undefined,
      responsible_ids: responsibleIds,
      team_ids: teamIds,
    };

    onSave(updatedProject);
    toast({
      title: "Projeto atualizado",
      description: "As configurações do projeto foram salvas com sucesso.",
    });
  };

  const handleAddMember = (memberId: string) => {
    const member = members.find(m => m.id === memberId);
    if (member && !projectMembers.find(m => m.id === memberId)) {
      setProjectMembers([...projectMembers, member]);
    }
  };

  const handleRemoveMember = (memberId: string) => {
    setProjectMembers(projectMembers.filter(m => m.id !== memberId));
  };

  const handleSetMemberRole = (memberId: string, role: string) => {
    setMemberRoles({ ...memberRoles, [memberId]: role });
  };

  const handleAddTeam = (tid: string) => {
    if (tid && !projectTeamIds.includes(tid)) setProjectTeamIds([...projectTeamIds, tid]);
  };

  const handleRemoveTeam = (tid: string) => {
    setProjectTeamIds(projectTeamIds.filter((id) => id !== tid));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do Projeto</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-muted p-1">
              <TabsTrigger value="general" className="flex-shrink-0">Geral</TabsTrigger>
              {showVersionsTab ? (
                <TabsTrigger value="versions" className="flex-shrink-0 gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" />
                  Versões
                </TabsTrigger>
              ) : null}
              <TabsTrigger value="team" className="flex-shrink-0">Equipe</TabsTrigger>
              <TabsTrigger value="budget" className="flex-shrink-0">Orçamento</TabsTrigger>
              <TabsTrigger value="actions" className="flex-shrink-0">Ações</TabsTrigger>
            </TabsList>

            {/* TAB: GERAL */}
            <TabsContent value="general" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="projectName">Nome do Projeto *</Label>
                <Input
                  id="projectName"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Nome do projeto"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="projectDescription">Descrição</Label>
                <SystemRichEditor
                  id="projectDescription"
                  value={projectDescription ?? ""}
                  onChange={setProjectDescription}
                  placeholder="Descrição do projeto"
                  className="min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="projectStatus">Status</Label>
                  <Select value={projectStatus} onValueChange={setProjectStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="on-hold">Em Espera</SelectItem>
                      <SelectItem value="completed">Concluído</SelectItem>
                      <SelectItem value="cancelled">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Data de Entrega</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dueDate ? format(dueDate, "dd/MM/yyyy") : <span>Selecionar data</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dueDate}
                        onSelect={setDueDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner">Responsável (Owner)</Label>
                <Select value={ownerId} onValueChange={setOwnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {teams.length > 0 && (
                <div className="space-y-2">
                  <Label>Equipe responsável</Label>
                  <Select value={teamId ?? "none"} onValueChange={(v) => setTeamId(v === "none" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Nenhuma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {teams.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </TabsContent>

            {/* TAB: EQUIPE */}
            <TabsContent value="team" className="space-y-6">
              <p className="text-sm text-muted-foreground">
                Apenas os membros e as equipes listados abaixo poderão ver e acessar este projeto.
              </p>

              <div className="space-y-2">
                <Label>Membros do projeto</Label>
                <Select onValueChange={handleAddMember}>
                  <SelectTrigger>
                    <SelectValue placeholder="Adicionar membro" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter(m => !projectMembers.find(pm => pm.id === m.id)).map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-md border divide-y">
                  {projectMembers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhum membro. Adicione para que possam acessar o projeto.
                    </div>
                  ) : (
                    projectMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar} />
                            <AvatarFallback>{member.name?.charAt(0) ?? "?"}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{member.name}</p>
                            <p className="text-xs text-muted-foreground">{member.email ?? member.role}</p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => handleRemoveMember(member.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Equipes do projeto</Label>
                <Select onValueChange={handleAddTeam}>
                  <SelectTrigger>
                    <SelectValue placeholder="Adicionar equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.filter(t => !projectTeamIds.includes(t.id)).map(team => (
                      <SelectItem key={team.id} value={team.id}>
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-md border divide-y">
                  {projectTeamIds.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Nenhuma equipe. Adicione para que os membros da equipe possam acessar o projeto.
                    </div>
                  ) : (
                    projectTeamIds.map(tid => {
                      const team = teams.find(t => t.id === tid);
                      return (
                        <div key={tid} className="flex items-center justify-between p-3">
                          <span className="text-sm font-medium">{team?.name ?? tid}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => handleRemoveTeam(tid)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </TabsContent>

            {/* TAB: ORÇAMENTO */}
            <TabsContent value="budget" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Orçamento Previsto (R$)</Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  value={budget}
                  onChange={(e) => setBudget(parseFloat(e.target.value))}
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="billableByHour">Cobrável por Hora</Label>
                  <p className="text-sm text-muted-foreground">
                    Ativar cobrança de horas trabalhadas
                  </p>
                </div>
                <Switch
                  id="billableByHour"
                  checked={billableByHour}
                  onCheckedChange={setBillableByHour}
                />
              </div>

              {billableByHour && (
                <div className="space-y-2 pl-4">
                  <Label htmlFor="hourlyRate">Taxa-Hora Padrão (R$)</Label>
                  <Input
                    id="hourlyRate"
                    type="number"
                    step="0.01"
                    value={defaultHourlyRate}
                    onChange={(e) => setDefaultHourlyRate(parseFloat(e.target.value))}
                    placeholder="0.00"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="costCenter">Centro de Custo (Opcional)</Label>
                <Select value={costCenter} onValueChange={setCostCenter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar centro de custo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="development">Desenvolvimento</SelectItem>
                    <SelectItem value="design">Design</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="operations">Operações</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="p-4 border rounded-lg bg-muted/50">
                <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Resumo Financeiro
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Orçamento:</span>
                    <span className="font-medium">R$ {budget.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horas Registradas:</span>
                    <span className="font-medium">0h</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Valor Cobrado:</span>
                    <span className="font-medium">R$ 0.00</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-muted-foreground">Disponível:</span>
                    <span className="font-medium text-green-600">R$ {budget.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </Button>
              </div>
            </TabsContent>

            {showVersionsTab && versionsConfig ? (
              <TabsContent value="versions" className="space-y-4">
                <ProjectSettingsVersionsTab {...versionsConfig} />
              </TabsContent>
            ) : null}

            {/* TAB: AÇÕES */}
            <TabsContent value="actions" className="space-y-4">
              <div className="space-y-4">
                <div className="p-6 border-2 border-dashed rounded-lg text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Salvar como Modelo</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Crie um modelo reutilizável a partir deste projeto. 
                    <br />
                    Etapas, tarefas e configurações serão convertidas em um template.
                  </p>
                  <Button onClick={() => setSaveAsTemplateOpen(true)} size="lg">
                    <FileText className="h-4 w-4 mr-2" />
                    Salvar como Modelo
                  </Button>
                </div>

                <div className="p-4 border rounded-lg bg-muted/30">
                  <h4 className="text-sm font-semibold mb-2">Informações</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Datas serão convertidas em offsets relativos</li>
                    <li>Responsáveis podem ser substituídos por papéis genéricos</li>
                    <li>Anexos e comentários podem ser opcionalmente removidos</li>
                    <li>O modelo ficará disponível em Templates de Projeto</li>
                  </ul>
                </div>

                {canDeleteProject && onDeleteProject && (
                  <div className="p-4 border border-destructive/50 rounded-lg bg-destructive/5">
                    <h4 className="text-sm font-semibold mb-2 text-destructive">Zona de perigo</h4>
                    <p className="text-sm text-muted-foreground mb-3">
                      Excluir o projeto removerá permanentemente todas as etapas, tarefas e dados associados. Esta ação não pode ser desfeita.
                    </p>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={deleting}
                      onClick={async () => {
                        if (!window.confirm("Tem certeza que deseja excluir este projeto? Todas as etapas, tarefas e dados serão removidos permanentemente.")) return;
                        setDeleting(true);
                        try {
                          await onDeleteProject();
                          onOpenChange(false);
                        } catch (e) {
                          toast({
                            title: "Erro ao excluir",
                            description: e instanceof Error ? e.message : "Não foi possível excluir o projeto.",
                            variant: "destructive",
                          });
                        } finally {
                          setDeleting(false);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {deleting ? "Excluindo…" : "Excluir projeto"}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <SaveAsTemplateDialog
        open={saveAsTemplateOpen}
        onOpenChange={setSaveAsTemplateOpen}
        project={project}
      />
    </>
  );
}