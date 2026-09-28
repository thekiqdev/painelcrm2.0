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
  send_reminder_to_client?: boolean;
  recurrence_series_id?: string | null;
  recurrence_occurrence_index?: number | null;
  recurrence_original_starts_at?: string | null;
  attendance_status?: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show';
  attendance_confirmed_at?: string | null;
  attendance_updated_at?: string | null;
  attendance_note?: string | null;
  public_confirmation_token?: string | null;
  public_confirmation_token_expires_at?: string | null;
  public_confirmation_responded_at?: string | null;
  public_confirmation_response?: 'confirmed' | 'needs_reschedule' | 'declined' | null;
  needs_reschedule_task_created_at?: string | null;
  needs_reschedule_task_href?: string | null;
  declined_task_created_at?: string | null;
  declined_task_href?: string | null;
  completed_at?: string | null;
  completion_notes?: string | null;
  outcome?: AppointmentOutcome | null;
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

export type AppointmentRecurrenceInput = {
  frequency: 'none' | 'weekly' | 'monthly' | 'weekdays';
  interval?: number;
  weekdays?: number[];
  until?: string;
  max_occurrences?: number;
  send_invite_for_all_occurrences?: boolean;
};

export type AppointmentOutcome =
  | 'success'
  | 'no_show'
  | 'rescheduled'
  | 'needs_follow_up'
  | 'lost'
  | 'other';

export type ListAppointmentsParams = {
  date_from?: string;
  date_to?: string;
  responsible_user_id?: string;
  client_id?: string;
  lead_id?: string;
  status?: string;
  type?: string;
  confirmation_status?:
    | 'pending'
    | 'confirmed'
    | 'not_confirmed'
    | 'needs_reschedule'
    | 'declined'
    | 'no_show';
  limit?: number;
  offset?: number;
};

export type AppointmentReportsSummaryParams = {
  date_from?: string;
  date_to?: string;
  responsible_user_id?: string;
  type?: string;
};

export type AppointmentReportsSummaryResponse = {
  summary: {
    total: number;
    scheduled: number;
    done: number;
    cancelled: number;
    no_show: number;
    confirmed: number;
    not_confirmed: number;
    pending_confirmation: number;
    needs_reschedule: number;
    declined: number;
    follow_ups_created: number;
    completion_rate: number;
  };
  by_responsible: Array<{
    user_id: string | null;
    name: string;
    total: number;
    done: number;
    cancelled: number;
    no_show: number;
    completion_rate: number;
  }>;
  by_type: Array<{
    type: string;
    label: string;
    total: number;
    done: number;
  }>;
  by_outcome: Array<{
    outcome: string;
    label: string;
    total: number;
  }>;
};

