import { apiClient } from '@/integrations/api/client';

export interface UserProfile {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileMember {
  id: string;
  profile_id: string;
  user_id: string;
  email?: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface UserPermission {
  id: string;
  user_id: string;
  profile_id: string;
  permission: string;
  created_at: string;
}

export interface LeadStatus {
  id: string;
  name: string;
  color: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export class SettingsService {
  // User Profiles
  async getUserProfiles(): Promise<UserProfile[]> {
    const response = await apiClient.get<UserProfile[]>('/api/user-profiles');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async getUserProfileById(id: string): Promise<UserProfile> {
    const response = await apiClient.get<UserProfile>(`/api/user-profiles/${id}`);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async createUserProfile(data: {
    name: string;
    description?: string | null;
    is_admin?: boolean;
  }): Promise<UserProfile> {
    const response = await apiClient.post<UserProfile>('/api/user-profiles', data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateUserProfile(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      is_admin?: boolean;
    }
  ): Promise<UserProfile> {
    const response = await apiClient.patch<UserProfile>(`/api/user-profiles/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteUserProfile(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/user-profiles/${id}`);
    if (response.error) throw new Error(response.error);
  }

  // Profile Members
  async getProfileMembers(profileId: string): Promise<ProfileMember[]> {
    const response = await apiClient.get<ProfileMember[]>(`/api/user-profiles/${profileId}/members`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createProfileMember(
    profileId: string,
    data: {
      user_id: string;
    }
  ): Promise<ProfileMember> {
    const response = await apiClient.post<ProfileMember>(`/api/user-profiles/${profileId}/members`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteProfileMember(memberId: string): Promise<void> {
    const response = await apiClient.delete(`/api/user-profiles/members/${memberId}`);
    if (response.error) throw new Error(response.error);
  }

  // User Permissions
  async getMemberPermissions(memberId: string): Promise<UserPermission[]> {
    const response = await apiClient.get<UserPermission[]>(`/api/user-profiles/members/${memberId}/permissions`);
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createMemberPermission(
    memberId: string,
    data: {
      permission: string;
    }
  ): Promise<UserPermission> {
    const response = await apiClient.post<UserPermission>(`/api/user-profiles/members/${memberId}/permissions`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteMemberPermission(memberId: string, permissionId: string): Promise<void> {
    const response = await apiClient.delete(`/api/user-profiles/members/${memberId}/permissions/${permissionId}`);
    if (response.error) throw new Error(response.error);
  }

  // Lead Statuses
  async getLeadStatuses(): Promise<LeadStatus[]> {
    const response = await apiClient.get<LeadStatus[]>('/api/lead-statuses');
    if (response.error) throw new Error(response.error);
    return response.data || [];
  }

  async createLeadStatus(data: {
    name: string;
    color: string;
  }): Promise<LeadStatus> {
    const response = await apiClient.post<LeadStatus>('/api/lead-statuses', data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async updateLeadStatus(
    id: string,
    data: {
      name?: string;
      color?: string;
    }
  ): Promise<LeadStatus> {
    const response = await apiClient.put<LeadStatus>(`/api/lead-statuses/${id}`, data);
    if (response.error) throw new Error(response.error);
    return response.data!;
  }

  async deleteLeadStatus(id: string): Promise<void> {
    const response = await apiClient.delete(`/api/lead-statuses/${id}`);
    if (response.error) throw new Error(response.error);
  }
}

export const settingsService = new SettingsService();

