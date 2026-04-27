import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { ContractMergeFieldsPanel } from "@/components/contracts/ContractMergeFieldsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { contractsService } from "@/services/contracts";
import { clientsService, type Client } from "@/services/clients";
import { getMyTenantUsers, type TenantUser } from "@/services/tenantLimits";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { ClientSearchCombobox } from "@/components/clients/ClientSearchCombobox";
import {
  persistSignatureInviteBootstrap,
  summarizeSignatureInviteBootstrap,
} from "@/utils/contractSignatureBootstrap";
import { formatBrazilTaxIdDisplay, isBrazilTaxIdDigits, normalizeBrazilTaxIdInput } from "@/utils/brazilTaxId";
import { getContractDocumentHtml, hasMeaningfulDocumentHtml, isContractDraft } from "@/utils/contractDocument";
import { toast } from "@/components/ui/sonner";
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
} from "lucide-react";
import type {
  Contract,
  ContractTemplate,
  ContractSigner,
  SignerRole,
  ContractStatus,
} from "@/types/contracts";

export type ContractCreateSignerDraft = Omit<
  ContractSigner,
  "id" | "contract_id" | "created_at" | "signed_at" | "signature_data"
>;

export interface ContractCreateFormProps {
  /** Edição: UUID do contrato (rota `/contracts/:id/edit`). */
  contractId?: string;
  /** Painel embutido no Chat — mesmo padrão de fatura/proposta (`viewMode`). */
  embedded?: boolean;
  /** Apenas `clients.id` da conversa com cliente CRM; nunca id de lead. */
  initialClientId?: string | null;
  /** Pré-preenche signatários (ex.: contato do chat). */
  initialSigners?: ContractCreateSignerDraft[];
  /** Sugestão de título quando o campo ainda está vazio. */
  initialTitleHint?: string;
  onBack?: () => void;
  /**
   * Quando definido (chat), após criar rascunho ou enviar para assinatura substitui a navegação padrão.
   */
  onCreated?: (contract: Contract, mode: "draft" | "signature") => void;
  /** Voltar da criação (ex.: listagem de clientes com scroll restaurado). */
  listReturnPath?: string | null;
}

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

