import {
  Archive,
  Clock,
  Hammer,
  Rocket,
  ShieldCheck,
  Snowflake,
  type LucideIcon,
} from 'lucide-react';
import type { ProjectVersionMetrics, ProjectVersionStatus } from '@/lib/projectVersionSelection';

type StatusMeta = {
  label: string;
  icon: LucideIcon;
  className: string;
};

export type ReleaseHealth = {
  label: 'Saudável' | 'Em risco' | 'Atrasada';
  className: string;
};

type ReleaseHealthInput = {
  metrics?: ProjectVersionMetrics | null;
};

export function getProjectVersionStatusMeta(status: ProjectVersionStatus, frozen?: boolean): StatusMeta {
  if (frozen) {
    return {
      label: 'Congelada',
      icon: Snowflake,
      className: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/40 dark:text-violet-300',
    };
  }

  const map: Record<ProjectVersionStatus, StatusMeta> = {
    planning: {
      label: 'Planejamento',
      icon: Clock,
      className: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-300',
    },
    development: {
      label: 'Desenvolvimento',
      icon: Hammer,
      className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
    },
    qa: {
      label: 'Validação',
      icon: ShieldCheck,
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
    },
    published: {
      label: 'Publicada',
      icon: Rocket,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    },
    archived: {
      label: 'Arquivada',
      icon: Archive,
      className: 'border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950/40 dark:text-neutral-300',
    },
  };

  return map[status];
}

export function computeReleaseHealth(version: ReleaseHealthInput): ReleaseHealth {
  const overdue = version.metrics?.overdue_tasks ?? 0;
  const total = version.metrics?.total_tasks ?? 0;
  const completed = version.metrics?.completed_tasks ?? 0;
  const open = version.metrics?.open_tasks ?? Math.max(total - completed, 0);
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
  const daysRemaining = version.metrics?.days_remaining;

  if (overdue > 0 || (typeof daysRemaining === 'number' && daysRemaining < 0)) {
    return {
      label: 'Atrasada',
      className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300',
    };
  }

  if (
    open > 0 &&
    ((typeof daysRemaining === 'number' && daysRemaining <= 3) || (total > 0 && progress < 60))
  ) {
    return {
      label: 'Em risco',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
    };
  }

  return {
    label: 'Saudável',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  };
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatRelativeTime(value?: string | null): string | null {
  const date = parseDate(value);
  if (!date) return null;

  const diffMs = date.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ];
  const [unit, size] = units.find(([, unitMs]) => absMs >= unitMs) ?? ['minute', 1000 * 60];
  const valueInUnit = Math.round(diffMs / size);

  return new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(valueInUnit, unit);
}

export function formatCompactDate(value?: string | null): string | null {
  const date = parseDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date);
}

export type ReleaseNoteSection = {
  key: 'feature' | 'fix' | 'improvement' | 'internal' | 'notes';
  title: string;
  icon: string;
  items: string[];
};

export function parseReleaseNotes(releaseNotes?: string | null): ReleaseNoteSection[] {
  if (!releaseNotes?.trim()) return [];

  const headings: Record<string, ReleaseNoteSection> = {
    novidades: { key: 'feature', title: 'Features', icon: '✨', items: [] },
    features: { key: 'feature', title: 'Features', icon: '✨', items: [] },
    correções: { key: 'fix', title: 'Correções', icon: '🐛', items: [] },
    correcoes: { key: 'fix', title: 'Correções', icon: '🐛', items: [] },
    melhorias: { key: 'improvement', title: 'Melhorias', icon: '⚡', items: [] },
    interno: { key: 'internal', title: 'Interno', icon: '🔒', items: [] },
  };
  const sections = Object.values(headings).filter(
    (section, index, all) => all.findIndex((item) => item.key === section.key) === index,
  );
  const fallback: ReleaseNoteSection = { key: 'notes', title: 'Notas', icon: '•', items: [] };
  let current: ReleaseNoteSection | null = null;

  releaseNotes
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line, index) => {
      const normalized = line.toLowerCase();
      if (index === 0 && !line.startsWith('-') && !headings[normalized]) return;
      if (headings[normalized]) {
        current = headings[normalized];
        return;
      }
      const text = line.replace(/^[-*]\s*/, '');
      (current ?? fallback).items.push(text);
    });

  return [...sections, fallback].filter((section) => section.items.length > 0);
}
