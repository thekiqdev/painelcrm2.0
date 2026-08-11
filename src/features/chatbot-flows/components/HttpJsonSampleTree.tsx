import { Check, ChevronRight, Copy, Pin } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import {
  formatSampleRowCopy,
  formatSampleValue,
  serializeSampleValue,
} from '../lib/httpTestHelpers';

type Props = {
  value: unknown;
  path?: string;
  onPickPath: (path: string, value: unknown) => void;
  depth?: number;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function RowActions({
  path,
  value,
  onPickPath,
}: {
  path: string;
  value: unknown;
  onPickPath: (path: string, value: unknown) => void;
}) {
  const [copied, setCopied] = useState(false);
  const pickKey = path || 'body';

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    const text = formatSampleRowCopy(path, value);
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  const handlePin = (e: MouseEvent) => {
    e.stopPropagation();
    onPickPath(pickKey, value);
  };

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        title="Copiar valor completo"
        aria-label="Copiar valor completo"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
      </button>
      <button
        type="button"
        className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-950/40"
        title={path ? `Fixar / mapear ${path}` : 'Fixar / mapear body'}
        aria-label="Fixar para criar variável"
        onClick={handlePin}
      >
        <Pin className="h-3 w-3" />
      </button>
    </span>
  );
}

function JsonNode({ value, path = '', onPickPath, depth = 0 }: Props) {
  const [open, setOpen] = useState(depth < 2);
  const expandable = isPlainObject(value) || Array.isArray(value);
  const fullValue = serializeSampleValue(value);
  const preview = formatSampleValue(value);
  const leafLabel = path ? path.split('.').pop()! : 'body';

  if (!expandable) {
    return (
      <div className="flex w-full items-start gap-1 rounded px-1 py-0.5 hover:bg-violet-50/80 dark:hover:bg-violet-950/30">
        <RowActions path={path} value={value} onPickPath={onPickPath} />
        <span
          className="min-w-0 flex-1 truncate font-mono text-[11px] text-left"
          title={fullValue.length > 60 ? fullValue : undefined}
        >
          <span className="text-violet-700 dark:text-violet-300">{leafLabel}</span>
          <span className="text-muted-foreground"> = {preview}</span>
        </span>
      </div>
    );
  }

  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);

  return (
    <div className={cn(depth > 0 && 'ml-2 border-l border-border/60 pl-1.5')}>
      {path ? (
        <div className="flex w-full items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/40">
          <RowActions path={path} value={value} onPickPath={onPickPath} />
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-0.5 text-left"
            onClick={() => setOpen((o) => !o)}
            title={fullValue.length > 60 ? fullValue : undefined}
          >
            <ChevronRight
              className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
            />
            <span className="truncate font-mono text-[11px] font-medium">{leafLabel}</span>
            <span className="text-[10px] text-muted-foreground">
              {Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`}
            </span>
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
