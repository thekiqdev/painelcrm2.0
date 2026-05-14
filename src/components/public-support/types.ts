import type { TicketPriority } from "@/types/tickets";

export type PublicPortalPayload = {
  enabled: boolean;
  slug: string;
  company_name: string;
  title: string | null;
  description: string | null;
  welcome_message: string | null;
  logo_url: string | null;
  primary_color: string | null;
  categories: { id: string; name: string }[];
  default_priority: TicketPriority;
};

export type TicketPostOk = {
  ok: boolean;
  ticket_number?: string | null;
  ticket_id_public?: string | null;
  message?: string;
};

export type PublicTicketLookupMessage = {
  content: string;
  created_at: string;
};

export type PublicTicketLookupTicket = {
  ticket_number: string;
  subject: string;
  status: string;
  priority: string;
  category_name: string | null;
  created_at: string;
  updated_at: string;
  messages: PublicTicketLookupMessage[];
};

export type PublicTicketLookupOk = {
  ok: true;
  ticket: PublicTicketLookupTicket;
};
