import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import {
  getContractDocumentHtml,
  hasMeaningfulContractDocument,
  hasMeaningfulDocumentHtml,
  isContractDraft,
  isPdfSignatureContract,
} from "@/utils/contractDocument";
import {
  clearContractCreateWizardPersist,
  readContractCreateWizardPersist,
  writeContractCreateWizardPersist,
  type ContractWizardOption,
  type ContractWizardStep,
} from "@/lib/contractCreateWizardPersist";
import {
  ContractPdfSignatureStep,
  type ContractPdfSignatureStepHandle,
} from "@/components/contracts/ContractPdfSignatureStep";
import type { PdfFieldDraft } from "@/components/contracts/ContractPdfSignatureEditor";
import { remapPdfFieldSignerIds } from "@/utils/pdfSignatureFieldSignerIds";
import {
  ContractPdfSignersPanel,
  mapContractSignerToPdfDraft,
  type PdfSignerDraft,
} from "@/components/contracts/ContractPdfSignersPanel";
import { ContractPdfPagesNav } from "@/components/contracts/ContractPdfPagesNav";
import type { ContractPdfExtraPage } from "@/types/contractPdfEditor";
import {
  formatBrazilWhatsappDisplay,
  normalizeBrazilWhatsappDigits,
} from "@/utils/brazilWhatsappPhone";
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
  FileSignature,
  FileUp,
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
  "id" | "contract_id" | "created_at" | "signed_at" | "signature_data" | "signature_invite"
