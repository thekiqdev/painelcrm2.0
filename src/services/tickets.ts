import { apiClient } from '@/integrations/api/client';
import { Ticket, TicketActivity, TicketCategory, TicketStatus } from '@/types/tickets';
import { getActiveChatCacheSession } from '@/lib/queryClient';
import {
  ticketCategoriesCache,
  ticketMenuCountCache,
} from '@/services/shellPollHttpCaches';

function shellSessionKey(suffix: string): string {
  const scope = getActiveChatCacheSession();
  return scope ? `${scope.tenantId}:${scope.userId}:${suffix}` : `__session__:${suffix}`;
}

export const ticketsService = {
  // Get tickets with filters
  async getTickets(filters?: {
    status?: string;
    priority?: string;
    category_id?: string;
    search?: string;
    client_id?: string;
    /** `me` = tickets do usuário autenticado */
    assignee_id?: string;
    unassigned?: boolean;
    no_response?: boolean;
    my_queue?: boolean;
    sla_overdue?: boolean;
  }): Promise<Ticket[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.category_id) params.append('category_id', filters.category_id);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.client_id) params.append('client_id', filters.client_id);
      if (filters?.assignee_id) params.append('assignee_id', filters.assignee_id);
      if (filters?.unassigned) params.append('unassigned', 'true');
      if (filters?.no_response) params.append('no_response', 'true');
      if (filters?.my_queue) params.append('my_queue', 'true');
      if (filters?.sla_overdue) params.append('sla_overdue', 'true');

      const url = `/api/tickets${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<Ticket[]>(url);
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching tickets:', error);
      throw error;
    }
  },

  // Get ticket by ID
  async getTicketById(id: string): Promise<Ticket> {
    try {
      const response = await apiClient.get<Ticket>(`/api/tickets/${id}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching ticket:', error);
      throw error;
    }
  },

  // Create ticket
  async createTicket(ticketData: {
    contact_name: string;
    contact_email: string;
    contact_phone?: string;
    subject: string;
    description: string;
    category_id?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    status?: 'new' | 'open' | 'waiting_customer' | 'resolved' | 'closed';
    channel?: 'portal' | 'email' | 'whatsapp' | 'internal';
    client_id?: string;
    lead_id?: string;
    team_id?: string;
    assignee_id?: string;
    tags?: string[];
    custom_fields?: any;
  }): Promise<Ticket> {
    try {
      const response = await apiClient.post<Ticket>('/api/tickets', ticketData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating ticket:', error);
      throw error;
    }
  },

  // Update ticket
  async updateTicket(id: string, ticketData: Partial<{
    contact_name: string;
    contact_email: string;
    contact_phone?: string;
    subject: string;
    description: string;
    category_id?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    status?: TicketStatus;
    channel?: 'portal' | 'email' | 'whatsapp' | 'internal';
    client_id?: string;
    lead_id?: string | null;
    team_id?: string;
    assignee_id?: string | null;
    tags?: string[];
    custom_fields?: any;
  }>): Promise<Ticket> {
    try {
      const response = await apiClient.patch<Ticket>(`/api/tickets/${id}`, ticketData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating ticket:', error);
      throw error;
    }
  },

  // Delete ticket
  async deleteTicket(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/tickets/${id}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting ticket:', error);
      throw error;
    }
  },

  async getKanbanStats(): Promise<{
    open_count: number;
    no_response_count: number;
    urgent_count: number;
    sla_overdue_count: number;
  }> {
    const response = await apiClient.get<{
      open_count: number;
      no_response_count: number;
      urgent_count: number;
      sla_overdue_count: number;
    }>('/api/tickets/kanban-stats');
    if (response.error) throw new Error(response.error);
    return (
      response.data ?? {
        open_count: 0,
        no_response_count: 0,
        urgent_count: 0,
        sla_overdue_count: 0,
      }
    );
  },

  async getMenuCount(options?: { force?: boolean }): Promise<number> {
    return ticketMenuCountCache.get(
      shellSessionKey('tickets-menu-count'),
      async () => {
        const response = await apiClient.get<{ count: number }>('/api/tickets/menu-count');
        if (response.error) return 0;
        return Number(response.data?.count ?? 0);
      },
      options,
    );
  },

  async bulkUpdateTickets(payload: {
    ids: string[];
    action: 'resolve' | 'assign' | 'add_tag';
    assignee_id?: string | null;
    tag?: string;
  }): Promise<{ updated_count: number; ids: string[] }> {
    const response = await apiClient.post<{ updated_count: number; ids: string[] }>(
      '/api/tickets/bulk',
      payload
    );
    if (response.error) throw new Error(response.error);
    return response.data ?? { updated_count: 0, ids: payload.ids };
  },

  async getTicketActivities(ticketId: string): Promise<TicketActivity[]> {
    try {
      const response = await apiClient.get<TicketActivity[]>(`/api/tickets/${ticketId}/activities`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: unknown) {
      console.error('Error fetching ticket activities:', error);
      throw error;
    }
  },

  // Get ticket messages
  async getTicketMessages(ticketId: string): Promise<any[]> {
    try {
      const response = await apiClient.get<any[]>(`/api/tickets/${ticketId}/messages`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching ticket messages:', error);
      throw error;
    }
  },

  // Create ticket message
  async createTicketMessage(
    ticketId: string,
    messageData: {
      content: string;
      visibility?: 'public' | 'internal';
      attachments?: any[];
      mentions?: string[];
    }
  ): Promise<any> {
    try {
      const response = await apiClient.post<any>(`/api/tickets/${ticketId}/messages`, messageData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating ticket message:', error);
      throw error;
    }
  },

  // Get ticket categories
  async getTicketCategories(options?: { force?: boolean }): Promise<TicketCategory[]> {
    return ticketCategoriesCache.get(
      shellSessionKey('ticket-categories'),
      async () => {
        try {
          const response = await apiClient.get<TicketCategory[]>('/api/ticket-categories');
          if (response.error) throw new Error(response.error);
          return response.data || [];
        } catch (error: unknown) {
          console.error('Error fetching ticket categories:', error);
          throw error;
        }
      },
      options,
    ) as Promise<TicketCategory[]>;
  },

  // Create ticket category
  async createTicketCategory(categoryData: {
    name: string;
    description?: string;
    color?: string;
    default_team_id?: string;
    custom_form?: any;
  }): Promise<TicketCategory> {
    try {
      const response = await apiClient.post<TicketCategory>('/api/ticket-categories', categoryData);
      if (response.error) throw new Error(response.error);
      ticketCategoriesCache.invalidate(shellSessionKey('ticket-categories'));
      return response.data;
    } catch (error: any) {
      console.error('Error creating ticket category:', error);
      throw error;
    }
  },

  // Update ticket category
  async updateTicketCategory(id: string, categoryData: Partial<{
    name: string;
    description?: string;
    color?: string;
    default_team_id?: string;
    custom_form?: any;
  }>): Promise<TicketCategory> {
    try {
      const response = await apiClient.patch<TicketCategory>(`/api/ticket-categories/${id}`, categoryData);
      if (response.error) throw new Error(response.error);
      ticketCategoriesCache.invalidate(shellSessionKey('ticket-categories'));
      return response.data;
    } catch (error: any) {
      console.error('Error updating ticket category:', error);
      throw error;
    }
  },

  // Delete ticket category
  async deleteTicketCategory(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/ticket-categories/${id}`);
      if (response.error) throw new Error(response.error);
      ticketCategoriesCache.invalidate(shellSessionKey('ticket-categories'));
    } catch (error: any) {
      console.error('Error deleting ticket category:', error);
      throw error;
    }
  },
};

