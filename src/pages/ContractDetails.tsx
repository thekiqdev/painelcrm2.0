import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contractsService } from "@/services/contracts";
import { useAuth } from "@/contexts/AuthContext";
import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { toast } from "@/components/ui/sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getContractDocumentHtml, hasMeaningfulDocumentHtml, isContractDraft } from "@/utils/contractDocument";
import { ContractA4Document } from "@/components/contracts/ContractA4Document";
import {
  ArrowLeft,
  MoreVertical,
  Send,
  Copy,
  Play,
  Square,
  XCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Users,
  Paperclip,
  Eye,
  Link2,
  FileSignature,
  Mail,
  Download,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Contract, ContractStatus, ContractSigner, ContractEvent } from "@/types/contracts";
import type {
  ContractPublicViewBootstrapResponse,
  ContractEvidenceSummaryPayload,
  ContractOperationalAuditKind,
  ContractSignatureInviteBootstrapItem,
} from "@/services/contracts";
import {
  CONTRACT_SIGN_TOKEN_STORAGE_PREFIX,
  persistSignatureInviteBootstrap,
  summarizeSignatureInviteBootstrap,
} from "@/utils/contractSignatureBootstrap";
import {
  buildInviteMessage,
  buildReminderMessage,
  buildViewOnlyMessage,
  buildContractMessagingContext,
} from "@/utils/contractMessagingTemplates";
import {
  formatBrazilTaxIdDisplay,
  isBrazilTaxIdDigits,
  normalizeBrazilTaxIdInput,
} from "@/utils/brazilTaxId";
import { canDeleteContractStatus, contractStatusHint, contractStatusShortLabel } from "@/utils/contractStatusUi";

function signatureImageDataUrl(signatureData: Record<string, unknown> | null | undefined): string | null {
  if (!signatureData) return null;
  const b64 = signatureData.signature_image_png_base64;
  if (typeof b64 !== "string" || !b64.trim()) return null;
  return `data:image/png;base64,${b64.trim()}`;
}

function persistSignToken(contractId: string, signerId: string, token: string) {
  try {
    sessionStorage.setItem(`${CONTRACT_SIGN_TOKEN_STORAGE_PREFIX}${contractId}:${signerId}`, token);
  } catch {
    /* ignore quota */
  }
}

function readSignToken(contractId: string, signerId: string): string | null {
  try {
    return sessionStorage.getItem(`${CONTRACT_SIGN_TOKEN_STORAGE_PREFIX}${contractId}:${signerId}`);
  } catch {
    return null;
  }
}

function clearSignToken(contractId: string, signerId: string) {
  try {
    sessionStorage.removeItem(`${CONTRACT_SIGN_TOKEN_STORAGE_PREFIX}${contractId}:${signerId}`);
  } catch {
    /* ignore */
  }
}

const ContractDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { canDeleteRecord, canEditRecord, hasPermissionKey } = useModulePermissions();
  const [contract, setContract] = useState<Contract | null>(null);
  const [signers, setSigners] = useState<ContractSigner[]>([]);
  const [events, setEvents] = useState<ContractEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [chatReturnTo, setChatReturnTo] = useState<string | null>(null);
  const [publicViewBootstrap, setPublicViewBootstrap] = useState<ContractPublicViewBootstrapResponse | null>(null);
  const [lastIssuedPublicToken, setLastIssuedPublicToken] = useState<string | null>(null);
  const [issuingPublicLink, setIssuingPublicLink] = useState(false);
  const [signInviteBusySignerId, setSignInviteBusySignerId] = useState<string | null>(null);
  const [lastSignatureTokensBySigner, setLastSignatureTokensBySigner] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("details");
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; title: string; body: string }>({
    open: false,
    title: "",
    body: "",
  });
  const [evidenceDialogOpen, setEvidenceDialogOpen] = useState(false);
  const [evidencePayload, setEvidencePayload] = useState<ContractEvidenceSummaryPayload | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signatureZoom, setSignatureZoom] = useState<{ src: string; name: string } | null>(null);
  const messageAuditRef = useRef<{
    copyKind: ContractOperationalAuditKind | null;
    signerId: string | null;
  }>({ copyKind: null, signerId: null });

  useEffect(() => {
    if (id && user) {
      loadContractData();
    }
  }, [id, user]);

  useEffect(() => {
    const st = location.state as {
      chatReturnTo?: string;
      signatureInviteBootstrap?: ContractSignatureInviteBootstrapItem[];
      publicView?: { token?: string };
    } | null;
    if (!st) return;
    const rt = typeof st.chatReturnTo === "string" ? st.chatReturnTo.trim() : "";
    if (rt) setChatReturnTo(rt);
  }, [location.state]);

  useEffect(() => {
    if (!id) return;
    const st = location.state as {
      chatReturnTo?: string;
      signatureInviteBootstrap?: ContractSignatureInviteBootstrapItem[];
      publicView?: { token?: string };
    } | null;
    const sig = st?.signatureInviteBootstrap;
    const pv = st?.publicView;
    if (!sig?.length && !pv?.token && !st?.chatReturnTo) return;

    const rest = { ...(st || {}) } as Record<string, unknown>;

    if (pv?.token) {
      setLastIssuedPublicToken(pv.token);
      delete rest.publicView;
    }

    if (sig?.length) {
      persistSignatureInviteBootstrap(id, sig);
      setLastSignatureTokensBySigner((prev) => {
        const next = { ...prev };
        for (const it of sig) {
          if ("token" in it && it.token) next[it.signer_id] = it.token;
        }
        return next;
      });
      const sum = summarizeSignatureInviteBootstrap(sig);
      if (sum && sum.alreadyActive > 0) {
        toast.message("Convite já estava ativo", {
          description:
            "Por segurança o sistema não reexibe o mesmo link. Abra a aba Links → menu (⋮) do signatário → «Regenerar e copiar» (o link anterior deixa de valer).",
        });
      }
      delete rest.signatureInviteBootstrap;
    }
    if (st?.chatReturnTo) {
      delete rest.chatReturnTo;
    }

    navigate(`/contracts/${id}`, {
      replace: true,
      state: Object.keys(rest).length ? (rest as { fromClientProfile?: boolean }) : undefined,
    });
  }, [id, location.state, navigate]);

  const loadContractData = async () => {
    if (!id) return;
    
    try {
      setLoading(true);

      // Load contract
      const contractData = await contractsService.getContractById(id);
      setContract(contractData);

      setPublicViewBootstrap(null);
      if (contractData.status !== "CANCELLED") {
        try {
          const boot = await contractsService.getPublicViewBootstrap(id);
          setPublicViewBootstrap(boot);
          if (boot.token) setLastIssuedPublicToken(boot.token);
          else setLastIssuedPublicToken(null);
        } catch {
          setPublicViewBootstrap(null);
        }
      } else {
        setLastIssuedPublicToken(null);
      }

      // Load signers
      const signersData = await contractsService.getContractSigners(id);
      setSigners(signersData);
      setLastSignatureTokensBySigner((prev) => {
        const next = { ...prev };
        for (const s of signersData) {
          const stored = readSignToken(id, s.id);
          if (stored && !next[s.id]) next[s.id] = stored;
        }
        return next;
      });

      // Load events
      const eventsData = await contractsService.getContractEvents(id);
      setEvents(eventsData);
    } catch (error) {
      console.error('Error loading contract:', error);
      toast.error('Erro ao carregar contrato');
      navigate('/contracts');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: ContractStatus) => {
    if (!id) return;
    
    try {
      await contractsService.updateContract(id, { status });

      // Create event
      await contractsService.createContractEvent(id, {
        event_type: 'STATUS_CHANGED',
        description: `Status alterado para ${status}`,
        metadata: { old_status: contract?.status, new_status: status },
      });

      toast.success('Status atualizado com sucesso');
      loadContractData();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status');
    }
  };

  /** Link público de visualização existe para todo contrato não cancelado (provisionado na criação ou ao abrir o painel). */
  const canAccessPublicViewLinks = contract && contract.status !== "CANCELLED";

  const eligiblePublicView =
    contract &&
    contract.status !== "CANCELLED" &&
    !isContractDraft(contract.status) &&
    hasMeaningfulDocumentHtml(getContractDocumentHtml(contract));

  const publicViewToken = lastIssuedPublicToken ?? publicViewBootstrap?.token ?? null;

  const canIssueSignatureInvites =
    contract &&
    contract.status !== "CANCELLED" &&
    (contract.status === "PENDING_SIGNATURE" || contract.status === "PARTIALLY_SIGNED") &&
    Boolean(String(contract.content_snapshot_html || "").trim()) &&
    hasMeaningfulDocumentHtml(String(contract.content_snapshot_html || ""));

  const copySignatureInviteUrl = (signerId: string) => {
    const tok = lastSignatureTokensBySigner[signerId];
    if (!tok) return;
    const abs = `${window.location.origin}/contract-sign/${tok}`;
    navigator.clipboard.writeText(abs);
    toast.success("Link de assinatura copiado.");
    if (id) {
      void contractsService
        .recordOperationalAudit(id, { action_kind: "LINK_SIGNATURE_COPIED", signer_id: signerId })
        .catch(() => {});
    }
  };

  const issueSignLink = async (signerId: string, regenerate: boolean) => {
    if (!id) return;
    setSignInviteBusySignerId(signerId);
    try {
      const res = await contractsService.issueSignatureInvite(id, signerId, { regenerate });
      persistSignToken(id, signerId, res.token);
      setLastSignatureTokensBySigner((m) => ({ ...m, [signerId]: res.token }));
      const abs = `${window.location.origin}${res.frontend_path}`;
      await navigator.clipboard.writeText(abs);
      toast.success(regenerate ? "Novo link de assinatura copiado." : "Link de assinatura copiado.");
      await loadContractData();
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "SIGNATURE_INVITE_ALREADY_EXISTS") {
        toast.message("Já existe convite ativo", {
          description: "Use «Regenerar» para invalidar o link anterior e obter um novo.",
        });
      } else if (err.code === "SIGNATURE_INVITE_CONFLICT") {
        toast.error("Conflito ao gravar o convite. Tente novamente.");
      } else {
        toast.error(err.message || "Não foi possível emitir o convite.");
      }
    } finally {
      setSignInviteBusySignerId(null);
    }
  };

  const revokeSignLink = async (signerId: string) => {
    if (!id) return;
    setSignInviteBusySignerId(signerId);
    try {
      await contractsService.revokeSignatureInvite(id, signerId);
      clearSignToken(id, signerId);
      setLastSignatureTokensBySigner((m) => {
        const next = { ...m };
        delete next[signerId];
        return next;
      });
      toast.success("Convite de assinatura revogado.");
      await loadContractData();
    } catch {
      toast.error("Não foi possível revogar o convite.");
    } finally {
      setSignInviteBusySignerId(null);
    }
  };

  const refreshPublicViewBootstrap = async () => {
    if (!id || !canAccessPublicViewLinks) return;
    try {
      const boot = await contractsService.getPublicViewBootstrap(id);
      setPublicViewBootstrap(boot);
      if (boot.token) setLastIssuedPublicToken(boot.token);
      else setLastIssuedPublicToken(null);
    } catch {
      setPublicViewBootstrap(null);
      setLastIssuedPublicToken(null);
    }
  };

  const copyPublicViewUrl = (token: string) => {
    const path = `/contract-view/${token}`;
    const abs = `${window.location.origin}${path}`;
    navigator.clipboard.writeText(abs);
    toast.success("Link de visualização copiado (somente leitura).");
  };

  /**
   * Sem link ativo: cria (POST regenerate false). Com link ativo: regenera (invalida URL anterior).
   * Não usado após revogar sem novo link — aí has_active_link é false e cria de novo.
   */
  const provisionOrRegeneratePublicViewAndCopy = async () => {
    if (!id) return;
    const regen = Boolean(publicViewBootstrap?.has_active_link);
    setIssuingPublicLink(true);
    try {
      const res = await contractsService.issuePublicViewLink(id, { regenerate: regen });
      setLastIssuedPublicToken(res.token);
      copyPublicViewUrl(res.token);
      await refreshPublicViewBootstrap();
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "CONTRACT_PUBLIC_VIEW_TOKEN_ALREADY_EXISTS" && !regen) {
        toast.message("Link já existe", { description: "Recarregue a página ou use regenerar se precisar de novo URL." });
      } else if (err.code === "CONTRACT_PUBLIC_VIEW_CONFLICT") {
        toast.error("Conflito ao gravar o link. Tente novamente.");
      } else {
        toast.error(err.message || "Não foi possível atualizar o link.");
      }
    } finally {
      setIssuingPublicLink(false);
    }
  };

  const revokePublicView = async () => {
    if (!id) return;
    setIssuingPublicLink(true);
    try {
      await contractsService.revokePublicViewLink(id);
      setLastIssuedPublicToken(null);
      toast.success("Link público revogado.");
      await refreshPublicViewBootstrap();
    } catch {
      toast.error("Não foi possível revogar o link.");
    } finally {
      setIssuingPublicLink(false);
    }
  };

  const handleDuplicate = async () => {
    if (!contract) return;

    try {
      const newContract = await contractsService.createContract({
        title: `${contract.title} (Cópia)`,
        client_id: contract.client_id || undefined,
        responsible_id: contract.responsible_id || undefined,
        template_id: contract.template_id || undefined,
        content_html: getContractDocumentHtml(contract) || undefined,
        content: contract.content || undefined,
        start_date: contract.start_date || undefined,
        end_date: contract.end_date || undefined,
        auto_renew: contract.auto_renew,
        renewal_period: contract.renewal_period || undefined,
        total_value: contract.total_value || undefined,
        currency: contract.currency,
        variables: contract.variables,
        signature_settings: contract.signature_settings,
        tags: contract.tags,
        status: 'DRAFT',
      });

      // Duplicate signers
      if (signers.length > 0) {
        for (const signer of signers) {
          const tid = normalizeBrazilTaxIdInput(signer.tax_id || "");
          if (!isBrazilTaxIdDigits(tid)) {
            toast.error(
              "Não foi possível duplicar: inclua CPF/CNPJ válido em todos os assinantes no contrato original (editar rascunho)."
            );
            return;
          }
          await contractsService.createContractSigner(newContract.id, {
            name: signer.name,
            email: signer.email,
            tax_id: tid,
            role: signer.role,
            signing_order: signer.signing_order || undefined,
          });
        }
      }

      toast.success('Contrato duplicado com sucesso');
      navigate(`/contracts/${newContract.id}`, {
        state: newContract.public_view?.token
          ? { publicView: { token: newContract.public_view.token } }
          : undefined,
      });
    } catch (error) {
      console.error('Error duplicating contract:', error);
      toast.error('Erro ao duplicar contrato');
    }
  };

  const getStatusBadge = (c: Contract) => {
    const allSigned = signers.length > 0 && signers.every((s) => Boolean(s.signed_at));
    const short = contractStatusShortLabel({ status: c.status, allSignersSigned: allSigned });
    const hint = contractStatusHint({ status: c.status, allSignersSigned: allSigned });
    const colors: Record<ContractStatus, string> = {
      DRAFT: "bg-gray-500",
      PENDING_SIGNATURE: "bg-yellow-500",
      PARTIALLY_SIGNED: "bg-blue-500",
      ACTIVE: "bg-green-500",
      INACTIVE: "bg-gray-400",
      EXPIRED: "bg-red-500",
      CANCELLED: "bg-red-600",
    };
    return (
      <Badge className={colors[c.status]} title={hint || undefined}>
        {short}
      </Badge>
    );
  };

  const getEventIcon = (eventType: string) => {
    const icons: Record<string, any> = {
      CREATED: FileText,
      STATUS_CHANGED: AlertCircle,
      SENT_FOR_SIGNATURE: Send,
      SIGNED: CheckCircle,
      VIEWED: Clock,
      SIGNATURE_INVITE_ISSUED: Mail,
      SIGNATURE_INVITE_REVOKED: XCircle,
      PUBLIC_SIGNATURE_COMPLETED: CheckCircle,
      PUBLIC_VIEW_LINK_ISSUED: Eye,
      PUBLIC_VIEW_LINK_REVOKED: XCircle,
      CONTRACT_ACCESS_TOKENS_REVOKED: XCircle,
      CONTRACT_OPERATIONS_AUDIT: Copy,
    };

    const Icon = icons[eventType] || Clock;
    return <Icon className="h-4 w-4" />;
  };

  function getContractStatusLabel(status: ContractStatus): string {
    const map: Record<ContractStatus, string> = {
      DRAFT: "Rascunho",
      PENDING_SIGNATURE: "Pendente de assinatura",
      PARTIALLY_SIGNED: "Parcialmente assinado",
      ACTIVE: "Ativo / concluído",
      INACTIVE: "Inativo",
      EXPIRED: "Expirado",
      CANCELLED: "Cancelado",
    };
    return map[status];
  }

  const signerSignatureUrl = (signerId: string) => {
    const tok = lastSignatureTokensBySigner[signerId];
    return tok ? `${window.location.origin}/contract-sign/${tok}` : null;
  };

  function buildMessagingContext(signer: ContractSigner) {
    if (!contract) {
      return buildContractMessagingContext({
        origin: window.location.origin,
        organizationName: "",
        clientName: null,
        contractTitle: "",
        contractNumber: "",
        contractStatusLabel: "",
        signerName: signer.name,
        signerEmail: signer.email,
      });
    }
    let contractStatusLabel = getContractStatusLabel(contract.status);
    if (
      contract.status === "ACTIVE" &&
      signers.length > 0 &&
      signers.every((s) => Boolean(s.signed_at))
    ) {
      contractStatusLabel = "Concluído (contrato ativo no sistema)";
    }
    return buildContractMessagingContext({
      origin: window.location.origin,
      organizationName: user?.company_name?.trim() || user?.email || "Empresa",
      clientName: null,
      contractTitle: contract.title,
      contractNumber: contract.contract_number,
      contractStatusLabel,
      signerName: signer.name,
      signerEmail: signer.email,
      signatureLink: signerSignatureUrl(signer.id) ?? undefined,
      viewLink: publicViewToken ? `${window.location.origin}/contract-view/${publicViewToken}` : undefined,
    });
  }

  const openReadyMessage = (
    title: string,
    body: string,
    audit?: {
      openKind?: ContractOperationalAuditKind;
      copyKind?: ContractOperationalAuditKind;
      signerId?: string | null;
    }
  ) => {
    messageAuditRef.current = {
      copyKind: audit?.copyKind ?? null,
      signerId: audit?.signerId ?? null,
    };
    if (id && audit?.openKind) {
      void contractsService
        .recordOperationalAudit(id, {
          action_kind: audit.openKind,
          signer_id: audit.signerId ?? undefined,
        })
        .catch(() => {});
    }
    setMessageDialog({ open: true, title, body });
  };

  const copyPlain = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Texto copiado.");
    const a = messageAuditRef.current;
    if (id && a.copyKind) {
      void contractsService
        .recordOperationalAudit(id, {
          action_kind: a.copyKind,
          signer_id: a.signerId ?? undefined,
        })
        .catch(() => {});
    }
  };

  const handleDownloadPdf = async () => {
    if (!id) return;
    setPdfLoading(true);
    try {
      await contractsService.downloadContractPdf(id);
      toast.success("Transferência do PDF iniciada.");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Falha ao gerar PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDeleteContract = async () => {
    if (!id || !contract) return;
    try {
      setDeleting(true);
      await contractsService.deleteContract(id);
      toast.success("Contrato excluído com sucesso");
      navigate("/contracts");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao excluir contrato";
      toast.error(msg);
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const openEvidenceDialog = async () => {
    if (!id) return;
    setEvidenceLoading(true);
    setEvidencePayload(null);
    try {
      const data = await contractsService.getEvidenceSummary(id);
      setEvidencePayload(data);
      setEvidenceDialogOpen(true);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Não foi possível carregar evidências.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  const exportEvidenceJson = () => {
    if (!evidencePayload || !contract) return;
    const blob = new Blob([JSON.stringify(evidencePayload, null, 2)], {
      type: "application/json",
    });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = u;
    a.download = `evidencias-contrato-${contract.contract_number}.json`;
    a.click();
    URL.revokeObjectURL(u);
    toast.success("Ficheiro JSON transferido.");
  };

  const inviteStateBadge = (signer: ContractSigner) => {
    if (signer.signed_at) {
      return <Badge className="bg-green-600 whitespace-nowrap">Assinatura OK</Badge>;
    }
    const st = signer.signature_invite?.last?.status ?? "none";
    const labels: Record<string, string> = {
      none: "Sem convite",
      active: "Convite ativo",
      expired: "Convite expirado",
      revoked: "Convite revogado",
      consumed: "Convite utilizado",
    };
    const cls: Record<string, string> = {
      none: "bg-muted text-muted-foreground border border-border",
      active: "bg-emerald-600",
      expired: "bg-amber-600",
      revoked: "bg-destructive",
      consumed: "bg-slate-600",
    };
    return (
      <Badge className={`${cls[st] ?? cls.none} whitespace-nowrap`}>{labels[st] ?? st}</Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-muted-foreground">Carregando...</div>
        </div>
      </div>
    );
  }

  if (!contract) {
    return null;
  }

  const contractAllSigned = signers.length > 0 && signers.every((s) => Boolean(s.signed_at));
  const canDownloadPdf = Boolean(String(contract.content_snapshot_html || "").trim());
  const canDeleteCurrentContract =
    canDeleteContractStatus(contract.status) &&
    canDeleteRecord("contracts", contract.responsible_id || contract.user_id, user?.id);

  const canEditThisContract =
    Boolean(user?.id) &&
    canEditRecord("contracts", contract.responsible_id || contract.user_id, user?.id);
  const canContractSendOps = canEditThisContract && hasPermissionKey("contracts.send");
  const canContractSignatureOps = canEditThisContract && hasPermissionKey("contracts.request_signature");
  const canContractCancelStatus = canEditThisContract && hasPermissionKey("contracts.cancel");

  return (
    <div className="space-y-6">
      {chatReturnTo ? (
        <Alert className="border-primary/35 bg-primary/5">
          <Link2 className="h-4 w-4 text-primary" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-foreground/90">
              Contrato criado a partir do chat. Pode voltar à conversa para continuar o atendimento.
            </span>
            <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => navigate(chatReturnTo)}>
              Voltar para conversa
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0"
            onClick={() => {
              // Se veio do perfil do cliente, voltar para o perfil
              // Caso contrário, voltar para a listagem geral de contratos
              if (location.state?.fromClientProfile && contract.client_id) {
                navigate(`/clients/${contract.client_id}/contracts`);
              } else {
                navigate('/contracts');
              }
            }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-lg font-bold leading-tight sm:text-2xl">{contract.title}</h1>
              {getStatusBadge(contract)}
              {contractAllSigned ? (
                <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
                  Todas as assinaturas concluídas
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              Nº {contract.contract_number} • Atualizado em{" "}
              {format(new Date(contract.updated_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
            {contractAllSigned ? (
              <Badge variant="secondary" className="mt-2 font-normal sm:hidden">
                Assinaturas OK
              </Badge>
            ) : null}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="shrink-0 sm:h-10 sm:w-auto sm:px-4" aria-label="Ações">
              <MoreVertical className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Ações</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canAccessPublicViewLinks && (
              <DropdownMenuItem
                onClick={() => {
                  setActiveTab("links");
                  void refreshPublicViewBootstrap();
                }}
              >
                <Link2 className="mr-2 h-4 w-4" />
                Abrir aba Links
              </DropdownMenuItem>
            )}
            {contract.status === 'DRAFT' && id && (
              <DropdownMenuItem
                disabled={!canContractSignatureOps}
                title={!canContractSignatureOps ? "Sem permissão para pedir assinatura." : undefined}
                onClick={() => navigate(`/contracts/${id}/edit`)}
              >
                <Send className="mr-2 h-4 w-4" />
                Editar e enviar para assinatura
              </DropdownMenuItem>
            )}
            {canDownloadPdf && (
              <DropdownMenuItem
                disabled={pdfLoading}
                onClick={() => void handleDownloadPdf()}
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar PDF (snapshot)
              </DropdownMenuItem>
            )}
            {contract.status !== "DRAFT" && (
              <DropdownMenuItem
                disabled={evidenceLoading}
                onClick={() => void openEvidenceDialog()}
              >
                <FileText className="mr-2 h-4 w-4" />
                Ver resumo de evidências
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleDuplicate()}>
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </DropdownMenuItem>
            {contract.status === 'DRAFT' && (
              <DropdownMenuItem
                disabled={!canContractSendOps}
                title={!canContractSendOps ? "Sem permissão para enviar/ativar o contrato." : undefined}
                onClick={() => handleStatusChange('ACTIVE')}
              >
                <Play className="mr-2 h-4 w-4" />
                Ativar
              </DropdownMenuItem>
            )}
            {contract.status === 'ACTIVE' && (
              <DropdownMenuItem onClick={() => handleStatusChange('INACTIVE')}>
                <Square className="mr-2 h-4 w-4" />
                Inativar
              </DropdownMenuItem>
            )}
            {contract.status !== 'CANCELLED' && (
              <DropdownMenuItem
                disabled={!canContractCancelStatus}
                title={!canContractCancelStatus ? "Sem permissão para cancelar o contrato." : undefined}
                onClick={() => handleStatusChange('CANCELLED')}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Cancelar
              </DropdownMenuItem>
            )}
            {canDeleteCurrentContract && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Excluir contrato
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="border bg-muted/20 md:hidden">
        <CardContent className="grid gap-3 p-4 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-muted-foreground">Valor</span>
            <span className="text-lg font-semibold tabular-nums">
              {contract.total_value != null
                ? new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: contract.currency || "BRL",
                  }).format(Number(contract.total_value))
                : "—"}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
            <span>Início</span>
            <span className="font-medium text-foreground">
              {contract.start_date
                ? format(new Date(contract.start_date), "dd/MM/yyyy", { locale: ptBR })
                : "—"}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
            <span>Fim</span>
            <span className="font-medium text-foreground">
              {contract.end_date ? format(new Date(contract.end_date), "dd/MM/yyyy", { locale: ptBR }) : "—"}
            </span>
          </div>
          <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
            <span>Signatários</span>
            <span className="font-medium text-foreground">{signers.length}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-col gap-1 p-1 sm:flex-row sm:flex-wrap">
          <TabsTrigger value="details" className="justify-start text-xs sm:text-sm">
            <FileText className="mr-2 h-4 w-4 shrink-0" />
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="signers" className="justify-start text-xs sm:text-sm">
            <Users className="mr-2 h-4 w-4 shrink-0" />
            Assinaturas ({signers.length})
          </TabsTrigger>
          <TabsTrigger value="links" className="justify-start text-xs sm:text-sm">
            <Link2 className="mr-2 h-4 w-4 shrink-0" />
            Links
          </TabsTrigger>
          <TabsTrigger value="timeline" className="justify-start text-xs sm:text-sm">
            <Clock className="mr-2 h-4 w-4 shrink-0" />
            Timeline ({events.length})
          </TabsTrigger>
          <TabsTrigger value="attachments" className="justify-start text-xs sm:text-sm">
            <Paperclip className="mr-2 h-4 w-4" />
            Anexos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Vigência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Início</div>
                    <div>{contract.start_date ? format(new Date(contract.start_date), 'dd/MM/yyyy') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Término</div>
                    <div>{contract.end_date ? format(new Date(contract.end_date), 'dd/MM/yyyy') : '-'}</div>
                  </div>
                  {contract.auto_renew && (
                    <div>
                      <Badge variant="outline">Renovação Automática</Badge>
                      <div className="text-xs text-muted-foreground mt-1">
                        {contract.renewal_period} meses
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Financeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Valor Total</div>
                    <div className="text-lg font-semibold">
                      {contract.total_value
                        ? new Intl.NumberFormat('pt-BR', {
                            style: 'currency',
                            currency: contract.currency,
                          }).format(Number(contract.total_value))
                        : '-'}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Informações</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Criado em</div>
                    <div>{format(new Date(contract.created_at), 'dd/MM/yyyy HH:mm')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Atualizado em</div>
                    <div>{format(new Date(contract.updated_at), 'dd/MM/yyyy HH:mm')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Conteúdo do Contrato</CardTitle>
            </CardHeader>
            <CardContent className="rounded-lg bg-muted/40 p-3 sm:p-4 border border-border/50">
              <ContractA4Document
                html={getContractDocumentHtml(contract) || "<p>Sem conteúdo.</p>"}
                signersAppendix={signers.map((s) => {
                  const b64 =
                    typeof s.signature_data?.signature_image_png_base64 === "string"
                      ? s.signature_data.signature_image_png_base64
                      : null;
                  return {
                    name: s.name,
                    email: s.email,
                    tax_id: s.tax_id ?? null,
                    signed: Boolean(s.signed_at),
                    signed_at: s.signed_at,
                    signature_image_png_base64: b64?.trim() ? b64.trim() : null,
                  };
                })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signers">
          <Card>
            <CardHeader>
              <CardTitle>Assinantes</CardTitle>
              <CardDescription>
                Estado da assinatura, CPF/CNPJ, atalhos quando o token estiver neste browser e evidências. Convites
                adicionais ficam na aba <strong>Links</strong>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Ordem</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead className="whitespace-nowrap">CPF/CNPJ</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Assinado em</TableHead>
                    <TableHead className="w-[88px] min-w-[88px] text-center">Assinatura</TableHead>
                    <TableHead className="w-[120px] min-w-[120px]">e-sign</TableHead>
                    <TableHead className="min-w-[140px]">Evid. mín.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signers.map((signer) => {
                    const sigImg = signatureImageDataUrl(
                      signer.signature_data as Record<string, unknown> | null | undefined
                    );
                    return (
                    <TableRow key={signer.id}>
                        <TableCell>{signer.signing_order || "-"}</TableCell>
                      <TableCell className="font-medium">{signer.name}</TableCell>
                        <TableCell className="max-w-[180px] truncate" title={signer.email}>
                          {signer.email}
                        </TableCell>
                        <TableCell className="font-mono text-xs whitespace-nowrap">
                          {signer.tax_id ? formatBrazilTaxIdDisplay(signer.tax_id) : "—"}
                        </TableCell>
                      <TableCell>
                          <Badge variant={signer.role === "CLIENT" ? "default" : "secondary"}>
                            {signer.role === "CLIENT" ? "Cliente" : "Interno"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {signer.signed_at ? (
                            <Badge className="bg-green-500 whitespace-nowrap">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Assinado
                          </Badge>
                        ) : (
                            <Badge variant="outline" className="whitespace-nowrap">
                            <Clock className="mr-1 h-3 w-3" />
                            Pendente
                          </Badge>
                        )}
                      </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                        {signer.signed_at
                            ? format(new Date(signer.signed_at), "dd/MM/yyyy HH:mm")
                            : "—"}
                        </TableCell>
                        <TableCell className="align-middle">
                          {lastSignatureTokensBySigner[signer.id] ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label="Copiar link de assinatura"
                                title={
                                  !canContractSignatureOps
                                    ? "Sem permissão para copiar link de assinatura."
                                    : "Copiar link de assinatura"
                                }
                                disabled={!canContractSignatureOps}
                                onClick={() => copySignatureInviteUrl(signer.id)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="icon"
                                className="h-8 w-8 shrink-0"
                                aria-label="Abrir página de assinatura"
                                title={
                                  !canContractSignatureOps
                                    ? "Sem permissão para abrir o fluxo de assinatura."
                                    : "Abrir página de assinatura"
                                }
                                disabled={!canContractSignatureOps}
                                onClick={() => {
                                  const tok = lastSignatureTokensBySigner[signer.id];
                                  if (tok)
                                    window.open(
                                      `${window.location.origin}/contract-sign/${tok}`,
                                      "_blank",
                                      "noopener,noreferrer"
                                    );
                                }}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div
                              className="flex justify-center text-muted-foreground"
                              title="Gere ou copie o convite na aba Links para o endereço ficar disponível aqui."
                            >
                              —
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="align-middle py-4 px-3">
                          {signer.signed_at && sigImg ? (
                            <button
                              type="button"
                              className="rounded-md border bg-white p-1.5 shadow-sm hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring block mx-auto"
                              onClick={() => setSignatureZoom({ src: sigImg, name: signer.name })}
                              title="Ampliar assinatura"
                            >
                              <img
                                src={sigImg}
                                alt=""
                                width={96}
                                height={40}
                                className="h-10 w-24 object-contain"
                                loading="lazy"
                                decoding="async"
                              />
                            </button>
                          ) : signer.signed_at ? (
                            <span className="text-[10px] text-muted-foreground">Sem imagem</span>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-xs align-top">
                          {signer.signed_at && signer.signature_data ? (
                            <div className="space-y-0.5 max-w-[200px]">
                              {typeof signer.signature_data.client_ip === "string" && (
                                <div>IP: {signer.signature_data.client_ip}</div>
                              )}
                              {typeof signer.signature_data.user_agent === "string" && (
                                <div className="truncate" title={signer.signature_data.user_agent}>
                                  UA: {signer.signature_data.user_agent.slice(0, 48)}
                                  {signer.signature_data.user_agent.length > 48 ? "…" : ""}
                                </div>
                              )}
                              {typeof signer.signature_data.method === "string" && (
                                <div>Método: {signer.signature_data.method}</div>
                              )}
                              {typeof signer.signature_data.accepted_terms_version === "string" && (
                                <div>Versão aceite: {signer.signature_data.accepted_terms_version}</div>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="links" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Visualização pública</CardTitle>
              <CardDescription>
                Link <strong>somente leitura</strong> do contrato (usa snapshot quando existir). Quem abre não assina
                nem altera o estado pelo painel.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canAccessPublicViewLinks ? (
                <p className="text-sm text-muted-foreground">Indisponível para contrato cancelado.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {publicViewBootstrap?.has_active_link ? (
                      <Badge variant="secondary" className="whitespace-nowrap">
                        Link público disponível
                      </Badge>
                    ) : (
                      <Badge variant="outline">Sem link ativo</Badge>
                    )}
                    {publicViewBootstrap?.has_active_link && publicViewBootstrap.created_at ? (
                      <span className="text-muted-foreground">
                        Ativo desde{" "}
                        {format(new Date(publicViewBootstrap.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </span>
                    ) : null}
                  </div>
                  {publicViewBootstrap?.legacy_token_not_retrievable ? (
                    <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900 rounded-md px-3 py-2 max-w-xl">
                      Este contrato tem link criado antes da atualização do sistema. Use «Regenerar e copiar» uma vez
                      para sincronizar o endereço com o painel (o URL antigo deixa de funcionar).
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground max-w-xl">
                    O link nasce com o contrato. «Regenerar» cria um novo endereço e invalida o anterior.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!publicViewToken || !canContractSendOps}
                      title={!canContractSendOps ? "Sem permissão para copiar o link público." : undefined}
                      onClick={() => publicViewToken && copyPublicViewUrl(publicViewToken)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!publicViewToken || !canContractSendOps}
                      title={!canContractSendOps ? "Sem permissão para abrir o link público." : undefined}
                      onClick={() => {
                        if (publicViewToken) {
                          window.open(
                            `${window.location.origin}/contract-view/${publicViewToken}`,
                            "_blank",
                            "noopener,noreferrer"
                          );
                        }
                      }}
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Abrir link
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" size="sm" variant="secondary" disabled={issuingPublicLink}>
                          <MoreVertical className="mr-2 h-4 w-4" />
                          Opções avançadas
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem
                          disabled={issuingPublicLink || !canContractSendOps}
                          title={!canContractSendOps ? "Sem permissão para gerir link público." : undefined}
                          onClick={() => void provisionOrRegeneratePublicViewAndCopy()}
                        >
                          {publicViewBootstrap?.has_active_link ? "Regenerar e copiar" : "Criar link e copiar"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={
                            issuingPublicLink || !publicViewBootstrap?.has_active_link || !canContractSendOps
                          }
                          title={!canContractSendOps ? "Sem permissão para revogar o link público." : undefined}
                          onClick={() => void revokePublicView()}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Revogar link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Links de assinatura</CardTitle>
              <CardDescription>
                Um convite por signatário. «Copiar» / «Abrir» usam o token deste browser quando disponível.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Assinatura</TableHead>
                    <TableHead>Convite</TableHead>
                    <TableHead className="w-[100px]">Copiar</TableHead>
                    <TableHead className="w-[100px]">Abrir</TableHead>
                    <TableHead className="w-12 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signers.map((signer) => {
                    const sigImg = signatureImageDataUrl(
                      signer.signature_data as Record<string, unknown> | null | undefined
                    );
                    return (
                      <TableRow key={`link-${signer.id}`}>
                        <TableCell className="font-medium">
                          <div>{signer.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={signer.email}>
                            {signer.email}
                          </div>
                        </TableCell>
                        <TableCell>
                          {signer.signed_at ? (
                            <Badge className="bg-green-600 whitespace-nowrap">Assinado</Badge>
                          ) : (
                            <Badge variant="outline">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell>{inviteStateBadge(signer)}</TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={!lastSignatureTokensBySigner[signer.id] || !canContractSignatureOps}
                            title={!canContractSignatureOps ? "Sem permissão para copiar link de assinatura." : undefined}
                            onClick={() => copySignatureInviteUrl(signer.id)}
                          >
                            <Copy className="mr-1 h-3 w-3" />
                            Copiar
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full sm:w-auto"
                            disabled={!lastSignatureTokensBySigner[signer.id] || !canContractSignatureOps}
                            title={!canContractSignatureOps ? "Sem permissão para abrir assinatura." : undefined}
                            onClick={() => {
                              const t = lastSignatureTokensBySigner[signer.id];
                              if (t) {
                                if (id) {
                                  void contractsService
                                    .recordOperationalAudit(id, {
                                      action_kind: "LINK_SIGNATURE_OPENED",
                                      signer_id: signer.id,
                                    })
                                    .catch(() => {});
                                }
                                window.open(
                                  `${window.location.origin}/contract-sign/${t}`,
                                  "_blank",
                                  "noopener,noreferrer"
                                );
                              }
                            }}
                          >
                            <Play className="mr-1 h-3 w-3" />
                            Abrir
                          </Button>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label="Mais ações"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {signer.signed_at ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={!sigImg}
                                    onClick={() => sigImg && setSignatureZoom({ src: sigImg, name: signer.name })}
                                  >
                                    <Eye className="mr-2 h-4 w-4" />
                                    Ampliar assinatura
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={!canContractSendOps}
                                    title={!canContractSendOps ? "Sem permissão para partilhar link de visualização." : undefined}
                                    onClick={() =>
                                      openReadyMessage(
                                        "Mensagem — só visualização",
                                        buildViewOnlyMessage(buildMessagingContext(signer)),
                                        {
                                          openKind: "MESSAGE_VIEW_OPENED",
                                          copyKind: "MESSAGE_VIEW_COPIED",
                                          signerId: signer.id,
                                        }
                                      )
                                    }
                                  >
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Texto view
                                  </DropdownMenuItem>
                                </>
                              ) : canIssueSignatureInvites ? (
                                <>
                                  <DropdownMenuItem
                                    disabled={
                                      signInviteBusySignerId === signer.id || !canContractSignatureOps
                                    }
                                    title={!canContractSignatureOps ? "Sem permissão para convites de assinatura." : undefined}
                                    onClick={() => void issueSignLink(signer.id, false)}
                                  >
                                    <FileSignature className="mr-2 h-4 w-4" />
                                    Gerar e copiar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={
                                      signInviteBusySignerId === signer.id || !canContractSignatureOps
                                    }
                                    title={!canContractSignatureOps ? "Sem permissão para convites de assinatura." : undefined}
                                    onClick={() => void issueSignLink(signer.id, true)}
                                  >
                                    <Link2 className="mr-2 h-4 w-4" />
                                    Regenerar e copiar
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={
                                      !signer.signature_invite?.has_active || !canContractSignatureOps
                                    }
                                    title={!canContractSignatureOps ? "Sem permissão para mensagens de assinatura." : undefined}
                                    onClick={() => {
                                      const ctx = buildMessagingContext(signer);
                                      if (!ctx.signatureLink) {
                                        toast.message("Gere ou copie o convite primeiro", {
                                          description:
                                            "Use «Gerar e copiar» abaixo ou reabra a página após enviar o contrato. Os tokens ficam neste browser.",
                                        });
                                        return;
                                      }
                                      openReadyMessage(
                                        "Mensagem — lembrete (mesmo convite)",
                                        buildReminderMessage(ctx),
                                        {
                                          openKind: "MESSAGE_REMINDER_OPENED",
                                          copyKind: "MESSAGE_REMINDER_COPIED",
                                          signerId: signer.id,
                                        }
                                      );
                                    }}
                                  >
                                    <Mail className="mr-2 h-4 w-4" />
                                    Lembrete
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    disabled={!canContractSignatureOps}
                                    title={!canContractSignatureOps ? "Sem permissão para mensagens de assinatura." : undefined}
                                    onClick={() =>
                                      openReadyMessage(
                                        "Mensagem — convite inicial",
                                        buildInviteMessage(buildMessagingContext(signer)),
                                        {
                                          openKind: "MESSAGE_INVITE_OPENED",
                                          copyKind: "MESSAGE_INVITE_COPIED",
                                          signerId: signer.id,
                                        }
                                      )
                                    }
                                  >
                                    <MessageSquare className="mr-2 h-4 w-4" />
                                    Texto convite
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    disabled={!canContractSendOps}
                                    title={!canContractSendOps ? "Sem permissão para partilhar link de visualização." : undefined}
                                    onClick={() =>
                                      openReadyMessage(
                                        "Mensagem — só visualização",
                                        buildViewOnlyMessage(buildMessagingContext(signer)),
                                        {
                                          openKind: "MESSAGE_VIEW_OPENED",
                                          copyKind: "MESSAGE_VIEW_COPIED",
                                          signerId: signer.id,
                                        }
                                      )
                                    }
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Texto view
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    disabled={
                                      signInviteBusySignerId === signer.id ||
                                      !signer.signature_invite?.has_active ||
                                      !canContractSignatureOps
                                    }
                                    title={!canContractSignatureOps ? "Sem permissão para revogar convite." : undefined}
                                    onClick={() => void revokeSignLink(signer.id)}
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Revogar convite
                                  </DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem disabled>Indisponível neste estado</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>Timeline de Eventos</CardTitle>
              <CardDescription>
                Histórico completo de atividades do contrato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {events.map((event) => (
                  <div key={event.id} className="flex gap-4 pb-4 border-b last:border-0">
                    <div className="flex-shrink-0 mt-1">
                      {getEventIcon(event.event_type)}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{event.description}</div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(event.created_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                ))}

                {events.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    Nenhum evento registrado
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attachments">
          <Card>
            <CardHeader>
              <CardTitle>Anexos</CardTitle>
              <CardDescription>
                Documentos e arquivos relacionados ao contrato
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Nenhum anexo disponível
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={messageDialog.open} onOpenChange={(o) => setMessageDialog((m) => ({ ...m, open: o }))}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{messageDialog.title}</DialogTitle>
            <DialogDescription>
              Copie o texto e envie pelo canal habitual (e-mail, WhatsApp, etc.). O PainelCRM não envia
              automaticamente nesta versão.
            </DialogDescription>
          </DialogHeader>
          <pre className="text-sm whitespace-pre-wrap rounded-md border bg-muted/40 p-3">{messageDialog.body}</pre>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="secondary" onClick={() => copyPlain(messageDialog.body)}>
              <Copy className="mr-2 h-4 w-4" />
              Copiar texto
            </Button>
            <Button type="button" onClick={() => setMessageDialog((m) => ({ ...m, open: false }))}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={evidenceDialogOpen} onOpenChange={setEvidenceDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resumo de evidências (auditoria mínima)</DialogTitle>
            <DialogDescription>
              Dados extraídos de cada assinatura pública. Exporte JSON para arquivo ou arquivo externo.
            </DialogDescription>
          </DialogHeader>
          {evidenceLoading ? (
            <div className="text-sm text-muted-foreground py-6">A carregar…</div>
          ) : evidencePayload ? (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium mb-2">Resumo por signatário</div>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  {(evidencePayload.summary_lines && evidencePayload.summary_lines.length > 0
                    ? evidencePayload.summary_lines
                    : evidencePayload.signers.map((s) =>
                        s.signed_at
                          ? `${s.name} — assinado em ${format(new Date(s.signed_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}`
                          : `${s.name} — pendente`
                      )
                  ).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
                {evidencePayload.generated_at && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Gerado em UTC: {evidencePayload.generated_at}
                    {evidencePayload.schema_version ? ` · ${evidencePayload.schema_version}` : ""}
                  </p>
                )}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Ver JSON técnico completo</summary>
                <pre className="text-xs whitespace-pre-wrap rounded-md border bg-muted/40 p-3 max-h-[40vh] overflow-auto mt-2">
                  {JSON.stringify(evidencePayload, null, 2)}
                </pre>
              </details>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Sem dados.</div>
          )}
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              type="button"
              variant="secondary"
              disabled={!evidencePayload}
              onClick={() => {
                if (evidencePayload) void navigator.clipboard.writeText(JSON.stringify(evidencePayload, null, 2));
                toast.success("JSON copiado.");
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copiar JSON
            </Button>
            <Button type="button" disabled={!evidencePayload} onClick={exportEvidenceJson}>
              <Download className="mr-2 h-4 w-4" />
              Exportar .json
            </Button>
            <Button type="button" variant="outline" onClick={() => setEvidenceDialogOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(signatureZoom)} onOpenChange={(o) => !o && setSignatureZoom(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assinatura — {signatureZoom?.name}</DialogTitle>
            <DialogDescription>
              Imagem PNG capturada na página pública de assinatura e ligada a este signatário.
            </DialogDescription>
          </DialogHeader>
          {signatureZoom ? (
            <div className="flex justify-center rounded-md border bg-white p-4">
              <img
                src={signatureZoom.src}
                alt=""
                className="max-h-[240px] w-full object-contain"
                decoding="async"
              />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSignatureZoom(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir contrato</DialogTitle>
            <DialogDescription>
              Esta ação é irreversível e remove o contrato da empresa, incluindo links e evidências relacionadas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Contrato:</span> {contract.title}
            </p>
            <p>
              <span className="text-muted-foreground">Número:</span> {contract.contract_number}
            </p>
            <p>
              <span className="text-muted-foreground">Status atual:</span>{" "}
              {contractStatusShortLabel({ status: contract.status, allSignersSigned: contractAllSigned })}
            </p>
            <p className="pt-1 text-xs text-muted-foreground">
              Regra de segurança: apenas contratos cancelados ou inativos podem ser excluídos.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleDeleteContract()} disabled={deleting}>
              {deleting ? "Excluindo..." : "Confirmar exclusão"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractDetails;
