import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatSampleValue } from '../lib/httpTestHelpers';

type Props = {
  value: unknown;
  path?: string;
  onPickPath: (path: string, value: unknown) => void;
  depth?: number;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function JsonNode({ value, path = '', onPickPath, depth = 0 }: Props) {
  const [open, setOpen] = useState(depth < 2);
  const expandable = isPlainObject(value) || Array.isArray(value);

  if (!expandable) {
    return (
      <button
        type="button"
        className="flex w-full items-start gap-1 rounded px-1.5 py-0.5 text-left hover:bg-violet-50 dark:hover:bg-violet-950/40"
        onClick={() => onPickPath(path || 'body', value)}
        title={path ? `Criar variável a partir de ${path}` : 'Criar variável com o body'}
      >
        <span className="shrink-0 font-mono text-[11px] text-violet-700 dark:text-violet-300">
          {path ? path.split('.').pop() : 'body'}
        </span>
        <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
          {formatSampleValue(value)}
        </span>
      </button>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);

  return (
    <div className={cn(depth > 0 && 'ml-2 border-l border-border/60 pl-1.5')}>
      {path ? (
        <div className="flex w-full items-center gap-0.5 rounded px-1 py-0.5">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-0.5 text-left hover:bg-muted/60"
            onClick={() => setOpen((o) => !o)}
          >
            <ChevronRight
              className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
            />
            <span className="truncate font-mono text-[11px] font-medium">
              {path.split('.').pop()}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`}
            </span>
          </button>
          <button
            type="button"
            className="shrink-0 px-1 text-[10px] text-violet-600 hover:underline"
            onClick={() => onPickPath(path, value)}
          >
            mapear
          </button>
        </div>
      ) : null}

      {(open || !path) &&
        entries.map(([k, v]) => {
          const childPath = path ? `${path}.${k}` : k;
          return (
            <JsonNode
              key={childPath}
              value={v}
              path={childPath}
              onPickPath={onPickPath}
              depth={depth + 1}
            />
          );
        })}
    </div>
  );
}

export function HttpJsonSampleTree({
  value,
  onPickPath,
}: {
  value: unknown;
  onPickPath: (path: string, value: unknown) => void;
}) {
  if (value == null) {
    return <p className="text-[11px] text-muted-foreground">Resposta sem JSON.</p>;
  }
  return (
    <div className="max-h-48 overflow-auto rounded-md border bg-muted/20 p-1.5">
      <JsonNode value={value} onPickPath={onPickPath} />
    </div>
  );
}
