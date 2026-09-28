import { formatYmdBrSafe } from '@/lib/billingSafeDate';

export function formatExperienceAmount(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatExperienceYmd(ymd: string | null | undefined): string {
  return formatYmdBrSafe(ymd);
}
