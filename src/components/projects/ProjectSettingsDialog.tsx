import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, X, DollarSign, Save, FileText } from "lucide-react";
import { format } from "date-fns";
import { Project } from "./types";
import { Member } from "@/components/shared/types";
import { useToast } from "@/hooks/use-toast";
import { SaveAsTemplateDialog } from "./SaveAsTemplateDialog";

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
  members: Member[];
  onSave: (updatedProject: Partial<Project>) => void;
}

export function ProjectSettingsDialog({
  open,
  onOpenChange,
  project,
  members,
  onSave,
}: ProjectSettingsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("general");
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);
  
  // General tab state
  const [projectName, setProjectName] = useState(project.name);
  const [projectDescription, setProjectDescription] = useState(project.description);
  const [projectStatus, setProjectStatus] = useState(project.status);
  const [dueDate, setDueDate] = useState<Date | undefined>(
    project.dueDate ? new Date(project.dueDate) : undefined
  );
  const [ownerId, setOwnerId] = useState<string>(project.members[0]?.id || "");
  
  // Team tab state
  const [projectMembers, setProjectMembers] = useState<Member[]>(project.members);
  const [memberRoles, setMemberRoles] = useState<Record<string, string>>({});
  
  // Budget tab state
  const [budget, setBudget] = useState<number>(0);
  const [billableByHour, setBillableByHour] = useState(false);
  const [defaultHourlyRate, setDefaultHourlyRate] = useState<number>(0);
  const [costCenter, setCostCenter] = useState("");

  const handleSave = () => {
    const updatedProject: Partial<Project> = {
      name: projectName,
      description: projectDescription,
      status: projectStatus,
      dueDate: dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined,
      members: projectMembers,
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurações do Projeto</DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">Geral</TabsTrigger>
              <TabsTrigger value="team">Equipe</TabsTrigger>
              <TabsTrigger value="budget">Orçamento</TabsTrigger>
              <TabsTrigger value="actions">Ações</TabsTrigger>
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
                <Textarea
                  id="projectDescription"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  placeholder="Descrição do projeto"
                  rows={3}
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
            <TabsContent value="team" className="space-y-4">
              <div className="space-y-2">
                <Label>Adicionar Membro</Label>
                <Select onValueChange={handleAddMember}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar membro" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.filter(m => !projectMembers.find(pm => pm.id === m.id)).map(member => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Membros do Projeto</Label>
                {projectMembers.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={member.avatar} />
                        <AvatarFallback>{member.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{member.name}</p>
                        <p className="text-xs text-muted-foreground">{member.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select
                        value={memberRoles[member.id] || "member"}
                        onValueChange={(value) => handleSetMemberRole(member.id, value)}
                      >
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="member">Membro</SelectItem>
                          <SelectItem value="viewer">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleRemoveMember(member.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {projectMembers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum membro adicionado ao projeto
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