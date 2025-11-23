import { apiClient } from '@/integrations/api/client';
import { Ticket, TicketCategory } from '@/types/tickets';

export const ticketsService = {
  // Get tickets with filters
  async getTickets(filters?: {
    status?: string;
    priority?: string;
    category_id?: string;
    search?: string;
  }): Promise<Ticket[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.priority) params.append('priority', filters.priority);
      if (filters?.category_id) params.append('category_id', filters.category_id);
      if (filters?.search) params.append('search', filters.search);

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
    status?: 'new' | 'open' | 'waiting_customer' | 'resolved' | 'closed';
    channel?: 'portal' | 'email' | 'whatsapp' | 'internal';
    client_id?: string;
    team_id?: string;
    assignee_id?: string;
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
  async createTicketMessage(ticketId: string, messageData: {
    content: string;
    visibility?: 'public' | 'internal' | 'private';
    attachments?: any[];
    mentions?: string[];
  }): Promise<any> {
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
  async getTicketCategories(): Promise<TicketCategory[]> {
    try {
      const response = await apiClient.get<TicketCategory[]>('/api/ticket-categories');
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching ticket categories:', error);
      throw error;
    }
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
    } catch (error: any) {
      console.error('Error deleting ticket category:', error);
      throw error;
    }
  },
};

