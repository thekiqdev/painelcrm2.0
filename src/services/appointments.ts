import { apiClient } from '@/integrations/api/client';

export type AppointmentAttendee = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  attendee_type: string;
  created_at: string;
};

export type Appointment = {
  id: string;
  tenant_id: string;
  client_id: string | null;
  lead_id: string | null;
  responsible_user_id: string | null;
  title: string;
  description: string | null;
  type: string;
  status: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  create_google_event: boolean;
  google_calendar_connection_id: string | null;
  google_event_id: string | null;
  google_meet_link: string | null;
  google_html_link: string | null;
  sync_status: string;
  sync_error: string | null;
  reminders_json: unknown | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  client_name?: string | null;
  lead_name?: string | null;
  responsible_name?: string | null;
  created_by_name?: string | null;
  attendees?: AppointmentAttendee[];
};

export type ListAppointmentsParams = {
  date_from?: string;
  date_to?: string;
  responsible_user_id?: string;
  client_id?: string;
  lead_id?: string;
  status?: string;
  type?: string;
  limit?: number;
  offset?: number;
};

export async function listAppointments(params: ListAppointmentsParams = {}): Promise<{
  items: Appointment[];
  total: number;
  limit: number;
  offset: number;
}> {
  const sp = new URLSearchParams();
  if (params.date_from) sp.set('date_from', params.date_from);
  if (params.date_to) sp.set('date_to', params.date_to);
  if (params.responsible_user_id) sp.set('responsible_user_id', params.responsible_user_id);
  if (params.client_id) sp.set('client_id', params.client_id);
  if (params.lead_id) sp.set('lead_id', params.lead_id);
  if (params.status) sp.set('status', params.status);
  if (params.type) sp.set('type', params.type);
  if (params.limit != null) sp.set('limit', String(params.limit));
  if (params.offset != null) sp.set('offset', String(params.offset));
  const q = sp.toString();
  const res = await apiClient.get<{
    items: Appointment[];
    total: number;
    limit: number;
    offset: number;
  }>(`/api/appointments${q ? `?${q}` : ''}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? { items: [], total: 0, limit: 50, offset: 0 };
}

export async function getAppointment(id: string): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.get<Appointment & { attendees: AppointmentAttendee[] }>(`/api/appointments/${id}`);
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Não encontrado');
  return res.data;
}

export type CreateAppointmentInput = {
  title: string;
  description?: string | null;
  type?: string;
  client_id?: string | null;
  lead_id?: string | null;
  responsible_user_id?: string | null;
  starts_at: string;
  ends_at: string;
  location?: string | null;
  create_google_event?: boolean;
  create_meet?: boolean;
  attendees?: { name?: string | null; email?: string | null; phone?: string | null; attendee_type?: string }[];
  reminders?: { method: 'email' | 'popup'; minutes: number }[] | null;
};

export async function createAppointment(body: CreateAppointmentInput): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.post<Appointment & { attendees: AppointmentAttendee[] }>('/api/appointments', body);
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao criar');
  return res.data;
}

export async function updateAppointment(
  id: string,
  body: Partial<CreateAppointmentInput>,
): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.patch<Appointment & { attendees: AppointmentAttendee[] }>(`/api/appointments/${id}`, body);
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao atualizar');
  return res.data;
}

export async function cancelAppointment(
  id: string,
): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.post<Appointment & { attendees: AppointmentAttendee[] }>(`/api/appointments/${id}/cancel`, {});
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao cancelar');
  return res.data;
}

type RetrySyncResponse =
  | (Appointment & { attendees: AppointmentAttendee[] })
  | { message?: string; item: Appointment & { attendees: AppointmentAttendee[] } };

export async function retryAppointmentSync(
  id: string,
  create_meet?: boolean,
): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.post<RetrySyncResponse>(`/api/appointments/${id}/retry-sync`, {
    create_meet: create_meet === true,
  });
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao sincronizar');
  if ('item' in res.data && res.data.item) return res.data.item;
  if ('id' in res.data) return res.data as Appointment & { attendees: AppointmentAttendee[] };
  throw new Error('Falha ao sincronizar');
}
