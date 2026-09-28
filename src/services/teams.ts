import { apiClient } from '@/integrations/api/client';

export interface Team {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: 'lead' | 'member';
  created_at: string;
  updated_at: string;
  email?: string;
  name?: string;
}

export const teamsService = {
  async getTeams(): Promise<Team[]> {
    const response = await apiClient.get<Team[]>('/api/teams');
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  async getTeamById(id: string): Promise<Team> {
    const response = await apiClient.get<Team>(`/api/teams/${id}`);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Equipe não encontrada');
    return response.data;
  },

  async createTeam(data: { name: string; slug?: string; description?: string | null }): Promise<Team> {
    const response = await apiClient.post<Team>('/api/teams', data);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao criar equipe');
    return response.data;
  },

  async updateTeam(
    id: string,
    data: { name?: string; slug?: string; description?: string | null }
  ): Promise<Team> {
    const response = await apiClient.patch<Team>(`/api/teams/${id}`, data);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao atualizar equipe');
    return response.data;
  },

  async deleteTeam(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/teams/${id}`);
    if (response.error) throw new Error(response.error);
  },

  async getTeamMembers(teamId: string): Promise<TeamMember[]> {
    const response = await apiClient.get<TeamMember[]>(`/api/teams/${teamId}/members`);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  async addTeamMember(
    teamId: string,
    data: { user_id: string; role?: 'lead' | 'member' }
  ): Promise<TeamMember> {
    const response = await apiClient.post<TeamMember>(`/api/teams/${teamId}/members`, data);
    if (response.error) throw new Error(response.error);
    if (!response.data) throw new Error('Erro ao adicionar membro');
    return response.data;
  },

  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    const response = await apiClient.delete(`/api/teams/${teamId}/members/${memberId}`);
    if (response.error) throw new Error(response.error);
  },

  /** Equipes às quais o usuário pertence (mesmo tenant). */
  async getUserTeams(userId: string): Promise<(Team & { role?: string })[]> {
    const response = await apiClient.get<(Team & { role?: string })[]>(`/api/teams/by-user/${userId}`);
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },

  /** Define as equipes do usuário (substitui vínculos no tenant). */
  async setUserTeams(userId: string, teamIds: string[]): Promise<(Team & { role?: string })[]> {
    const response = await apiClient.put<(Team & { role?: string })[]>(`/api/teams/by-user/${userId}`, {
      team_ids: teamIds,
    });
    if (response.error) throw new Error(response.error);
    return response.data ?? [];
  },
};
