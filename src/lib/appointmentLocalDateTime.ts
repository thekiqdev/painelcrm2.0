/** HH:mm no relógio local do navegador (para inputs `type="time"`). */
export function localTimeHHmmNow(date = new Date()): string {
  const h = date.getHours();
  const m = date.getMinutes();
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Horário de parede local do navegador → ISO UTC para `timestamptz` no backend.
 * Evita `parse` + `toISOString` ambíguos e o desvio de +3h (ex.: 14h virando 17h na confirmação).
 */
export function localWallClockToUtcIso(day: Date, timeHHmm: string): string {
  const [hh, mm] = timeHHmm.split(':').map((x) => parseInt(x, 10) || 0);
  const x = new Date(day);
  x.setHours(hh, mm, 0, 0);
  return x.toISOString();
}

export function addMinutesToUtcIso(iso: string, minutes: number): string {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/** Exibe HH:mm no fuso do utilizador (navegador). */
export function formatLocalTimeFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