> & {
  localId?: string;
  serverId?: string;
};

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
  const { canCreate, canEdit, loading: permLoading, hasPermissionKey } = useModulePermissions();
  const permissionOk = isEditMode ? canEdit("contracts") : canCreate("contracts");
  const canUseContracts = permissionOk && !permLoading;
  const canRequestContractSignature = hasPermissionKey("contracts.request_signature");
  const [step, setStep] = useState<ContractWizardStep>(() => {
    if (embedded && !id) return 'edit';
    if (id) return 'edit';
    const saved = readContractCreateWizardPersist(undefined);
    if (saved?.step === 'edit' || saved?.step === 'pdf_signature' || saved?.step === 'select') {
      return saved.step;
    }
    return 'select';
  });
  const [selectedOption, setSelectedOption] = useState<ContractWizardOption>(() => {
    const saved = readContractCreateWizardPersist(undefined);
    if (
      saved?.selectedOption === 'blank' ||
      saved?.selectedOption === 'template' ||
      saved?.selectedOption === 'pdf_signature'
    ) {
      return saved.selectedOption;
    }
    return 'blank';
  });
  const [pdfContractId, setPdfContractId] = useState<string | undefined>(() => {
    return readContractCreateWizardPersist(undefined)?.pdfContractId;
  });
  const [pdfSigners, setPdfSigners] = useState<PdfSignerDraft[]>([]);
  const [pdfFields, setPdfFields] = useState<PdfFieldDraft[]>([]);
  const [pdfDocumentLoaded, setPdfDocumentLoaded] = useState(false);
  const [placementSignerId, setPlacementSignerId] = useState<string | null>(null);
  const [pdfSourcePageCount, setPdfSourcePageCount] = useState(1);
  const [pdfExtraPages, setPdfExtraPages] = useState<ContractPdfExtraPage[]>([]);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const [pdfAppendLoading, setPdfAppendLoading] = useState(false);

  const signaturePlacedBySignerId = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const s of pdfSigners) {
      const k = s.serverId ?? s.localId;
      map[k] = pdfFields.some(
        (f) => f.field_type === 'signature' && f.contract_signer_id === k,
      );
    }
    return map;
  }, [pdfSigners, pdfFields]);

  const removeSignerSignatureFromPdf = useCallback(
    (signerKey: string) => {
      setPdfFields((prev) =>
        prev.filter((f) => !(f.field_type === 'signature' && f.contract_signer_id === signerKey)),
      );
      if (placementSignerId === signerKey) setPlacementSignerId(null);
    },
    [placementSignerId],
  );

  const pdfStepRef = useRef<ContractPdfSignatureStepHandle>(null);

  const pdfPlacementProgress = useMemo(() => {
    const total = pdfSigners.length;
    const placed = pdfSigners.filter((s) => signaturePlacedBySignerId[s.serverId ?? s.localId]).length;
    return { total, placed };
  }, [pdfSigners, signaturePlacedBySignerId]);
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [signers, setSigners] = useState<ContractCreateSignerDraft[]>([]);
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
    if (id) return;
    writeContractCreateWizardPersist(undefined, {
      step,
      selectedOption,
      pdfContractId,
    });
  }, [id, step, selectedOption, pdfContractId]);

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

  /** Todos os modelos da empresa (inclui inativos) para edição de contrato já vinculado a modelo desativado. */
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
    const mapped = initialSigners.map((s, i) => ({
      ...s,
      signing_order: s.signing_order ?? i + 1,
      whatsapp_phone: s.whatsapp_phone ?? '',
    }));
    setSigners(mapped);
    setPdfSigners(
      mapped.map((s, i) => ({
        localId: s.localId ?? `init_${i}`,
        name: s.name,
        email: s.email,
        whatsapp_phone: s.whatsapp_phone ?? '',
        tax_id: s.tax_id ?? '',
        role: s.role,
        signing_order: s.signing_order ?? i + 1,
      })),
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
      setSigners(
        contractSigners.map((s) => ({
          name: s.name,
          email: s.email,
          tax_id: s.tax_id ? formatBrazilTaxIdDisplay(s.tax_id) : '',
          whatsapp_phone: s.whatsapp_phone ?? '',
          role: s.role,
          signing_order: s.signing_order || undefined,
          serverId: s.id,
          localId: s.id,
        })),
      );
      if (isPdfSignatureContract(contract)) {
        setPdfSigners(contractSigners.map(mapContractSignerToPdfDraft));
        setPdfContractId(id);
        setSelectedOption('pdf_signature');
        setStep('pdf_signature');
      }

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
      if (isPdfSignatureContract(contract)) {
        setSelectedOption('pdf_signature');
        setPdfContractId(contract.id);
        setStep('pdf_signature');
      } else if (contract.template_id) {
        setSelectedOption('template');
        setStep('edit');
      } else {
        setSelectedOption('blank');
        setStep('edit');
      }
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
        whatsapp_phone: '',
        tax_id: '',
        role: 'CLIENT',
        signing_order: signers.length + 1,
      },
    ]);
  };

  const handleRemoveSigner = (index: number) => {
    setSigners(signers.filter((_, i) => i !== index));
  };

  const handleSignerChange = (index: number, field: keyof ContractCreateSignerDraft, value: unknown) => {
    const updated = [...signers];
    if (field === 'tax_id') {
      updated[index] = { ...updated[index], tax_id: formatBrazilTaxIdDisplay(String(value ?? '')) };
    } else if (field === 'whatsapp_phone') {
      updated[index] = {
        ...updated[index],
        whatsapp_phone: formatBrazilWhatsappDisplay(String(value ?? '')),
      };
    } else {
      updated[index] = { ...updated[index], [field]: value } as ContractCreateSignerDraft;
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

  const buildContractUpdatePayload = () => {
    const clientIdForApi = formData.client_id.trim() || undefined;
    return {
      title: formData.title,
      client_id: clientIdForApi,
      responsible_id: formData.responsible_id || undefined,
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
    };
  };

  const syncSignersForContract = async (targetId: string) => {
    const existingSigners = await contractsService.getContractSigners(targetId);
    for (const signer of existingSigners) {
      await contractsService.deleteContractSigner(signer.id);
    }
    for (const signer of signers) {
      await contractsService.createContractSigner(targetId, {
        name: signer.name,
        email: signer.email,
        tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
        role: signer.role,
        signing_order: signer.signing_order || undefined,
        whatsapp_phone: signer.whatsapp_phone?.trim()
          ? normalizeBrazilWhatsappDigits(signer.whatsapp_phone)
          : null,
      });
    }
  };

  const syncPdfSignersForContract = async (targetId: string): Promise<PdfSignerDraft[]> => {
    const existingSigners = await contractsService.getContractSigners(targetId);
    for (const signer of existingSigners) {
      await contractsService.deleteContractSigner(signer.id);
    }
    const next: PdfSignerDraft[] = [];
    for (const signer of pdfSigners) {
      const created = await contractsService.createContractSigner(targetId, {
        name: signer.name,
        email: signer.email,
        tax_id: normalizeBrazilTaxIdInput(signer.tax_id || ''),
        role: signer.role,
        signing_order: signer.signing_order || undefined,
        whatsapp_phone: signer.whatsapp_phone?.trim()
          ? normalizeBrazilWhatsappDigits(signer.whatsapp_phone)
          : null,
      });
      next.push({
        ...signer,
        serverId: created.id,
        localId: signer.localId,
      });
    }
    setPdfSigners(next);
    setPdfFields((prev) => remapPdfFieldSignerIds(prev, next));
    return next;
  };

  const validateSignersTaxAndIdentity = (list = signers): boolean => {
    for (const signer of list) {
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
        clearContractCreateWizardPersist(undefined);
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
    if (selectedOption === 'pdf_signature') {
      toast.error('Use o fluxo PDF com Assinatura para enviar este contrato.');
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 max-w-5xl">
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

          <Card
            className={cn(
              "cursor-pointer transition-all hover:border-primary",
              selectedOption === 'pdf_signature' && "border-primary ring-2 ring-primary/20"
            )}
            onClick={() => setSelectedOption('pdf_signature')}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileSignature className="h-6 w-6" />
                <div>
                  <CardTitle>PDF com Assinatura</CardTitle>
                  <CardDescription>Upload + campos online</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Faça upload de um PDF e configure locais de assinatura online.
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
            onClick={() =>
              setStep(selectedOption === 'pdf_signature' ? 'pdf_signature' : 'edit')
            }
            disabled={selectedOption === 'template' && !formData.template_id}
          >
            Continuar
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'pdf_signature') {
    const pdfStatusLabel =
      pdfPlacementProgress.total === 0
        ? 'Adicione assinantes'
        : pdfPlacementProgress.placed === pdfPlacementProgress.total
          ? 'Pronto para enviar'
          : `${pdfPlacementProgress.placed}/${pdfPlacementProgress.total} no PDF`;

    const handlePdfSaveDraft = async () => {
      if (pdfSigners.length > 0 && !validateSignersTaxAndIdentity(pdfSigners)) return;
      setLoading(true);
      try {
        await pdfStepRef.current?.saveDraft();
      } finally {
        setLoading(false);
      }
    };

    const handlePdfSend = async () => {
      if (!formData.title?.trim()) {
        toast.error('O título é obrigatório');
        return;
      }
      if (pdfSigners.length === 0) {
        toast.error('Adicione pelo menos um assinante');
        return;
      }
      for (const signer of pdfSigners) {
        if (!signer.name || !signer.email) {
          toast.error('Todos os assinantes devem ter nome e e-mail');
          return;
        }
      }
      if (!validateSignersTaxAndIdentity(pdfSigners)) return;
      setLoading(true);
      try {
        await pdfStepRef.current?.sendForSignature();
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className={cn('pb-24 lg:pb-8', embedded && 'max-w-full')}>
        <header className="sticky top-0 z-40 -mx-4 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-[1920px] flex-col gap-3">
            <div className="flex items-start gap-2 sm:gap-3">
              <Button variant="ghost" size="icon" className="shrink-0 mt-0.5" onClick={() => setStep('select')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="pdf-contract-title-header" className="sr-only">
                  Título do contrato
                </Label>
                <Input
                  id="pdf-contract-title-header"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                  disabled={documentLocked}
                  placeholder="Título do contrato"
                  className="h-10 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 sm:text-xl"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {pdfStatusLabel}
                  </span>
                  {documentLocked ? (
                    <span className="text-xs text-amber-600">Documento bloqueado</span>
                  ) : null}
                </div>
              </div>
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                {!documentLocked ? (
                  <Button type="button" variant="outline" size="sm" className="gap-2" disabled={loading} asChild>
                    <label
                      className={cn('cursor-pointer', loading && 'pointer-events-none opacity-60')}
                      title={
                        pdfDocumentLoaded
                          ? 'Trocar o arquivo PDF do contrato'
                          : 'Selecionar o arquivo PDF do contrato para assinatura'
                      }
                    >
                      <FileUp className="h-4 w-4 shrink-0" />
                      <span>{pdfDocumentLoaded ? 'Substituir PDF' : 'Importar PDF'}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="sr-only"
                        aria-label={
                          pdfDocumentLoaded
                            ? 'Substituir documento PDF do contrato'
                            : 'Importar documento PDF do contrato'
                        }
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void pdfStepRef.current?.uploadPdf(f);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="gap-1.5"
                  disabled={loading || documentLocked}
                  onClick={() => void handlePdfSaveDraft()}
                >
                  <Save className="h-4 w-4" />
                  Salvar
                </Button>
                {canRequestContractSignature ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5"
                    disabled={loading || documentLocked}
                    onClick={() => void handlePdfSend()}
                  >
                    <Send className="h-4 w-4" />
                    Enviar
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        <div className="mx-auto w-full max-w-[1920px] px-4 pt-6 sm:px-6">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
            <aside className="w-full shrink-0 lg:w-[300px] xl:w-[320px]">
              <div className="space-y-5 lg:sticky lg:top-[5.5rem]">
                <ClientSearchCombobox
                  id="pdf-contract-client"
                  label="Cliente (opcional)"
                  value={formData.client_id || null}
                  clients={linkedClientForCombo}
                  remoteSearch
                  disabled={documentLocked}
                  onChange={handleContractClientChange}
                />
                <ContractPdfSignersPanel
                  signers={pdfSigners}
                  onChange={setPdfSigners}
                  documentLocked={documentLocked}
                  placementSignerId={placementSignerId}
                  onPlacementSignerIdChange={setPlacementSignerId}
                  signaturePlacedBySignerId={signaturePlacedBySignerId}
                  onRemoveSignerSignature={removeSignerSignatureFromPdf}
                />
                {pdfDocumentLoaded ? (
                  <ContractPdfPagesNav
                    sourcePageCount={pdfSourcePageCount}
                    totalPages={pdfSourcePageCount + pdfExtraPages.length}
                    currentPage={pdfCurrentPage}
                    onPageSelect={setPdfCurrentPage}
                    extraPages={pdfExtraPages}
                    readOnly={documentLocked}
                    appendLoading={pdfAppendLoading}
                    onAppendPage={
                      documentLocked
                        ? undefined
                        : async () => {
                            await pdfStepRef.current?.appendExtraPage?.();
                          }
                    }
                  />
                ) : null}
              </div>
            </aside>

            <section className="min-w-0 flex-1 rounded-xl bg-muted/25 lg:bg-transparent">
              <ContractPdfSignatureStep
                ref={pdfStepRef}
                editorOnly
                contractId={pdfContractId || id}
                title={formData.title}
                onTitleChange={(t) => setFormData((prev) => ({ ...prev, title: t }))}
                documentLocked={documentLocked}
                onContractCreated={setPdfContractId}
                onPdfLoadedChange={setPdfDocumentLoaded}
                saving={loading}
                canSend={canRequestContractSignature}
                signers={pdfSigners}
                placementSignerId={placementSignerId}
                onPlacementSignerIdChange={setPlacementSignerId}
                onSyncSigners={syncPdfSignersForContract}
                fields={pdfFields}
                onFieldsChange={setPdfFields}
                sourcePageCount={pdfSourcePageCount}
                onSourcePageCountChange={setPdfSourcePageCount}
                extraPages={pdfExtraPages}
                onExtraPagesChange={setPdfExtraPages}
                currentPage={pdfCurrentPage}
                onCurrentPageChange={setPdfCurrentPage}
                onAppendPageLoadingChange={setPdfAppendLoading}
                onSaveDraft={async (cid) => {
                  await contractsService.updateContract(cid, buildContractUpdatePayload());
                  if (!isEditMode) {
                    await contractsService.createContractEvent(cid, {
                      event_type: 'CREATED',
                      description: 'Contrato PDF criado como rascunho',
                    });
                  }
                  if (onCreated) {
                    const full = await contractsService.getContractById(cid);
                    onCreated(full, 'draft');
                  } else {
                    toast.success('Rascunho salvo');
                    clearContractCreateWizardPersist(undefined);
                    navigate(`/contracts/${cid}`);
                  }
                }}
                onSendForSignature={async (cid) => {
                  await contractsService.updateContract(cid, buildContractUpdatePayload());
                  const sent = await contractsService.updateContract(cid, { status: 'PENDING_SIGNATURE' });
                  persistSignatureInviteBootstrap(cid, sent.signature_invite_bootstrap);
                  await contractsService.createContractEvent(cid, {
                    event_type: 'SENT_FOR_SIGNATURE',
                    description: 'Contrato PDF enviado para assinatura',
                  });
                  toast.success('Contrato enviado para assinatura');
                  if (onCreated) {
                    const full = await contractsService.getContractById(cid);
                    onCreated(full, 'signature');
                  } else {
                    clearContractCreateWizardPersist(undefined);
                    navigate(`/contracts/${cid}`);
                  }
                }}
              />
            </section>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t bg-background/95 p-3 backdrop-blur-md sm:hidden">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 gap-2"
            disabled={loading || documentLocked}
            onClick={() => void handlePdfSaveDraft()}
          >
            <Save className="h-4 w-4" />
            Salvar
          </Button>
          {canRequestContractSignature ? (
            <Button
              type="button"
              className="flex-1 gap-2"
              disabled={loading || documentLocked}
              onClick={() => void handlePdfSend()}
            >
              <Send className="h-4 w-4" />
              Enviar
            </Button>
          ) : null}
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
          <Button
            onClick={handleSendForSignature}
            disabled={loading || documentLocked || !canUseContracts || !canRequestContractSignature}
            title={
              !canRequestContractSignature ? "Sem permissão para pedir assinatura eletrónica." : undefined
            }
          >
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
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
                      <Label>WhatsApp</Label>
                      <Input
                        value={signer.whatsapp_phone ?? ''}
                        onChange={(e) => handleSignerChange(index, 'whatsapp_phone', e.target.value)}
                        placeholder="(11) 99999-9999"
                        disabled={documentLocked}
                        inputMode="tel"
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
