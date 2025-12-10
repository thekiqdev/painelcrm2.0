import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, FileText, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { SettingsSectionProps } from "./types";
import { messageTemplatesService, MessageTemplate, CreateMessageTemplateParams, ResourceTypesResponse } from "@/services/messageTemplates";

const RESOURCE_LABELS: Record<string, string> = {
  invoices: 'Faturas',
  contracts: 'Contratos',
  tasks: 'Tarefas',
  tickets: 'Tickets',
  projects: 'Projetos',
  project_tasks: 'Tarefas de Projeto',
  leads: 'Leads',
  clients: 'Clientes',
  proposals: 'Propostas',
  expenses: 'Despesas',
  funnels: 'Funis de Vendas',
  system: 'Sistema',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Criado',
  sent: 'Enviado',
  paid: 'Pago',
  overdue: 'Vencido',
  reminder_due_soon: 'Lembrete de Vencimento Próximo',
  reminder_overdue: 'Lembrete de Atraso',
  cancelled: 'Cancelado',
  updated: 'Atualizado',
  sent_for_signature: 'Enviado para Assinatura',
  signature_requested: 'Solicitação de Assinatura',
  partially_signed: 'Parcialmente Assinado',
  fully_signed: 'Totalmente Assinado',
  signed_by_client: 'Assinado pelo Cliente',
  signed_by_internal: 'Assinado Internamente',
  rejected: 'Rejeitado',
  expired: 'Expirado',
  renewed: 'Renovado',
  assigned: 'Atribuído',
  completed: 'Concluído',
  reopened: 'Reaberto',
  due_soon: 'Vencimento Próximo',
  commented: 'Comentado',
  status_changed: 'Status Alterado',
  priority_changed: 'Prioridade Alterada',
  new_message: 'Nova Mensagem',
  first_response: 'Primeira Resposta',
  resolved: 'Resolvido',
  closed: 'Fechado',
  sla_warning: 'Aviso de SLA',
  sla_breached: 'SLA Violado',
  escalated: 'Escalado',
  merged: 'Mesclado',
  started: 'Iniciado',
  paused: 'Pausado',
  resumed: 'Retomado',
  member_added: 'Membro Adicionado',
  member_removed: 'Membro Removido',
  milestone_reached: 'Marco Alcançado',
  deadline_approaching: 'Prazo se Aproximando',
  deadline_passed: 'Prazo Ultrapassado',
  moved: 'Movido',
  attachment_added: 'Anexo Adicionado',
  converted: 'Convertido',
  contacted: 'Contactado',
  qualified: 'Qualificado',
  lost: 'Perdido',
  note_added: 'Nota Adicionada',
  document_added: 'Documento Adicionado',
  contact_added: 'Contato Adicionado',
  archived: 'Arquivado',
  reactivated: 'Reativado',
  viewed: 'Visualizado',
  accepted: 'Aceito',
  reminder_sent: 'Lembrete Enviado',
  converted_to_contract: 'Convertido em Contrato',
  converted_to_invoice: 'Convertido em Fatura',
  approved: 'Aprovado',
  reimbursed: 'Reembolsado',
  stage_added: 'Estágio Adicionado',
  stage_updated: 'Estágio Atualizado',
  lead_moved: 'Lead Movido',
  conversion: 'Conversão',
  goal_reached: 'Meta Alcançada',
  user_registered: 'Usuário Registrado',
  password_reset: 'Redefinição de Senha',
  password_changed: 'Senha Alterada',
  email_verified: 'Email Verificado',
  account_activated: 'Conta Ativada',
  account_deactivated: 'Conta Desativada',
  backup_completed: 'Backup Concluído',
  system_maintenance: 'Manutenção do Sistema',
  security_alert: 'Alerta de Segurança',
};

