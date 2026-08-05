import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

const METHOD_STYLE: Record<HttpMethod, { idle: string; active: string }> = {
  GET: {
    idle: 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200',
    active:
      'border-slate-700 bg-slate-800 text-white shadow-sm dark:border-slate-300 dark:bg-slate-200 dark:text-slate-900',
  },
  POST: {
    idle: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200',
    active: 'border-emerald-700 bg-emerald-600 text-white shadow-sm',
  },
  PUT: {
    idle: 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200',
    active: 'border-amber-700 bg-amber-600 text-white shadow-sm',
  },
  PATCH: {
    idle: 'border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-200',
    active: 'border-orange-700 bg-orange-600 text-white shadow-sm',
  },
  DELETE: {
    idle: 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-200',
    active: 'border-rose-700 bg-rose-600 text-white shadow-sm',
  },
};

export function normalizeHttpMethod(raw: unknown, fallback: HttpMethod = 'GET'): HttpMethod {
  const m = String(raw || fallback).toUpperCase();
  return (HTTP_METHODS as readonly string[]).includes(m) ? (m as HttpMethod) : fallback;
}

type Props = {
  label?: string;
  value: string;
  onChange: (method: HttpMethod) => void;
  /** Default quando value inválido. */
  fallback?: HttpMethod;
};

/** Tags selecionáveis de método HTTP (visual tipo n8n). */
export function HttpMethodTags({ label = 'Método', value, onChange, fallback = 'GET' }: Props) {
  const current = normalizeHttpMethod(value, fallback);

  return (
    <div className="space-y-1.5">
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label || 'Método HTTP'}>
        {HTTP_METHODS.map((m) => {
          const active = current === m;
          const style = METHOD_STYLE[m];
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(m)}
              className={cn(
                'rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide transition-colors',
                active ? style.active : style.idle
              )}
            >
              {m}
            </button>
          );
        })}
      </div>
    </div>
  );
}
