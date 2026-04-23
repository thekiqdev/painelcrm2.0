import { describe, it, expect } from 'vitest';
import { utcInstantForLocalWallClock } from './notificationTenantOutboundDispatchSchedule.js';

function localWallAt(d: Date, timeZone: string): { ymd: string; hhmm: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { ymd: `${m.year}-${m.month}-${m.day}`, hhmm: `${m.hour}:${m.minute}` };
}

describe('utcInstantForLocalWallClock', () => {
  it('reproduces America/Sao_Paulo wall time', () => {
    const d = utcInstantForLocalWallClock('2024-08-15', '15:30', 'America/Sao_Paulo');
    expect(localWallAt(d, 'America/Sao_Paulo')).toEqual({ ymd: '2024-08-15', hhmm: '15:30' });
  });

  it('reproduces UTC wall time', () => {
    const d = utcInstantForLocalWallClock('2024-01-10', '09:00', 'UTC');
    expect(localWallAt(d, 'UTC')).toEqual({ ymd: '2024-01-10', hhmm: '09:00' });
  });
});