export const MessageTemplatesSection: React.FC<SettingsSectionProps> = ({ handleSave }) => {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [resourceTypes, setResourceTypes] = useState<ResourceTypesResponse | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [formData, setFormData] = useState<CreateMessageTemplateParams>({
    name: '',
    resource_type: 'invoices',
    action: '',
    subject: '',
    body: '',
    is_active: true,
    variables: [],
  });
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // Carregar templates e tipos de recursos
  useEffect(() => {
    fetchTemplates();
    fetchResourceTypes();
  }, []);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const templatesData = await messageTemplatesService.list();
      setTemplates(templatesData || []);
    } catch (error: any) {
      console.error("Erro ao carregar modelos:", error);
      toast.error(error.message || "Erro ao carregar os modelos. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResourceTypes = async () => {
    try {
      const data = await messageTemplatesService.getResourceTypes();
      setResourceTypes(data);
      // Definir ações iniciais baseado no primeiro recurso
      if (data.actions.invoices) {
        setAvailableActions(data.actions.invoices);
        setFormData(prev => ({ ...prev, action: data.actions.invoices[0] || '' }));
      }
    } catch (error: any) {
      console.error("Erro ao carregar tipos de recursos:", error);
    }
  };

  const handleResourceTypeChange = (resourceType: string) => {
    const actions = resourceTypes?.actions[resourceType] || [];
    setAvailableActions(actions);
    setFormData(prev => ({
      ...prev,
      resource_type: resourceType as any,
      action: actions[0] || '',
    }));
  };

  const handleInitializePredefined = async () => {
    try {
      const result = await messageTemplatesService.initializePredefined();
      toast.success(`${result.message}. ${result.created} modelo(s) criado(s).`);
      fetchTemplates();
    } catch (error: any) {
      console.error("Erro ao inicializar modelos pré-definidos:", error);
      toast.error(`Erro: ${error.message}`);
    }
  };

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.body.trim() || !formData.action) {
      toast.error("Nome, ação e corpo da mensagem são obrigatórios");
      return;
    }

    try {
      const newTemplate = await messageTemplatesService.create(formData);
      setTemplates([...templates, newTemplate]);
      resetForm();
      setIsAddDialogOpen(false);
      toast.success("Modelo adicionado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao adicionar modelo:", error);
      toast.error(`Erro ao adicionar modelo: ${error.message}`);
    }
  };

  const handleEditTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingTemplate) return;

    if (!formData.name.trim() || !formData.body.trim() || !formData.action) {
      toast.error("Nome, ação e corpo da mensagem são obrigatórios");
      return;
    }

    try {
      const updatedTemplate = await messageTemplatesService.update(editingTemplate.id, formData);
      setTemplates(templates.map(t => 
        t.id === editingTemplate.id ? updatedTemplate : t
      ));
      resetForm();
      setEditingTemplate(null);
      setIsEditDialogOpen(false);
      toast.success("Modelo atualizado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar modelo:", error);
      toast.error(`Erro ao atualizar modelo: ${error.message}`);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await messageTemplatesService.delete(id);
      setTemplates(templates.filter(t => t.id !== id));
      toast.success("Modelo excluído com sucesso!");
    } catch (error: any) {
      console.error("Erro ao excluir modelo:", error);
      toast.error(`Erro ao excluir modelo: ${error.message}`);
    }
  };

  const handleToggleActive = async (template: MessageTemplate) => {
    try {
      const updatedTemplate = await messageTemplatesService.update(template.id, {
        is_active: !template.is_active,
      });
      setTemplates(templates.map(t => 
        t.id === template.id ? updatedTemplate : t
      ));
      toast.success(`Modelo ${updatedTemplate.is_active ? 'ativado' : 'desativado'} com sucesso!`);
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      toast.error(`Erro: ${error.message}`);
    }
  };

  const startEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    const resourceType = template.resource_type || (template as any).type?.split('_')[1] || 'invoices';
    const actions = resourceTypes?.actions[resourceType] || [];
    setAvailableActions(actions);
    
    setFormData({
      name: template.name,
      resource_type: resourceType as any,
      action: template.action || '',
      subject: template.subject || '',
      body: template.body,
      is_active: template.is_active,
      variables: template.variables || [],
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      resource_type: 'invoices',
      action: '',
      subject: '',
      body: '',
      is_active: true,
      variables: [],
    });
    if (resourceTypes?.actions.invoices) {
      setAvailableActions(resourceTypes.actions.invoices);
      setFormData(prev => ({ ...prev, action: resourceTypes.actions.invoices[0] || '' }));
    }
  };

  const getResourceLabel = (resourceType: string) => {
    return RESOURCE_LABELS[resourceType] || resourceType;
  };

  const getActionLabel = (action: string) => {
    return ACTION_LABELS[action] || action;
  };

  const predefinedTemplates = templates.filter(t => t.is_predefined);
  const customTemplates = templates.filter(t => !t.is_predefined);

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Modelos de Mensagens</CardTitle>
              <CardDescription>
                Gerencie modelos de mensagens para envio de notificações por email e WhatsApp
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {predefinedTemplates.length === 0 && (
                <Button type="button" variant="outline" onClick={handleInitializePredefined}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Inicializar Modelos Pré-definidos
                </Button>
              )}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button type="button" onClick={resetForm}>
                    <Plus className="mr-2 h-4 w-4" />
                    Novo Modelo
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Adicionar Modelo de Mensagem</DialogTitle>
                    <DialogDescription>
                      Crie um novo modelo personalizado para envio de mensagens
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleAddTemplate}>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Nome do Modelo *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          placeholder="Ex: Notificação de Nova Fatura"
                          required
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="resource_type">Tipo de Recurso *</Label>
                        <Select
                          value={formData.resource_type}
                          onValueChange={handleResourceTypeChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {resourceTypes?.resource_types.map(resource => (
                              <SelectItem key={resource} value={resource}>
                                {getResourceLabel(resource)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="action">Ação *</Label>
                        <Select
                          value={formData.action}
                          onValueChange={(value) => setFormData({ ...formData, action: value })}
                          disabled={availableActions.length === 0}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma ação" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableActions.map(action => (
                              <SelectItem key={action} value={action}>
                                {getActionLabel(action)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {availableActions.length === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Selecione primeiro um tipo de recurso
                          </p>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="subject">Assunto (para email)</Label>
                        <Input
                          id="subject"
                          value={formData.subject || ''}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          placeholder="Ex: Nova Fatura Disponível"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="body">Corpo da Mensagem *</Label>
                        <Textarea
                          id="body"
                          value={formData.body}
                          onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                          placeholder="Use {{variavel}} para variáveis dinâmicas. Ex: Olá {{client_name}}, sua fatura {{invoice_number}} está disponível."
                          rows={8}
                          required
                        />
                        <p className="text-xs text-muted-foreground">
                          Use variáveis no formato {'{{variavel}}'} que serão substituídas automaticamente
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="is_active"
                          checked={formData.is_active}
                          onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                        />
                        <Label htmlFor="is_active">Modelo ativo</Label>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit">Adicionar</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground">Carregando modelos...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Modelos Pré-definidos */}
              {predefinedTemplates.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Sparkles className="h-5 w-5" />
                    Modelos Pré-definidos
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {predefinedTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {getResourceLabel(template.resource_type || (template as any).type || '')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {getActionLabel(template.action || '')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={template.is_active}
                                onCheckedChange={() => handleToggleActive(template)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {template.is_active ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => startEditTemplate(template)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Modelos Personalizados */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Modelos Personalizados
                </h3>
                {customTemplates.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    Nenhum modelo personalizado cadastrado
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Recurso</TableHead>
                        <TableHead>Ação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">{template.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {getResourceLabel(template.resource_type || (template as any).type || '')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {getActionLabel(template.action || '')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={template.is_active}
                                onCheckedChange={() => handleToggleActive(template)}
                              />
                              <span className="text-sm text-muted-foreground">
                                {template.is_active ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="flex justify-end space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => startEditTemplate(template)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleDeleteTemplate(template.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          )}

          {/* Dialog para editar modelo */}
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar Modelo de Mensagem</DialogTitle>
                <DialogDescription>
                  {editingTemplate?.is_predefined && (
                    <span className="text-blue-600">
                      Este é um modelo pré-definido. Você pode personalizar o conteúdo conforme necessário.
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              {editingTemplate && (
                <form onSubmit={handleEditTemplate}>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="editName">Nome do Modelo *</Label>
                      <Input
                        id="editName"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editResourceType">Tipo de Recurso *</Label>
                      <Select
                        value={formData.resource_type}
                        onValueChange={handleResourceTypeChange}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {resourceTypes?.resource_types.map(resource => (
                            <SelectItem key={resource} value={resource}>
                              {getResourceLabel(resource)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editAction">Ação *</Label>
                      <Select
                        value={formData.action}
                        onValueChange={(value) => setFormData({ ...formData, action: value })}
                        disabled={availableActions.length === 0}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione uma ação" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableActions.map(action => (
                            <SelectItem key={action} value={action}>
                              {getActionLabel(action)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editSubject">Assunto (para email)</Label>
                      <Input
                        id="editSubject"
                        value={formData.subject || ''}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="editBody">Corpo da Mensagem *</Label>
                      <Textarea
                        id="editBody"
                        value={formData.body}
                        onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                        rows={8}
                        required
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="editIsActive"
                        checked={formData.is_active}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                      />
                      <Label htmlFor="editIsActive">Modelo ativo</Label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">Salvar</Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit">Salvar Configurações</Button>
      </div>
    </form>
  );
};
