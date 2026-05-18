import { useCallback, useEffect, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useNavigate } from "react-router-dom";

import { MessageCircle, Ticket, UserPlus } from "lucide-react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import {

  AlertDialog,

  AlertDialogAction,

  AlertDialogCancel,

  AlertDialogContent,

  AlertDialogDescription,

  AlertDialogFooter,

  AlertDialogHeader,

  AlertDialogTitle,

} from "@/components/ui/alert-dialog";

import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useEntityWhatsappAvatar } from "@/hooks/useEntityWhatsappAvatar";

import { useAuth } from "@/contexts/AuthContext";

import { useFloatingChatOptional } from "@/features/floating-chat/floatingChatContext";

import { apiClient } from "@/integrations/api/client";

import { formatBrazilianPhone, resolveEntityDisplayName } from "@/lib/formatters/phone";

import { cn } from "@/lib/utils";

import { entityDrawerStore } from "@/stores/entityDrawerStore";
import { pickConvertedClientId } from "@/lib/entity/resolveEntityIdentity";

import { ClientQuickView } from "./ClientQuickView";
import { QuickViewError, QuickViewLoading } from "./entityQuickViewShared";

import { EntityRecentActivity } from "./EntityRecentActivitySection";

import { hasLinkedConversation } from "./entityRecentActivityUtils";

import { EntityQuickViewKpis } from "./EntityQuickViewKpis";

import { useEntityQuickViewMetrics } from "./useEntityQuickViewMetrics";

import { openEntityWhatsAppFloatingChat } from "./entityQuickViewChat";

import { newTicketForLeadUrl } from "./entityQuickViewRoutes";

import {

  EntityQuickViewHeader,

  EntityQuickViewPrimaryActions,

  EntityQuickViewProfileButton,

  EntityQuickViewQuickActions,

  EntityQuickViewScrollBody,

  EntityQuickViewShell,

  EntityQuickViewSummary,

  formatQuickViewDate,

  type EntityQuickActionItem,

  type SummaryRow,

} from "./entityQuickViewLayout";



export type LeadQuickViewData = {

  id: string;

  name: string;

  email?: string | null;

  phone?: string | null;

  company?: string | null;

  status?: string | null;

  source?: string | null;

  notes?: string | null;

  whatsapp_avatar_url?: string | null;

  migrated_client_id?: string | null;

  created_at?: string | null;

  updated_at?: string | null;

  last_message_at?: string | null;

  conversation_id?: string | null;

  tickets?: Array<{ id?: string; ticket_number?: string; created_at?: string; status?: string }>;

};



type Props = {

  leadId: string;

  onRequestClose: () => void;

  onOpenFullProfile: () => void;

};



function permissionMessageFromError(details: unknown): string | null {

  const status =

    details && typeof details === "object" && "status" in details

      ? Number((details as { status?: number }).status)

      : null;

  if (status === 403) {

    return "Você não tem permissão para visualizar esta entidade.";

  }

  if (status === 404) return "Lead não encontrado.";

  return null;

}



