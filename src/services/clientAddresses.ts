import { apiClient } from "@/integrations/api/client";
import type { ClientAddress, ClientAddressInput } from "@/types/clientAddresses";

export const clientAddressesService = {
  async list(clientId: string): Promise<ClientAddress[]> {
    const response = await apiClient.get<{ data: ClientAddress[] }>(
      `/api/clients/${clientId}/addresses`,
    );
    if (response.error) throw new Error(response.error);
    return response.data?.data ?? [];
  },

  async create(clientId: string, body: ClientAddressInput): Promise<ClientAddress> {
    const response = await apiClient.post<ClientAddress>(
      `/api/clients/${clientId}/addresses`,
      body,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error("Resposta vazia ao criar endereço");
    return response.data;
  },

  async update(
    clientId: string,
    addressId: string,
    body: ClientAddressInput,
  ): Promise<ClientAddress> {
    const response = await apiClient.patch<ClientAddress>(
      `/api/clients/${clientId}/addresses/${addressId}`,
      body,
    );
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error("Resposta vazia ao atualizar endereço");
    return response.data;
  },

  async remove(clientId: string, addressId: string): Promise<void> {
    const response = await apiClient.delete(`/api/clients/${clientId}/addresses/${addressId}`);
    if (response.error) throw new Error(response.error);
  },
};
