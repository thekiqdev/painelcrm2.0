import { apiClient } from '@/integrations/api/client';
import { Contract, ContractTemplate, ContractSigner, ContractEvent } from '@/types/contracts';

export const contractsService = {
  // Get contracts with filters
  async getContracts(filters?: {
    status?: string;
    clientId?: string;
    responsibleId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortField?: string;
    sortDirection?: 'asc' | 'desc';
  }): Promise<Contract[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.append('status', filters.status);
      if (filters?.clientId) params.append('clientId', filters.clientId);
      if (filters?.responsibleId) params.append('responsibleId', filters.responsibleId);
      if (filters?.startDate) params.append('startDate', filters.startDate);
      if (filters?.endDate) params.append('endDate', filters.endDate);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.sortField) params.append('sortField', filters.sortField);
      if (filters?.sortDirection) params.append('sortDirection', filters.sortDirection);

      const url = `/api/contracts${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await apiClient.get<Contract[]>(url);
      
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contracts:', error);
      throw error;
    }
  },

  // Get contract by ID
  async getContractById(id: string): Promise<Contract> {
    try {
      const response = await apiClient.get<Contract>(`/api/contracts/${id}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching contract:', error);
      throw error;
    }
  },

  // Create contract
  async createContract(contractData: {
    title: string;
    client_id?: string;
    responsible_id?: string;
    status?: 'DRAFT' | 'PENDING_SIGNATURE' | 'PARTIALLY_SIGNED' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELLED';
    start_date?: string;
    end_date?: string;
    tags?: string[];
    content?: string;
    content_html?: string;
    template_id?: string;
    variables?: Record<string, any>;
    auto_renew?: boolean;
    renewal_period?: number;
    total_value?: number;
    currency?: string;
    linked_proposal_id?: string;
    linked_invoice_id?: string;
    signature_settings?: Record<string, any>;
  }): Promise<Contract> {
    try {
      const response = await apiClient.post<Contract>('/api/contracts', contractData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract:', error);
      throw error;
    }
  },

  // Update contract
  async updateContract(id: string, contractData: Partial<{
    title: string;
    client_id?: string;
    responsible_id?: string;
    status?: 'DRAFT' | 'PENDING_SIGNATURE' | 'PARTIALLY_SIGNED' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'CANCELLED';
    start_date?: string;
    end_date?: string;
    tags?: string[];
    content?: string;
    content_html?: string;
    template_id?: string;
    variables?: Record<string, any>;
    auto_renew?: boolean;
    renewal_period?: number;
    total_value?: number;
    currency?: string;
    linked_proposal_id?: string;
    linked_invoice_id?: string;
    signature_settings?: Record<string, any>;
  }>): Promise<Contract> {
    try {
      const response = await apiClient.patch<Contract>(`/api/contracts/${id}`, contractData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract:', error);
      throw error;
    }
  },

  // Delete contract
  async deleteContract(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contracts/${id}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract:', error);
      throw error;
    }
  },

  // Get contract signers
  async getContractSigners(contractId: string): Promise<ContractSigner[]> {
    try {
      const response = await apiClient.get<ContractSigner[]>(`/api/contracts/${contractId}/signers`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract signers:', error);
      throw error;
    }
  },

  // Create contract signer
  async createContractSigner(contractId: string, signerData: {
    name: string;
    email: string;
    role: 'CLIENT' | 'INTERNAL';
    signing_order?: number;
  }): Promise<ContractSigner> {
    try {
      const response = await apiClient.post<ContractSigner>(`/api/contracts/${contractId}/signers`, signerData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract signer:', error);
      throw error;
    }
  },

  // Update contract signer
  async updateContractSigner(signerId: string, signerData: Partial<{
    name: string;
    email: string;
    role: 'CLIENT' | 'INTERNAL';
    signing_order?: number;
  }>): Promise<ContractSigner> {
    try {
      const response = await apiClient.patch<ContractSigner>(`/api/contracts/signers/${signerId}`, signerData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract signer:', error);
      throw error;
    }
  },

  // Delete contract signer
  async deleteContractSigner(signerId: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contracts/signers/${signerId}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract signer:', error);
      throw error;
    }
  },

  // Get contract events
  async getContractEvents(contractId: string): Promise<ContractEvent[]> {
    try {
      const response = await apiClient.get<ContractEvent[]>(`/api/contracts/${contractId}/events`);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract events:', error);
      throw error;
    }
  },

  // Create contract event
  async createContractEvent(contractId: string, eventData: {
    event_type: string;
    description: string;
    metadata?: Record<string, any>;
  }): Promise<ContractEvent> {
    try {
      const response = await apiClient.post<ContractEvent>(`/api/contracts/${contractId}/events`, eventData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract event:', error);
      throw error;
    }
  },

  // Get contract templates
  async getContractTemplates(activeOnly?: boolean): Promise<ContractTemplate[]> {
    try {
      const url = activeOnly ? '/api/contract-templates?activeOnly=true' : '/api/contract-templates';
      const response = await apiClient.get<ContractTemplate[]>(url);
      if (response.error) throw new Error(response.error);
      return response.data || [];
    } catch (error: any) {
      console.error('Error fetching contract templates:', error);
      throw error;
    }
  },

  // Create contract template
  async createContractTemplate(templateData: {
    name: string;
    description?: string;
    content_html: string;
    variables_schema?: Array<{
      key: string;
      label: string;
      type: 'text' | 'date' | 'number' | 'currency';
      required?: boolean;
    }>;
    is_active?: boolean;
  }): Promise<ContractTemplate> {
    try {
      const response = await apiClient.post<ContractTemplate>('/api/contract-templates', templateData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error creating contract template:', error);
      throw error;
    }
  },

  // Update contract template
  async updateContractTemplate(id: string, templateData: Partial<{
    name: string;
    description?: string;
    content_html: string;
    variables_schema?: Array<{
      key: string;
      label: string;
      type: 'text' | 'date' | 'number' | 'currency';
      required?: boolean;
    }>;
    is_active?: boolean;
  }>): Promise<ContractTemplate> {
    try {
      const response = await apiClient.patch<ContractTemplate>(`/api/contract-templates/${id}`, templateData);
      if (response.error) throw new Error(response.error);
      return response.data;
    } catch (error: any) {
      console.error('Error updating contract template:', error);
      throw error;
    }
  },

  // Delete contract template
  async deleteContractTemplate(id: string): Promise<void> {
    try {
      const response = await apiClient.delete(`/api/contract-templates/${id}`);
      if (response.error) throw new Error(response.error);
    } catch (error: any) {
      console.error('Error deleting contract template:', error);
      throw error;
    }
  },
};

