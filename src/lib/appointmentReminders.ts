/** Alinhado com /agenda e com o worker de lembretes (10m, 30m, 1h, 1d). */
export type AppointmentReminderFormState = {
  rem10: boolean;
  rem30: boolean;
  rem60: boolean;
  rem1440: boolean;
  sendReminderToClient: boolean;
};

export type AppointmentReminderPayload = { method: 'popup'; minutes: number };

/** Padrão no chat: lembretes ao cliente ativos (10m, 30m, 1h). */
export const DEFAULT_CHAT_APPOINTMENT_REMINDERS: AppointmentReminderFormState = {
  rem10: true,
  rem30: true,
  rem60: true,
  rem1440: false,
  sendReminderToClient: true,
};

export function buildAppointmentRemindersPayload(
  form: Pick<AppointmentReminderFormState, 'rem10' | 'rem30' | 'rem60' | 'rem1440'>,
): AppointmentReminderPayload[] {
  const rems: AppointmentReminderPayload[] = [];
  if (form.rem10) rems.push({ method: 'popup', minutes: 10 });
  if (form.rem30) rems.push({ method: 'popup', minutes: 30 });
  if (form.rem60) rems.push({ method: 'popup', minutes: 60 });
  if (form.rem1440) rems.push({ method: 'popup', minutes: 1440 });
  return rems;
}