export function LeadQuickView({ leadId, onRequestClose, onOpenFullProfile }: Props) {

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const floatingChat = useFloatingChatOptional();

  const { user } = useAuth();

  const { canView, hasPermissionKey } = useModulePermissions();

  const [lead, setLead] = useState<LeadQuickViewData | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [convertOpen, setConvertOpen] = useState(false);

  const [converting, setConverting] = useState(false);

  const [chatBusy, setChatBusy] = useState(false);



  const canViewChat = canView("chat");

  const canViewTickets = canView("tickets");



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const res = await apiClient.get<LeadQuickViewData>(`/api/leads/${leadId}`);

      if (res.error) {

        setLead(null);

        setError(permissionMessageFromError(res.details) ?? res.error);

        return;

      }

      setLead(res.data ?? null);

      if (!res.data) setError("Lead não encontrado.");

    } catch {

      setError("Não foi possível carregar o lead.");

    } finally {

      setLoading(false);

    }

  }, [leadId]);



  useEffect(() => {

    void load();

  }, [load]);

  useEffect(() => {
    if (!lead) return;
    const clientId = pickConvertedClientId(lead);
    if (clientId) {
      entityDrawerStore.open("client", clientId);
    }
  }, [lead]);

  const metrics = useEntityQuickViewMetrics({

    entityKind: "lead",

    entityId: leadId,

    canViewFinance: false,

    canViewTickets,

    canViewChat,

    seedTickets: lead?.tickets,

  });

  const profileAvatarUrl = useEntityWhatsappAvatar({
    entityKind: "lead",
    entityId: lead?.id ?? leadId,
    entity: lead,
    enabled: Boolean(lead) && !pickConvertedClientId(lead),
  });

  const closeDrawer = () => entityDrawerStore.close();



  const openWhatsApp = async () => {

    if (!lead || chatBusy) return;

    setChatBusy(true);

    try {

      await openEntityWhatsAppFloatingChat({

        entityKind: "lead",

        entityId: lead.id,

        phone: lead.phone,

        floatingChat,

        queryClient,

        onBeforeOpen: onRequestClose,

      });

    } finally {

      setChatBusy(false);

    }

  };



  const openTickets = () => {

    if (!lead) return;

    closeDrawer();

    navigate(newTicketForLeadUrl(lead.id));

  };



  const handleConvert = async () => {

    if (!lead || !user) return;

    setConverting(true);

    try {

      const { addClient } = await import("@/utils/clients-helpers");

      const clientResult = await addClient({

        name: lead.name,

        company: lead.company || undefined,

        email: lead.email || undefined,

        phone: lead.phone || undefined,

        notes: lead.notes || undefined,

        status: "Ativo",

      });

      if (!clientResult.success || !clientResult.data?.id) {

        throw new Error("Erro ao criar cliente");

      }

      const newClientId = clientResult.data.id;

      const patch = await apiClient.patch(`/api/leads/${lead.id}`, {

        status: "Convertido",

        migrated_client_id: newClientId,

      });

      if (patch.error) throw new Error(patch.error);

      toast.success("Lead convertido para cliente");

      setConvertOpen(false);

      closeDrawer();

      navigate(`/clients/${newClientId}`);

    } catch (e) {

      toast.error(e instanceof Error ? e.message : "Não foi possível converter o lead");

    } finally {

      setConverting(false);

    }

  };



  if (loading) return <QuickViewLoading />;



  if (error || !lead) {

    return (

      <QuickViewError

        message={error ?? "Lead não encontrado."}

        onRetry={() => void load()}

        onOpenFull={onOpenFullProfile}

        fullLabel="Abrir lead completo"

      />

    );

  }

  const convertedClientId = pickConvertedClientId(lead);
  if (convertedClientId) {
    return (
      <ClientQuickView
        clientId={convertedClientId}
        onRequestClose={onRequestClose}
        onOpenFullProfile={onOpenFullProfile}
      />
    );
  }

  const displayName = resolveEntityDisplayName({

    name: lead.name,

    phone: lead.phone,

  });

  const phoneDisplay = formatBrazilianPhone(lead.phone) || lead.phone || null;

  const activitySource = {

    entityKind: "lead" as const,

    created_at: lead.created_at,

    updated_at: lead.updated_at,

    last_message_at: lead.last_message_at,

    conversation_id: lead.conversation_id,

    whatsapp_avatar_url: lead.whatsapp_avatar_url,

    tickets: lead.tickets,

  };

  const hasConversation = hasLinkedConversation(activitySource);

  const isConverted =

    lead.status?.toLowerCase() === "convertido" || Boolean(lead.migrated_client_id);

  const canConvert =

    hasPermissionKey("leads.convert_to_client") && canView("clients") && !isConverted;



  const summaryRows: SummaryRow[] = [

    { label: "E-mail", value: lead.email },

    { label: "Empresa", value: lead.company },

    { label: "Origem", value: lead.source },

    { label: "Criado em", value: formatQuickViewDate(lead.created_at) },

  ];



  const quickActions: EntityQuickActionItem[] = canViewTickets

    ? [

        {

          label: "Tickets",

          icon: Ticket,

          onClick: openTickets,

          emphasized: metrics.hasOpenTicket,

        },

      ]

    : [];

  return (

    <>

      <EntityQuickViewShell>

        <EntityQuickViewHeader

          avatarUrl={profileAvatarUrl}

          displayName={displayName}

          entityKind="lead"

          status={lead.status}

          phoneLine={phoneDisplay}

        />



        <EntityQuickViewScrollBody>

          <EntityQuickViewPrimaryActions>

            <div className="grid grid-cols-2 gap-2">

              {canViewChat ? (

                <Button

                  type="button"

                  size="sm"

                  className={cn(

                    "h-10 gap-2 shadow-sm",

                    !hasConversation && "ring-2 ring-primary/30",

                  )}

                  disabled={chatBusy}

                  onClick={() => void openWhatsApp()}

                >

                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />

                  WhatsApp

                </Button>

              ) : null}

              <EntityQuickViewProfileButton

                label="Abrir lead completo"

                onClick={onOpenFullProfile}

                className={!canViewChat ? "col-span-2" : undefined}

              />

            </div>

            {canConvert ? (

              <Button

                type="button"

                variant="secondary"

                size="sm"

                className="h-9 w-full gap-1.5"

                onClick={() => setConvertOpen(true)}

              >

                <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />

                Converter para cliente

              </Button>

            ) : null}

          </EntityQuickViewPrimaryActions>



          <EntityQuickViewKpis

            entityKind="lead"

            entityId={lead.id}

            canViewFinance={false}

            canViewTickets={canViewTickets}

            canViewChat={canViewChat}

            seedTickets={lead.tickets}

          />



          <EntityQuickViewQuickActions items={quickActions} />



          <EntityQuickViewSummary rows={summaryRows} />

          <EntityRecentActivity {...activitySource} className="pb-4" />

        </EntityQuickViewScrollBody>

      </EntityQuickViewShell>



      <AlertDialog open={convertOpen} onOpenChange={setConvertOpen}>

        <AlertDialogContent>

          <AlertDialogHeader>

            <AlertDialogTitle>Converter para cliente?</AlertDialogTitle>

            <AlertDialogDescription>

              Será criado um cliente com os dados de {displayName} e o lead será marcado como convertido.

            </AlertDialogDescription>

          </AlertDialogHeader>

          <AlertDialogFooter>

            <AlertDialogCancel disabled={converting}>Cancelar</AlertDialogCancel>

            <AlertDialogAction disabled={converting} onClick={() => void handleConvert()}>

              {converting ? "Convertendo…" : "Converter"}

            </AlertDialogAction>

          </AlertDialogFooter>

        </AlertDialogContent>

      </AlertDialog>

    </>

  );

}


