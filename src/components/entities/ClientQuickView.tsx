import { useCallback, useEffect, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useNavigate } from "react-router-dom";

import {

  DollarSign,

  FileSignature,

  FolderKanban,

  MessageCircle,

  Ticket,

} from "lucide-react";

import { Button } from "@/components/ui/button";

import { type Client } from "@/services/clients";

import { useModulePermissions } from "@/contexts/ModulePermissionsContext";
import { useEntityWhatsappAvatar } from "@/hooks/useEntityWhatsappAvatar";

import { useFloatingChatOptional } from "@/features/floating-chat/floatingChatContext";

import { formatBrazilianPhone, resolveEntityDisplayName } from "@/lib/formatters/phone";

import { entityDrawerStore } from "@/stores/entityDrawerStore";

import { apiClient } from "@/integrations/api/client";

import { cn } from "@/lib/utils";

import { QuickViewError, QuickViewLoading } from "./entityQuickViewShared";

import { EntityRecentActivity } from "./EntityRecentActivitySection";

import { hasLinkedConversation } from "./entityRecentActivityUtils";

import { EntityQuickViewKpis } from "./EntityQuickViewKpis";

import { useEntityQuickViewMetrics } from "./useEntityQuickViewMetrics";

import { openEntityWhatsAppFloatingChat } from "./entityQuickViewChat";

import {

  newContractForClientUrl,

  newInvoiceForClientUrl,

  newProjectForClientUrl,

  newTicketForClientUrl,

} from "./entityQuickViewRoutes";

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



/** Campos opcionais se a API passar a incluir no payload (sem fetch extra). */

type ClientQuickViewExtras = {

  last_message_at?: string | null;

  conversation_id?: string | null;

  tickets?: Array<{ id?: string; ticket_number?: string; created_at?: string; status?: string }>;

  invoices?: Array<{ id?: string; created_at?: string }>;

};



type ClientRecord = Client & ClientQuickViewExtras;



type Props = {

  clientId: string;

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

  if (status === 404) return "Cliente não encontrado.";

  return null;

}



export function ClientQuickView({ clientId, onRequestClose, onOpenFullProfile }: Props) {

  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const floatingChat = useFloatingChatOptional();

  const { canView } = useModulePermissions();

  const [client, setClient] = useState<ClientRecord | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  const [chatBusy, setChatBusy] = useState(false);



  const canViewChat = canView("chat");

  const canViewFinance = canView("customer_invoices") || canView("finance");

  const canViewTickets = canView("tickets");

  const canViewContracts = canView("contracts");

  const canViewProjects = canView("projects");



  const load = useCallback(async () => {

    setLoading(true);

    setError(null);

    try {

      const res = await apiClient.get<ClientRecord>(`/api/clients/${clientId}`);

      if (res.error) {

        setClient(null);

        setError(permissionMessageFromError(res.details) ?? res.error);

        return;

      }

      setClient(res.data ?? null);

      if (!res.data) setError("Cliente não encontrado.");

    } catch {

      setError("Não foi possível carregar o cliente.");

    } finally {

      setLoading(false);

    }

  }, [clientId]);



  useEffect(() => {

    void load();

  }, [load]);



  const metrics = useEntityQuickViewMetrics({

    entityKind: "client",

    entityId: clientId,

    canViewFinance,

    canViewTickets,

    canViewChat,

  });

  const profileAvatarUrl = useEntityWhatsappAvatar({
    entityKind: "client",
    entityId: client?.id ?? clientId,
    entity: client,
    enabled: Boolean(client),
  });

  const closeDrawer = () => entityDrawerStore.close();



  const openWhatsApp = async () => {

    if (!client || chatBusy) return;

    setChatBusy(true);

    try {

      await openEntityWhatsAppFloatingChat({

        entityKind: "client",

        entityId: client.id,

        phone: client.phone || client.whatsapp,

        floatingChat,

        queryClient,

        onBeforeOpen: onRequestClose,

      });

    } finally {

      setChatBusy(false);

    }

  };



  const openFinance = () => {

    if (!client) return;

    closeDrawer();

    navigate(newInvoiceForClientUrl(client.id));

  };



  const openTickets = () => {

    if (!client) return;

    closeDrawer();

    navigate(newTicketForClientUrl(client.id));

  };



  const openContracts = () => {

    if (!client) return;

    closeDrawer();

    navigate(newContractForClientUrl(client.id));

  };



  const openProjects = () => {

    if (!client) return;

    closeDrawer();

    navigate(newProjectForClientUrl(client.id));

  };



  if (loading) return <QuickViewLoading />;



  if (error || !client) {

    return (

      <QuickViewError

        message={error ?? "Cliente não encontrado."}

        onRetry={() => void load()}

        onOpenFull={onOpenFullProfile}

        fullLabel="Abrir perfil completo"

      />

    );

  }



  const displayName = resolveEntityDisplayName({

    name: client.name,

    phone: client.phone,

    whatsapp: client.whatsapp,

  });

  const phoneDisplay =

    formatBrazilianPhone(client.phone || client.whatsapp) ||

    client.phone ||

    client.whatsapp ||

    null;

  const activitySource = {

    entityKind: "client" as const,

    created_at: client.created_at,

    updated_at: client.updated_at,

    last_message_at: client.last_message_at,

    conversation_id: client.conversation_id,

    whatsapp_avatar_url: client.whatsapp_avatar_url,

    tickets: client.tickets,

    invoices: client.invoices,

  };

  const hasConversation = hasLinkedConversation(activitySource);



  const summaryRows: SummaryRow[] = [

    { label: "E-mail", value: client.email },

    { label: "Empresa", value: client.company },

    { label: "Origem", value: client.source },

    { label: "Criado em", value: formatQuickViewDate(client.created_at) },

  ];



  const quickActions: EntityQuickActionItem[] = [

    canViewFinance

      ? {

          label: "Financeiro",

          icon: DollarSign,

          onClick: openFinance,

          emphasized: !metrics.hasInvoices,

        }

      : null,

    canViewTickets

      ? {

          label: "Tickets",

          icon: Ticket,

          onClick: openTickets,

          emphasized: metrics.hasOpenTicket,

        }

      : null,

    canViewContracts ? { label: "Contratos", icon: FileSignature, onClick: openContracts } : null,

    canViewProjects ? { label: "Projetos", icon: FolderKanban, onClick: openProjects } : null,

  ].filter((x): x is EntityQuickActionItem => x != null);



  return (

    <EntityQuickViewShell>

      <EntityQuickViewHeader

        avatarUrl={profileAvatarUrl}

        displayName={displayName}

        entityKind="client"

        status={client.status}

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

              label="Abrir perfil completo"

              onClick={onOpenFullProfile}

              className={!canViewChat ? "col-span-2" : undefined}

            />

          </div>

        </EntityQuickViewPrimaryActions>



        <EntityQuickViewKpis

          entityKind="client"

          entityId={client.id}

          canViewFinance={canViewFinance}

          canViewTickets={canViewTickets}

          canViewChat={canViewChat}

        />



        <EntityQuickViewQuickActions items={quickActions} />



        <EntityQuickViewSummary rows={summaryRows} />

        <EntityRecentActivity {...activitySource} className="pb-4" />

      </EntityQuickViewScrollBody>

    </EntityQuickViewShell>

  );

}