export type AppointmentConflictsResponse = {
  has_conflict: boolean;
  conflicts: Array<{
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
  }>;
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
  if (params.confirmation_status) sp.set('confirmation_status', params.confirmation_status);
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

export async function getAppointmentsReportsSummary(
  params: AppointmentReportsSummaryParams = {},
): Promise<AppointmentReportsSummaryResponse> {
  const sp = new URLSearchParams();
  if (params.date_from) sp.set('date_from', params.date_from);
  if (params.date_to) sp.set('date_to', params.date_to);
  if (params.responsible_user_id) sp.set('responsible_user_id', params.responsible_user_id);
  if (params.type) sp.set('type', params.type);
  const q = sp.toString();
  const res = await apiClient.get<AppointmentReportsSummaryResponse>(
    `/api/appointments/reports/summary${q ? `?${q}` : ''}`,
  );
  if (res.error) throw new Error(res.error);
  return (
    res.data ?? {
      summary: {
        total: 0,
        scheduled: 0,
        done: 0,
        cancelled: 0,
        no_show: 0,
        confirmed: 0,
        not_confirmed: 0,
        pending_confirmation: 0,
        needs_reschedule: 0,
        declined: 0,
        follow_ups_created: 0,
        completion_rate: 0,
      },
      by_responsible: [],
      by_type: [],
      by_outcome: [],
    }
  );
}

export async function getAppointmentConflicts(params: {
  starts_at: string;
  ends_at: string;
  responsible_user_id: string;
  exclude_appointment_id?: string;
}): Promise<AppointmentConflictsResponse> {
  const sp = new URLSearchParams();
  sp.set('starts_at', params.starts_at);
  sp.set('ends_at', params.ends_at);
  sp.set('responsible_user_id', params.responsible_user_id);
  if (params.exclude_appointment_id) sp.set('exclude_appointment_id', params.exclude_appointment_id);
  const q = sp.toString();
  const res = await apiClient.get<AppointmentConflictsResponse>(`/api/appointments/conflicts?${q}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? { has_conflict: false, conflicts: [] };
}

/**
 * Próximos (agendados, futuros) e histórico (concluídos/cancelados) para o perfil do cliente.
 * GET /api/appointments/client/:clientId
 */
export async function getClientAppointmentsForProfile(
  clientId: string,
): Promise<{ upcoming: Appointment[]; history: Appointment[] }> {
  const res = await apiClient.get<{
    upcoming: Appointment[];
    history: Appointment[];
  }>(`/api/appointments/client/${encodeURIComponent(clientId)}`);
  if (res.error) throw new Error(res.error);
  return res.data ?? { upcoming: [], history: [] };
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
  send_reminder_to_client?: boolean;
  recurrence?: AppointmentRecurrenceInput | null;
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

export async function cancelRecurrenceSeries(seriesId: string): Promise<{
  cancelled_count: number;
  google_failed_count: number;
  series_id: string;
}> {
  const res = await apiClient.post<{
    cancelled_count: number;
    google_failed_count: number;
    series_id: string;
  }>(`/api/appointments/recurrence-series/${encodeURIComponent(seriesId)}/cancel`, {});
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao cancelar série');
  return res.data;
}

export async function cancelAppointmentThisAndFollowing(id: string): Promise<{
  cancelled_count: number;
  google_failed_count: number;
  series_id: string;
}> {
  const res = await apiClient.post<{
    cancelled_count: number;
    google_failed_count: number;
    series_id: string;
  }>(`/api/appointments/${encodeURIComponent(id)}/cancel-this-and-following`, {});
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao cancelar recorrência');
  return res.data;
}

export type RecurrenceSeriesPatchBody = Partial<{
  title: string;
  description: string | null;
  type: string;
  responsible_user_id: string | null;
  location: string | null;
  reminders: { method: 'email' | 'popup'; minutes: number }[] | null;
  send_reminder_to_client: boolean;
}>;

export async function patchRecurrenceSeries(
  seriesId: string,
  body: RecurrenceSeriesPatchBody,
): Promise<{ updated_count: number; google_failed_count: number }> {
  const res = await apiClient.patch<{ updated_count: number; google_failed_count: number }>(
    `/api/appointments/recurrence-series/${encodeURIComponent(seriesId)}`,
    body,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao editar série');
  return res.data;
}

export async function patchAppointmentThisAndFollowing(
  id: string,
  body: RecurrenceSeriesPatchBody,
): Promise<{ updated_count: number; google_failed_count: number }> {
  const res = await apiClient.patch<{ updated_count: number; google_failed_count: number }>(
    `/api/appointments/${encodeURIComponent(id)}/this-and-following`,
    body,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao editar recorrência');
  return res.data;
}

export type CompleteAppointmentInput = {
  completion_notes?: string | null;
  outcome: AppointmentOutcome;
  create_follow_up?: boolean;
  follow_up_starts_at?: string | null;
  follow_up_ends_at?: string | null;
  send_client_message?: boolean;
};

export async function completeAppointment(
  id: string,
  body: CompleteAppointmentInput,
): Promise<(Appointment & { attendees: AppointmentAttendee[] }) & { follow_up?: (Appointment & { attendees: AppointmentAttendee[] }) | null }> {
  const res = await apiClient.post<
    (Appointment & { attendees: AppointmentAttendee[] }) & { follow_up?: (Appointment & { attendees: AppointmentAttendee[] }) | null }
  >(`/api/appointments/${id}/complete`, body);
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao concluir');
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

export async function rescheduleAppointment(
  id: string,
  body: { starts_at: string; ends_at: string; reason?: string | null },
): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.post<Appointment & { attendees: AppointmentAttendee[] }>(
    `/api/appointments/${encodeURIComponent(id)}/reschedule`,
    body,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao reagendar');
  return res.data;
}

export async function setAppointmentAttendance(
  id: string,
  body: {
    attendance_status: 'pending' | 'confirmed' | 'not_confirmed' | 'no_show';
    attendance_note?: string | null;
  },
): Promise<Appointment & { attendees: AppointmentAttendee[] }> {
  const res = await apiClient.post<Appointment & { attendees: AppointmentAttendee[] }>(
    `/api/appointments/${encodeURIComponent(id)}/attendance`,
    body,
  );
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao atualizar confirmação');
  return res.data;
}

export async function requestAppointmentConfirmation(
  id: string,
  body?: { note?: string | null },
): Promise<
  (Appointment & { attendees: AppointmentAttendee[] }) & {
    confirmation_dispatch?: {
      ok: boolean;
      status: 'sent' | 'skipped' | 'failed';
      reason?: string;
      delivery_id?: string | null;
    };
  }
> {
  const res = await apiClient.post<
    (Appointment & { attendees: AppointmentAttendee[] }) & {
      confirmation_dispatch?: {
        ok: boolean;
        status: 'sent' | 'skipped' | 'failed';
        reason?: string;
        delivery_id?: string | null;
      };
    }
  >(`/api/appointments/${encodeURIComponent(id)}/request-confirmation`, body ?? {});
  if (res.error) throw new Error(res.error);
  if (!res.data) throw new Error('Falha ao solicitar confirmação');
  return res.data;
}
