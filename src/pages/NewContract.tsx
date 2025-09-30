import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  Plus,
  Save,
  Send,
  FileText,
  Users,
  DollarSign,
  GripVertical,
  Trash2,
  Eye,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import type { ContractTemplate, ContractSigner, SignerRole } from "@/types/contracts";

interface ContractFormData {
  title: string;
  client_id: string;
  responsible_id: string;
  template_id: string;
  content_html: string;
  start_date: Date | null;
  end_date: Date | null;
  auto_renew: boolean;
  renewal_period: string;
  total_value: string;
  currency: string;
  linked_proposal_id: string;
  linked_invoice_id: string;
  variables: Record<string, any>;
  signature_settings: {
    require_otp: boolean;
    require_terms: boolean;
    invitation_message: string;
  };
}

const NewContract = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<'select' | 'edit'>('select');
  const [selectedOption, setSelectedOption] = useState<'blank' | 'template'>('blank');
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [signers, setSigners] = useState<Omit<ContractSigner, 'id' | 'contract_id' | 'created_at' | 'signed_at' | 'signature_data'>[]>([]);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [clientSearchOpen, setClientSearchOpen] = useState(false);
  const [formData, setFormData] = useState<ContractFormData>({
    title: '',
    client_id: '',
    responsible_id: '',
    template_id: '',
    content_html: '',
    start_date: null,
    end_date: null,
    auto_renew: false,
    renewal_period: '12',
    total_value: '',
    currency: 'BRL',
    linked_proposal_id: '',
    linked_invoice_id: '',
    variables: {},
    signature_settings: {
      require_otp: false,
      require_terms: false,
      invitation_message: 'Você foi convidado para assinar um contrato. Por favor, revise e assine digitalmente.',
    },
  });

  useEffect(() => {
    loadTemplates();
    loadClients();
  }, []);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_templates')
        .select('*')
        .eq('user_id', user?.id)
        .eq('is_active', true);

      if (error) throw error;
      
      const mappedTemplates: ContractTemplate[] = (data || []).map(t => ({
        ...t,
        variables_schema: (Array.isArray(t.variables_schema) ? t.variables_schema : []) as any,
      }));
      
      setTemplates(mappedTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Erro ao carregar modelos');
    }
  };

  const loadClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email, company')
        .eq('user_id', user?.id)
        .order('name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleTemplateSelect = async (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFormData({
        ...formData,
        template_id: templateId,
        content_html: template.content_html,
        variables: {},
      });
    }
  };

  const handleAddSigner = () => {
    setSigners([
      ...signers,
      {
        name: '',
        email: '',
        role: 'CLIENT',
        signing_order: signers.length + 1,
      },
    ]);
  };

  const handleRemoveSigner = (index: number) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const handleSignerChange = (index: number, field: keyof typeof signers[0], value: any) => {
    const updated = [...signers];
    updated[index] = { ...updated[index], [field]: value };
    setSigners(updated);
  };

  const insertVariable = (variable: string) => {
    setFormData({
      ...formData,
      content_html: formData.content_html + `{{${variable}}}`,
    });
  };

  const handleSaveDraft = async () => {
    if (!formData.title) {
      toast.error('O título é obrigatório');
      return;
    }

    try {
      setLoading(true);

      // Generate contract number
      const { data: maxNumber } = await supabase
        .from('contracts')
        .select('contract_number')
        .eq('user_id', user?.id)
        .order('contract_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newNumber = maxNumber
        ? `${parseInt(maxNumber.contract_number) + 1}`.padStart(6, '0')
        : '000001';

      // Create contract
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          user_id: user?.id,
          contract_number: newNumber,
          title: formData.title,
          client_id: formData.client_id || null,
          responsible_id: formData.responsible_id || null,
          template_id: formData.template_id || null,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString(),
          end_date: formData.end_date?.toISOString(),
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : null,
          total_value: formData.total_value ? parseFloat(formData.total_value) : null,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || null,
          linked_invoice_id: formData.linked_invoice_id || null,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
          status: 'DRAFT',
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Create signers
      if (signers.length > 0) {
        const { error: signersError } = await supabase
          .from('contract_signers')
          .insert(
            signers.map(signer => ({
              contract_id: contract.id,
              ...signer,
            }))
          );

        if (signersError) throw signersError;
      }

      // Create event
      await supabase.from('contract_events').insert({
        contract_id: contract.id,
        event_type: 'CREATED',
        description: 'Contrato criado como rascunho',
        created_by: user?.id,
      });

      toast.success('Rascunho salvo com sucesso');
      navigate(`/contracts/${contract.id}`);
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Erro ao salvar rascunho');
    } finally {
      setLoading(false);
    }
  };

  const handleSendForSignature = async () => {
    if (!formData.title || signers.length === 0) {
      toast.error('Preencha o título e adicione pelo menos um assinante');
      return;
    }

    // Validate signers
    for (const signer of signers) {
      if (!signer.name || !signer.email) {
        toast.error('Todos os assinantes devem ter nome e e-mail');
        return;
      }
    }

    try {
      setLoading(true);

      // Generate contract number
      const { data: maxNumber } = await supabase
        .from('contracts')
        .select('contract_number')
        .eq('user_id', user?.id)
        .order('contract_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newNumber = maxNumber
        ? `${parseInt(maxNumber.contract_number) + 1}`.padStart(6, '0')
        : '000001';

      // Create contract
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .insert({
          user_id: user?.id,
          contract_number: newNumber,
          title: formData.title,
          client_id: formData.client_id || null,
          responsible_id: formData.responsible_id || null,
          template_id: formData.template_id || null,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString(),
          end_date: formData.end_date?.toISOString(),
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : null,
          total_value: formData.total_value ? parseFloat(formData.total_value) : null,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || null,
          linked_invoice_id: formData.linked_invoice_id || null,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
          status: 'PENDING_SIGNATURE',
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Create signers
      const { error: signersError } = await supabase
        .from('contract_signers')
        .insert(
          signers.map(signer => ({
            contract_id: contract.id,
            ...signer,
          }))
        );

      if (signersError) throw signersError;

      // Create event
      await supabase.from('contract_events').insert({
        contract_id: contract.id,
        event_type: 'SENT_FOR_SIGNATURE',
        description: 'Contrato enviado para assinatura',
        metadata: { signers: signers.map(s => ({ name: s.name, email: s.email })) },
        created_by: user?.id,
      });

      toast.success('Contrato enviado para assinatura');
      navigate(`/contracts/${contract.id}`);
    } catch (error) {
      console.error('Error sending for signature:', error);
      toast.error('Erro ao enviar contrato');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'select') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/contracts')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold">Novo Contrato</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary",
              selectedOption === 'blank' && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelectedOption('blank')}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6" />
                <div>
                  <CardTitle>Em Branco</CardTitle>
                  <CardDescription>Comece do zero</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Crie um contrato totalmente personalizado a partir de uma página em branco.
              </p>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary",
              selectedOption === 'template' && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelectedOption('template')}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6" />
                <div>
                  <CardTitle>Usar Modelo</CardTitle>
                  <CardDescription>Baseado em template</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Utilize um modelo pré-configurado e personalize conforme necessário.
              </p>
            </CardContent>
          </Card>
        </div>

        {selectedOption === 'template' && (
          <Card className="max-w-4xl">
            <CardHeader>
              <CardTitle>Selecione um Modelo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select onValueChange={handleTemplateSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um modelo" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(template => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2">
          <Button onClick={() => navigate('/contracts')} variant="outline">
            Cancelar
          </Button>
          <Button
            onClick={() => setStep('edit')}
            disabled={selectedOption === 'template' && !formData.template_id}
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setStep('select')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Novo Contrato</h1>
            <p className="text-sm text-muted-foreground">
              Preencha os detalhes do contrato
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            Salvar Rascunho
          </Button>
          <Button onClick={handleSendForSignature} disabled={loading}>
            <Send className="mr-2 h-4 w-4" />
            Enviar para Assinatura
          </Button>
        </div>
      </div>

      <Tabs defaultValue="editor" className="space-y-4">
        <TabsList>
          <TabsTrigger value="editor">
            <FileText className="mr-2 h-4 w-4" />
            Editor
          </TabsTrigger>
          <TabsTrigger value="signers">
            <Users className="mr-2 h-4 w-4" />
            Partes & Assinaturas
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="mr-2 h-4 w-4" />
            Datas & Financeiro
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Título do Contrato *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ex: Contrato de Prestação de Serviços"
                />
              </div>

              <div>
                <Label>Cliente</Label>
                <Popover open={clientSearchOpen} onOpenChange={setClientSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={clientSearchOpen}
                      className="w-full justify-between"
                    >
                      {formData.client_id
                        ? clients.find((client) => client.id === formData.client_id)?.name
                        : "Selecionar cliente..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Buscar cliente..." />
                      <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                      <CommandGroup>
                        {clients.map((client) => (
                          <CommandItem
                            key={client.id}
                            value={`${client.name} ${client.email || ''} ${client.company || ''}`}
                            onSelect={() => {
                              setFormData({ ...formData, client_id: client.id });
                              setClientSearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.client_id === client.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{client.name}</span>
                              {(client.email || client.company) && (
                                <span className="text-xs text-muted-foreground">
                                  {[client.company, client.email].filter(Boolean).join(' • ')}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Conteúdo do Contrato</CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable('client.name')}
                  >
                    Inserir Variável
                  </Button>
                  <Button variant="outline" size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    Pré-visualizar
                  </Button>
                </div>
              </div>
              <CardDescription>
                Use variáveis como {`{{client.name}}`}, {`{{contract.startDate}}`}, {`{{company.name}}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RichTextEditor
                value={formData.content_html}
                onChange={(value) => setFormData({ ...formData, content_html: value })}
                placeholder="Digite o conteúdo do contrato..."
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Assinantes</CardTitle>
                  <CardDescription>
                    Adicione as partes que devem assinar o contrato
                  </CardDescription>
                </div>
                <Button onClick={handleAddSigner} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Assinante
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {signers.map((signer, index) => (
                <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-move" />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Nome *</Label>
                      <Input
                        value={signer.name}
                        onChange={(e) => handleSignerChange(index, 'name', e.target.value)}
                        placeholder="Nome completo"
                      />
                    </div>
                    <div>
                      <Label>E-mail *</Label>
                      <Input
                        type="email"
                        value={signer.email}
                        onChange={(e) => handleSignerChange(index, 'email', e.target.value)}
                        placeholder="email@exemplo.com"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={signer.role}
                        onValueChange={(value) => handleSignerChange(index, 'role', value as SignerRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CLIENT">Cliente</SelectItem>
                          <SelectItem value="INTERNAL">Interno</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveSigner(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {signers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum assinante adicionado. Clique em "Adicionar Assinante" para começar.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações de Assinatura</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Mensagem de Convite</Label>
                <Textarea
                  value={formData.signature_settings.invitation_message}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      signature_settings: {
                        ...formData.signature_settings,
                        invitation_message: e.target.value,
                      },
                    })
                  }
                  rows={3}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="require_otp"
                  checked={formData.signature_settings.require_otp}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      signature_settings: {
                        ...formData.signature_settings,
                        require_otp: checked as boolean,
                      },
                    })
                  }
                />
                <Label htmlFor="require_otp" className="font-normal">
                  Exigir OTP por e-mail
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="require_terms"
                  checked={formData.signature_settings.require_terms}
                  onCheckedChange={(checked) =>
                    setFormData({
                      ...formData,
                      signature_settings: {
                        ...formData.signature_settings,
                        require_terms: checked as boolean,
                      },
                    })
                  }
                />
                <Label htmlFor="require_terms" className="font-normal">
                  Exigir aceite de termos
                </Label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Período de Vigência</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Data de Início</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.start_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.start_date ? format(formData.start_date, 'P', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.start_date || undefined}
                        onSelect={(date) => setFormData({ ...formData, start_date: date || null })}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <Label>Data de Término</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !formData.end_date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {formData.end_date ? format(formData.end_date, 'P', { locale: ptBR }) : 'Selecione'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={formData.end_date || undefined}
                        onSelect={(date) => setFormData({ ...formData, end_date: date || null })}
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto_renew"
                  checked={formData.auto_renew}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, auto_renew: checked as boolean })
                  }
                />
                <Label htmlFor="auto_renew" className="font-normal">
                  Renovação automática
                </Label>
              </div>

              {formData.auto_renew && (
                <div>
                  <Label>Período de Renovação (meses)</Label>
                  <Input
                    type="number"
                    value={formData.renewal_period}
                    onChange={(e) => setFormData({ ...formData, renewal_period: e.target.value })}
                    placeholder="12"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações Financeiras</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Valor Total</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.total_value}
                    onChange={(e) => setFormData({ ...formData, total_value: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <Label>Moeda</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">BRL (R$)</SelectItem>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NewContract;