export function ContractCreateForm({
  contractId,
  embedded = false,
  initialClientId = null,
  initialSigners,
  initialTitleHint,
  onBack,
  onCreated,
  listReturnPath = null,
}: ContractCreateFormProps) {
  const id = contractId;
  const isEditMode = !!id;
  const navigate = useNavigate();
  const location = useLocation();
  const contractsIndexFallback = listReturnPath?.trim() || "/contracts";
  const { user } = useAuth();
  const { canCreate, canEdit, loading: permLoading } = useModulePermissions();
  const permissionOk = isEditMode ? canEdit("contracts") : canCreate("contracts");
  const canUseContracts = permissionOk && !permLoading;
  const [step, setStep] = useState<"select" | "edit">(() =>
    embedded && !id ? "edit" : id ? "edit" : "select"
  );
  const [selectedOption, setSelectedOption] = useState<'blank' | 'template'>('blank');
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [signers, setSigners] = useState<Omit<ContractSigner, 'id' | 'contract_id' | 'created_at' | 'signed_at' | 'signature_data'>[]>([]);
  const [loading, setLoading] = useState(false);
  /** Status carregado do servidor na edição; null em contrato novo. */
  const [contractStatus, setContractStatus] = useState<ContractStatus | null>(null);
  const documentLocked = isEditMode && contractStatus !== null && !isContractDraft(contractStatus);
  /** Hidrata o combobox (modo remoto) com o cliente já vinculado ou recém-selecionado — garante `selectedFromLocal` e envio consistente do UUID. */
  const [linkedClientForCombo, setLinkedClientForCombo] = useState<Client[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);

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
    let cancelled = false;
    void (async () => {
      await loadTemplates();
      await loadTenantUsers();
      if (cancelled) return;
      if (id) {
        await loadContractForEdit();
      } else {
        setContractStatus(null);
        setLinkedClientForCombo([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Todos os modelos do tenant (inclui inativos) para edição de contrato já vinculado a modelo desativado. */
  const loadTemplates = async () => {
    try {
      const data = await contractsService.getContractTemplates();
      if (!data) return;
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Erro ao carregar modelos');
    }
  };

  const loadTenantUsers = async () => {
    try {
      const rows = await getMyTenantUsers();
      setTenantUsers(rows);
    } catch (error) {
      console.error('Error loading tenant users:', error);
      setTenantUsers([]);
    }
  };

  const hydrateLinkedClient = async (clientId: string | null | undefined) => {
    if (!clientId?.trim()) {
      setLinkedClientForCombo([]);
      return;
    }
    try {
      const c = await clientsService.getClientById(clientId.trim());
      setLinkedClientForCombo(c ? [c] : []);
    } catch {
      setLinkedClientForCombo([]);
    }
  };

  const handleContractClientChange = (clientId: string | null) => {
    setFormData((prev) => ({ ...prev, client_id: clientId ?? "" }));
    void hydrateLinkedClient(clientId);
  };

  useEffect(() => {
    if (!initialClientId?.trim()) return;
    const cid = initialClientId.trim();
    setFormData((prev) => (prev.client_id === cid ? prev : { ...prev, client_id: cid }));
    void hydrateLinkedClient(cid);
  }, [initialClientId]);

  useEffect(() => {
    if (!embedded || !initialTitleHint?.trim()) return;
    const hint = initialTitleHint.trim();
    setFormData((prev) => (prev.title.trim() ? prev : { ...prev, title: hint }));
  }, [embedded, initialTitleHint]);

  useEffect(() => {
    if (!embedded || !initialSigners?.length) return;
    setSigners(
      initialSigners.map((s, i) => ({
        ...s,
        signing_order: s.signing_order ?? i + 1,
      }))
    );
  }, [embedded, initialSigners]);

  useEffect(() => {
    if (!embedded || !user?.id) return;
    setFormData((prev) => (prev.responsible_id ? prev : { ...prev, responsible_id: user.id }));
  }, [embedded, user?.id]);

  const loadContractForEdit = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const contract = await contractsService.getContractById(id);
      setContractStatus(contract.status);
      await hydrateLinkedClient(contract.client_id);

      // Carregar assinantes
      const contractSigners = await contractsService.getContractSigners(id);
      setSigners(contractSigners.map(s => ({
        name: s.name,
        email: s.email,
        tax_id: s.tax_id ? formatBrazilTaxIdDisplay(s.tax_id) : '',
        role: s.role,
        signing_order: s.signing_order || undefined,
      })));

      // Preencher formulário com dados do contrato
      setFormData({
        title: contract.title,
        client_id: contract.client_id || '',
        responsible_id: contract.responsible_id || '',
        template_id: contract.template_id || '',
        content_html: getContractDocumentHtml(contract),
        start_date: contract.start_date ? new Date(contract.start_date) : null,
        end_date: contract.end_date ? new Date(contract.end_date) : null,
        auto_renew: contract.auto_renew,
        renewal_period: contract.renewal_period?.toString() || '12',
        total_value: contract.total_value?.toString() || '',
        currency: contract.currency || 'BRL',
        linked_proposal_id: contract.linked_proposal_id || '',
        linked_invoice_id: contract.linked_invoice_id || '',
        variables: contract.variables || {},
        signature_settings: contract.signature_settings || {
          require_otp: false,
          require_terms: false,
          invitation_message: 'Você foi convidado para assinar um contrato. Por favor, revise e assine digitalmente.',
        },
      });

      // Não reaplicar HTML do modelo aqui: o contrato já carregou content_html (snapshot).
      // Reaplicar sobrescreveria personalizações feitas após escolher o modelo.
      if (contract.template_id) {
        setSelectedOption('template');
      } else {
        setSelectedOption('blank');
      }

      setStep('edit');
    } catch (error) {
      console.error('Error loading contract:', error);
      toast.error('Erro ao carregar contrato');
      navigate('/contracts');
    } finally {
      setLoading(false);
    }
  };

  /** Ao escolher modelo no assistente: aplica HTML do modelo de forma imutável (evita stale closure). */
  const handleTemplateSelect = (templateId: string) => {
    setFormData((prev) => {
      const template = templates.find((t) => t.id === templateId);
      if (!template) {
        return { ...prev, template_id: templateId };
      }
      const defaultTitle =
        (template.default_title && template.default_title.trim()) || template.name.trim() || prev.title;
      const tv =
        template.default_total_value != null && Number.isFinite(Number(template.default_total_value))
          ? String(template.default_total_value)
          : prev.total_value;
      const nextCurrency =
        template.default_currency && template.default_currency.trim()
          ? template.default_currency.trim()
          : prev.currency;
      return {
        ...prev,
        template_id: templateId,
        title: defaultTitle,
        content_html: template.content_html,
        variables: {},
        total_value: tv,
        currency: nextCurrency,
        start_date: null,
        end_date: null,
      };
    });
  };

  const handleAddSigner = () => {
    setSigners([
      ...signers,
      {
        name: '',
        email: '',
        tax_id: '',
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
    if (field === "tax_id") {
      updated[index] = { ...updated[index], [field]: formatBrazilTaxIdDisplay(String(value ?? "")) };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    setSigners(updated);
  };

  const insertVariable = (variable: string) => {
    if (documentLocked) return;
    setFormData({
      ...formData,
      content_html: formData.content_html + `{{${variable}}}`,
    });
  };

  const validateSignersTaxAndIdentity = (): boolean => {
    for (const signer of signers) {
      if (!signer.name?.trim() || !signer.email?.trim()) {
        toast.error('Cada assinante precisa de nome e e-mail');
        return false;
      }
      const tid = normalizeBrazilTaxIdInput(signer.tax_id || '');
      if (!isBrazilTaxIdDigits(tid)) {
        toast.error('Cada assinante precisa de CPF (11 dígitos) ou CNPJ (14 dígitos).');
        return false;
      }
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (documentLocked) {
      toast.error('Este contrato está congelado e não pode ser editado.');
      return;
    }
    if (!formData.title) {
      toast.error('O título é obrigatório');
      return;
    }
    if (signers.length > 0 && !validateSignersTaxAndIdentity()) return;

    const clientIdForApi = formData.client_id.trim() || undefined;

    try {
      setLoading(true);

      if (isEditMode && id) {
        // Atualizar contrato existente
        await contractsService.updateContract(id, {
          title: formData.title,
          client_id: clientIdForApi,
          responsible_id: formData.responsible_id || undefined,
          template_id: formData.template_id || undefined,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString().split('T')[0] || undefined,
          end_date: formData.end_date?.toISOString().split('T')[0] || undefined,
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : undefined,
          total_value: formData.total_value ? parseFloat(formData.total_value) : undefined,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || undefined,
          linked_invoice_id: formData.linked_invoice_id || undefined,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
        });

        // Atualizar assinantes (remover todos e recriar)
        const existingSigners = await contractsService.getContractSigners(id);
        for (const signer of existingSigners) {
          await contractsService.deleteContractSigner(signer.id);
        }
        for (const signer of signers) {
          await contractsService.createContractSigner(id, {
            name: signer.name,
            email: signer.email,
            tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
            role: signer.role,
            signing_order: signer.signing_order || undefined,
          });
        }

        toast.success('Contrato atualizado com sucesso');
        
        // Voltar para o lugar correto
        if (location.state?.fromClientProfile) {
          const contract = await contractsService.getContractById(id);
          if (contract.client_id) {
            navigate(`/clients/${contract.client_id}/contracts`);
            return;
          }
        }
        navigate(`/contracts/${id}`);
      } else {
      // Create contract
        const contract = await contractsService.createContract({
          title: formData.title,
          client_id: clientIdForApi,
          responsible_id: formData.responsible_id || undefined,
          template_id: formData.template_id || undefined,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString().split('T')[0] || undefined,
          end_date: formData.end_date?.toISOString().split('T')[0] || undefined,
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : undefined,
          total_value: formData.total_value ? parseFloat(formData.total_value) : undefined,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || undefined,
          linked_invoice_id: formData.linked_invoice_id || undefined,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
        });

      // Create signers
      if (signers.length > 0) {
          for (const signer of signers) {
            await contractsService.createContractSigner(contract.id, {
              name: signer.name,
              email: signer.email,
              tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
              role: signer.role,
              signing_order: signer.signing_order || undefined,
            });
          }
      }

      // Create event
        await contractsService.createContractEvent(contract.id, {
        event_type: 'CREATED',
        description: 'Contrato criado como rascunho',
      });

      if (onCreated) {
        const full = await contractsService.getContractById(contract.id);
        onCreated(full, "draft");
      } else {
        toast.success("Rascunho salvo com sucesso");
        navigate(`/contracts/${contract.id}`, {
          state: contract.public_view?.token ? { publicView: { token: contract.public_view.token } } : undefined,
        });
      }
      }
    } catch (error) {
      console.error('Error saving draft:', error);
      toast.error('Erro ao salvar rascunho');
    } finally {
      setLoading(false);
    }
  };

  const handleSendForSignature = async () => {
    if (documentLocked) {
      toast.error('Este contrato já foi enviado ou não está mais em rascunho.');
      return;
    }
    if (!formData.title?.trim()) {
      toast.error('O título é obrigatório');
      return;
    }
    if (!hasMeaningfulDocumentHtml(formData.content_html)) {
      toast.error('Preencha o conteúdo do contrato antes de enviar');
      return;
    }
    if (signers.length === 0) {
      toast.error('Adicione pelo menos um assinante');
      return;
    }

    for (const signer of signers) {
      if (!signer.name || !signer.email) {
        toast.error('Todos os assinantes devem ter nome e e-mail');
        return;
      }
    }
    if (!validateSignersTaxAndIdentity()) return;

    try {
      setLoading(true);

      if (isEditMode && id) {
        const sendClientId = formData.client_id.trim() || undefined;
        await contractsService.updateContract(id, {
          title: formData.title,
          client_id: sendClientId,
          responsible_id: formData.responsible_id || undefined,
          template_id: formData.template_id || undefined,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString().split('T')[0] || undefined,
          end_date: formData.end_date?.toISOString().split('T')[0] || undefined,
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : undefined,
          total_value: formData.total_value ? parseFloat(formData.total_value) : undefined,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || undefined,
          linked_invoice_id: formData.linked_invoice_id || undefined,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
        });

        const existingSigners = await contractsService.getContractSigners(id);
        for (const signer of existingSigners) {
          await contractsService.deleteContractSigner(signer.id);
        }
        for (const signer of signers) {
          await contractsService.createContractSigner(id, {
            name: signer.name,
            email: signer.email,
            tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
            role: signer.role,
            signing_order: signer.signing_order || undefined,
          });
        }

        const sent = await contractsService.updateContract(id, { status: 'PENDING_SIGNATURE' });
        persistSignatureInviteBootstrap(id, sent.signature_invite_bootstrap);
        const bootSum = summarizeSignatureInviteBootstrap(sent.signature_invite_bootstrap);
        if (bootSum && bootSum.alreadyActive > 0) {
          toast.message('Parte dos convites já estava ativa', {
            description:
              'O link não pode ser mostrado outra vez por segurança. Na aba Links, use «Regenerar e copiar» no menu (⋮) do signatário, ou o mesmo browser que já gerou o convite.',
          });
        }

        await contractsService.createContractEvent(id, {
          event_type: 'SENT_FOR_SIGNATURE',
          description: 'Contrato enviado para assinatura',
          metadata: { signers: signers.map(s => ({ name: s.name, email: s.email })) },
        });

        toast.success('Contrato atualizado e enviado para assinatura. Links de assinatura preparados.');

        if (location.state?.fromClientProfile) {
          const contract = await contractsService.getContractById(id);
          if (contract.client_id) {
            navigate(`/clients/${contract.client_id}/contracts`);
            return;
          }
        }
        navigate(`/contracts/${id}`, {
          state: {
            signatureInviteBootstrap: sent.signature_invite_bootstrap,
          },
        });
      } else {
        const sendClientIdNew = formData.client_id.trim() || undefined;
        const contract = await contractsService.createContract({
          title: formData.title,
          client_id: sendClientIdNew,
          responsible_id: formData.responsible_id || undefined,
          template_id: formData.template_id || undefined,
          content_html: formData.content_html,
          start_date: formData.start_date?.toISOString().split('T')[0] || undefined,
          end_date: formData.end_date?.toISOString().split('T')[0] || undefined,
          auto_renew: formData.auto_renew,
          renewal_period: formData.renewal_period ? parseInt(formData.renewal_period) : undefined,
          total_value: formData.total_value ? parseFloat(formData.total_value) : undefined,
          currency: formData.currency,
          linked_proposal_id: formData.linked_proposal_id || undefined,
          linked_invoice_id: formData.linked_invoice_id || undefined,
          variables: formData.variables,
          signature_settings: formData.signature_settings,
        });

        for (const signer of signers) {
          await contractsService.createContractSigner(contract.id, {
            name: signer.name,
            email: signer.email,
            tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
            role: signer.role,
            signing_order: signer.signing_order || undefined,
          });
        }

        const sent = await contractsService.updateContract(contract.id, { status: 'PENDING_SIGNATURE' });
        persistSignatureInviteBootstrap(contract.id, sent.signature_invite_bootstrap);
        const bootSum = summarizeSignatureInviteBootstrap(sent.signature_invite_bootstrap);
        if (bootSum && bootSum.alreadyActive > 0) {
          toast.message('Parte dos convites já estava ativa', {
            description:
              'O link não pode ser mostrado outra vez por segurança. Na aba Links, use «Regenerar e copiar» no menu (⋮).',
          });
        }

        await contractsService.createContractEvent(contract.id, {
          event_type: 'SENT_FOR_SIGNATURE',
          description: 'Contrato enviado para assinatura',
          metadata: { signers: signers.map(s => ({ name: s.name, email: s.email })) },
        });

        if (onCreated) {
          const full = await contractsService.getContractById(contract.id);
          onCreated(full, "signature");
        } else {
          toast.success("Contrato enviado para assinatura. Links de assinatura preparados.");
          navigate(`/contracts/${contract.id}`, {
            state: {
              signatureInviteBootstrap: sent.signature_invite_bootstrap,
              ...(contract.public_view?.token ? { publicView: { token: contract.public_view.token } } : {}),
            },
          });
        }
      }
    } catch (error: unknown) {
      console.error('Error sending for signature:', error);
      const msg = error instanceof Error ? error.message : 'Erro ao enviar contrato';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!permLoading && !permissionOk) {
    return (
      <div className="space-y-4">
        {embedded ? (
          <Button variant="outline" size="sm" type="button" onClick={onBack}>
            Voltar
          </Button>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link to={contractsIndexFallback}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        )}
        <p className="text-sm text-muted-foreground">
          {isEditMode
            ? "Sem permissão para editar contratos."
            : "Sem permissão para criar contratos."}
        </p>
      </div>
    );
  }

  if (step === 'select') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(contractsIndexFallback)}>
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
                  {templates
                    .filter((template) => template.is_active)
                    .map((template) => (
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
          <Button onClick={() => navigate(contractsIndexFallback)} variant="outline">
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
    <div className={cn("space-y-6", embedded && "max-w-full pb-4")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => {
              if (embedded && onBack) {
                onBack();
                return;
              }
              if (isEditMode && id) {
                // Voltar para o lugar correto
                if (location.state?.fromClientProfile) {
                  contractsService.getContractById(id).then(contract => {
                    if (contract.client_id) {
                      navigate(`/clients/${contract.client_id}/contracts`);
                    } else {
                      navigate(`/contracts/${id}`);
                    }
                  });
                } else {
                  navigate(`/contracts/${id}`);
                }
              } else {
                setStep('select');
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isEditMode ? 'Editar Contrato' : 'Novo Contrato'}</h1>
            <p className="text-sm text-muted-foreground">
              Preencha os detalhes do contrato
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleSaveDraft} disabled={loading || documentLocked || !canUseContracts}>
            <Save className="mr-2 h-4 w-4" />
            Salvar Rascunho
          </Button>
          <Button onClick={handleSendForSignature} disabled={loading || documentLocked || !canUseContracts}>
            <Send className="mr-2 h-4 w-4" />
            Enviar para Assinatura
          </Button>
        </div>
      </div>

      {documentLocked && (
        <Alert>
          <AlertTitle>Documento congelado</AlertTitle>
          <AlertDescription>
            Este contrato não está mais em rascunho. O texto e os signatários não podem ser alterados aqui.
            Use a tela de detalhes para ações permitidas (ex.: status ou tags, conforme o caso).
          </AlertDescription>
        </Alert>
      )}

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
                  disabled={documentLocked}
                />
              </div>

              <ClientSearchCombobox
                id="contract-client-search"
                label="Cliente"
                value={formData.client_id || null}
                clients={linkedClientForCombo}
                remoteSearch
                disabled={documentLocked}
                className="w-full"
                onChange={handleContractClientChange}
              />

              <div>
                <Label>Responsável pelo contrato</Label>
                <Select
                  value={formData.responsible_id || "__none__"}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      responsible_id: value === "__none__" ? "" : value,
                    }))
                  }
                  disabled={documentLocked}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar responsável (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem responsável definido</SelectItem>
                    {tenantUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {(u.full_name && u.full_name.trim()) || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Contrato</CardTitle>
              <CardDescription className="mt-1 max-w-prose">
                Placeholders {`{{system.*}}`}, {`{{contract.*}}`}, {`{{client.*}}`}, {`{{operator.*}}`},{` `}
                {`{{signer.*}}`} (primeiro signatário) e variáveis personalizadas. Formato legado: {`{{contract.startDate}}`},{` `}
                {`{{company.name}}`}, {`{{nome_cliente}}`}.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Inserir campo de mesclagem</p>
                <ContractMergeFieldsPanel
                  className="max-h-[320px] overflow-y-auto pr-1"
                  disabled={documentLocked}
                  onInsert={(key) => insertVariable(key)}
                />
              </div>
              <RichTextEditor
                value={formData.content_html}
                onChange={(value) => setFormData({ ...formData, content_html: value })}
                placeholder="Digite o conteúdo do contrato..."
                readOnly={documentLocked}
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
                <Button onClick={handleAddSigner} size="sm" disabled={documentLocked}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Assinante
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {signers.map((signer, index) => (
                <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                  <GripVertical className="h-5 w-5 text-muted-foreground mt-2 cursor-move" />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div>
                      <Label>Nome *</Label>
                      <Input
                        value={signer.name}
                        onChange={(e) => handleSignerChange(index, 'name', e.target.value)}
                        placeholder="Nome completo"
                        disabled={documentLocked}
                      />
                    </div>
                    <div>
                      <Label>E-mail *</Label>
                      <Input
                        type="email"
                        value={signer.email}
                        onChange={(e) => handleSignerChange(index, 'email', e.target.value)}
                        placeholder="email@exemplo.com"
                        disabled={documentLocked}
                      />
                    </div>
                    <div>
                      <Label>CPF ou CNPJ *</Label>
                      <Input
                        value={signer.tax_id ?? ''}
                        onChange={(e) => handleSignerChange(index, 'tax_id', e.target.value)}
                        placeholder="11 ou 14 dígitos"
                        disabled={documentLocked}
                        inputMode="numeric"
                      />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select
                        value={signer.role}
                        onValueChange={(value) => handleSignerChange(index, 'role', value as SignerRole)}
                        disabled={documentLocked}
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
                    disabled={documentLocked}
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
                  disabled={documentLocked}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="require_otp"
                  checked={formData.signature_settings.require_otp}
                  disabled={documentLocked}
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
                  disabled={documentLocked}
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
                        disabled={documentLocked}
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
                        disabled={documentLocked}
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
                        disabled={documentLocked}
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
                        disabled={documentLocked}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="auto_renew"
                  checked={formData.auto_renew}
                  disabled={documentLocked}
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
                    disabled={documentLocked}
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
                    disabled={documentLocked}
                  />
                </div>

                <div>
                  <Label>Moeda</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                    disabled={documentLocked}
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

export default ContractCreateForm;
