import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Member } from "@/components/shared/types";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { teamsService } from "@/services/teams";
import { TaskAdvancedFields, DEFAULT_TASK_ADVANCED_FORM_VALUE } from "@/components/tasks";

interface TeamOption {
  id: string;
  name: string;
}

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Member[];
  teams?: TeamOption[];
  onAddTask: (formData: FormData) => void;
  tagsInput: string[];
  setTagsInput: React.Dispatch<React.SetStateAction<string[]>>;
  newTagText: string;
  setNewTagText: React.Dispatch<React.SetStateAction<string>>;
}

interface Reminder {
  id: string;
  type: string;
  value: number;
  unit: string;
}

export function NewTaskDialog({
  open,
  onOpenChange,
  members,
  teams = [],
  onAddTask,
  tagsInput,
  setTagsInput,
  newTagText,
  setNewTagText
}: NewTaskDialogProps) {
  const { toast } = useToast();
  const [assigneeTeamFilter, setAssigneeTeamFilter] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!assigneeTeamFilter) {
      setTeamMembers([]);
      return;
    }
    teamsService.getTeamMembers(assigneeTeamFilter).then((list) => {
      setTeamMembers(list.map((m) => ({ id: m.user_id, name: m.name || m.email || m.user_id })));
    }).catch(() => setTeamMembers([]));
  }, [assigneeTeamFilter]);

  const assigneeOptions = assigneeTeamFilter && teamMembers.length > 0
    ? teamMembers
    : members.map((m) => ({ id: m.id, name: m.name }));

  // Basic fields
  const [description, setDescription] = useState("");
  const [dependencies, setDependencies] = useState<string[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  // Configurações avançadas (reutilizável TaskAdvancedFields)
  const [advancedFormValue, setAdvancedFormValue] = useState(DEFAULT_TASK_ADVANCED_FORM_VALUE);

  const addTag = () => {
    if (!newTagText.trim()) return;
    setTagsInput([...tagsInput, newTagText.trim()]);
    setNewTagText("");
  };

  const removeTag = (tagToRemove: string) => {
    setTagsInput(tagsInput.filter(tag => tag !== tagToRemove));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const adv = advancedFormValue;

    formData.append("tags", JSON.stringify(tagsInput));
    formData.append("dependencies", JSON.stringify(dependencies));
    formData.append("reminders", JSON.stringify(reminders));
    formData.append("description", description);

    if (adv.dueDate) formData.set("dueDate", format(adv.dueDate, "yyyy-MM-dd"));
    if (adv.startDate) formData.set("startDate", format(adv.startDate, "yyyy-MM-dd"));
    formData.set("startTime", adv.startTime || "");
    formData.set("endTime", adv.endTime || "");
    if (adv.estimatedEffortHours != null) formData.set("estimatedHours", String(adv.estimatedEffortHours));
    if (adv.estimatedStoryPoints != null) formData.set("storyPoints", String(adv.estimatedStoryPoints));
    formData.append("checklist", JSON.stringify(adv.checklist));
    formData.append("watchers", JSON.stringify(adv.watchers));
    formData.set("visibility", adv.visibility || "internal");
    formData.append("billable", adv.billable ? "1" : "0");
    formData.append("hasRecurrence", adv.hasRecurrence ? "1" : "0");
    formData.set("recurrenceType", adv.recurrenceType || "weekly");
    formData.set("meetingLocation", adv.meetingLocation || "");
    formData.set("meetingLink", adv.meetingLink || "");
    formData.set("severity", adv.severity || "");
    if (adv.hourlyRate != null) formData.set("hourlyRate", String(adv.hourlyRate));
    if (adv.budgetCap != null) formData.set("budgetCap", String(adv.budgetCap));
    adv.attachments.forEach((file, index) => {
      formData.append(`attachment_${index}`, file);
    });

    onAddTask(formData);
    resetForm();
    toast({ title: "Tarefa criada", description: "A tarefa foi criada com sucesso." });
  };

  const resetForm = () => {
    setTagsInput([]);
    setDescription("");
    setDependencies([]);
    setReminders([]);
    setAdvancedFormValue(DEFAULT_TASK_ADVANCED_FORM_VALUE);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Tarefa</DialogTitle>
          <DialogDescription>
            Preencha os campos básicos e avançados para criar uma tarefa completa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* SEÇÃO BÁSICA */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold">Informações Básicas</h3>
              
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input 
                  id="title" 
                  name="title" 
                  placeholder="Título da tarefa" 
                  required 
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrição</Label>
                <RichTextEditor 
                  value={description} 
                  onChange={setDescription}
                  placeholder="Detalhes da tarefa..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="taskType">Tipo</Label>
                  <Select name="taskType" defaultValue="task">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="task">Tarefa</SelectItem>
                      <SelectItem value="bug">Bug</SelectItem>
                      <SelectItem value="feature">Feature</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <Select name="priority" defaultValue="medium">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Baixa</SelectItem>
                      <SelectItem value="medium">Média</SelectItem>
                      <SelectItem value="high">Alta</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {teams.length > 0 && (
                <div className="space-y-2">
                  <Label>Filtrar responsáveis por equipe</Label>
                  <Select value={assigneeTeamFilter ?? "all"} onValueChange={(v) => setAssigneeTeamFilter(v === "all" ? null : v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas</SelectItem>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="assignee">Responsável</Label>
                <Select name="assignee">
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    {assigneeOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {tagsInput.map(tag => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                      <button 
                        type="button" 
                        className="ml-1 hover:text-destructive" 
                        onClick={() => removeTag(tag)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input 
                    placeholder="Adicionar tag" 
                    value={newTagText} 
                    onChange={(e) => setNewTagText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={addTag}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* SEÇÃO AVANÇADA - fechada por padrão ao iniciar a criação */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="advanced">
                <AccordionTrigger>
                  <span className="text-sm font-semibold">Configurações Avançadas</span>
                </AccordionTrigger>
                <AccordionContent>
                  <TaskAdvancedFields
                    value={advancedFormValue}
                    onChange={setAdvancedFormValue}
                    members={members.map((m) => ({ id: m.id, name: m.name }))}
                    mode="create"
                    idPrefix="newtask"
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <DialogFooter className="mt-6 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="secondary">
              Salvar e Criar Outra
            </Button>
            <Button type="submit">
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}