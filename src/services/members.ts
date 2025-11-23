import { apiClient } from '@/integrations/api/client';

export interface Member {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export const membersService = {
  async getMembers(): Promise<Member[]> {
    const response = await apiClient.get<Member[]>('/api/members');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  },
};

