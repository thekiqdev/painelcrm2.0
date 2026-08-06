import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { VariableTextField } from './VariableTextField';
import type { FlowDefinedVariable } from '../lib/flowDefinedVariables';

export type KvRow = { key: string; value: string };
export type JsonFieldsMode = 'json' | 'fields';

function ModeToggle({
  value,
  onChange,
}: {
  value: JsonFieldsMode;
  onChange: (m: JsonFieldsMode) => void;
}) {
  return (
    <div className="flex gap-1" role="group" aria-label="Modo de edição">
      {(
        [
          { id: 'fields' as const, label: 'Fields' },
          { id: 'json' as const, label: 'JSON' },
        ] as const
      ).map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              'rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors',
              active
                ? 'border-slate-800 bg-slate-800 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900'
                : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function normalizeKvRows(raw: unknown): KvRow[] {
  if (Array.isArray(raw)) {
    return raw
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const r = row as Record<string, unknown>;
        return { key: String(r.key ?? ''), value: String(r.value ?? '') };
      })
      .filter(Boolean) as KvRow[];
  }
  if (raw && typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({
      key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }));
  }
  return [];
}

/**
 * Fields → JSON object string.
 * Valores são sempre string (evita `123` virar número e perder aspas no password).
 * Só interpreta como JSON se começar com `{` ou `[`.
 * Linhas com key vazia são omitidas do JSON (mas a UI pode mantê-las em state local).
 */
export function kvRowsToJsonObjectString(rows: KvRow[]): string {
  const obj: Record<string, unknown> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    const raw = r.value;
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        obj[k] = JSON.parse(trimmed);
        continue;
      } catch {
        /* cai para string */
      }
    }
    obj[k] = raw;
  }
  return JSON.stringify(obj, null, 2);
}

export function jsonObjectStringToKvRows(text: string): KvRow[] {
  try {
    const parsed = JSON.parse(text || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const entries = Object.entries(parsed as Record<string, unknown>);
      if (entries.length === 0) return [{ key: '', value: '' }];
      return entries.map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }));
    }
  } catch {
    /* ignore */
  }
  return [{ key: '', value: '' }];
}

function canonicalBodyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text || '{}'));
  } catch {
    return text;
  }
}

function KvRowsEditor({
  rows,
  onChange,
  keyPlaceholder,
  valuePlaceholder,
  flowVariables,
  enableValueVariables,
}: {
  rows: KvRow[];
  onChange: (rows: KvRow[]) => void;
  keyPlaceholder: string;
  valuePlaceholder: string;
  flowVariables?: FlowDefinedVariable[];
  /** Mostra picker {{ }} no Value (body custom / headers). */
  enableValueVariables?: boolean;
}) {
  const list = rows.length ? rows : [{ key: '', value: '' }];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1.5 px-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="w-[38%]">Name</span>
        <span className="flex-1">Value</span>
        <span className="w-8" />
      </div>
      {list.map((row, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            className="h-8 w-[38%] shrink-0 font-mono text-[11px]"
            value={row.key}
            placeholder={keyPlaceholder}
            onChange={(e) => {
              const next = [...list];
              next[i] = { ...row, key: e.target.value };
              onChange(next);
            }}
          />
          {enableValueVariables ? (
            <VariableTextField
              id={`kv-value-${i}`}
              label="Value"
              inline
              multiline={false}
              value={row.value}
              onChange={(value) => {
                const next = [...list];
                next[i] = { ...row, value };
                onChange(next);
              }}
              placeholder={valuePlaceholder}
              flowVariables={flowVariables}
            />
          ) : (
            <Input
              className="h-8 min-w-0 flex-1 font-mono text-[11px]"
              value={row.value}
              placeholder={valuePlaceholder}
              onChange={(e) => {
                const next = [...list];
                next[i] = { ...row, value: e.target.value };
                onChange(next);
              }}
            />
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => {
              const next = list.filter((_, j) => j !== i);
              onChange(next.length ? next : [{ key: '', value: '' }]);
            }}
            aria-label="Remover linha"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7"
        onClick={() => onChange([...list, { key: '', value: '' }])}
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        Incluir linha
      </Button>
    </div>
  );
}

/** Headers: persiste como Array<{key,value}>. */
export function HeadersJsonFieldsEditor({
  headers,
  uiMode,
  onHeadersChange,
  onUiModeChange,
  flowVariables,
  hint,
}: {
  headers: unknown;
  uiMode?: string;
  onHeadersChange: (headers: KvRow[]) => void;
  onUiModeChange: (mode: JsonFieldsMode) => void;
  flowVariables?: FlowDefinedVariable[];
  hint?: string;
}) {
  const mode: JsonFieldsMode = uiMode === 'json' ? 'json' : 'fields';
  const rows = normalizeKvRows(headers);
  const [jsonDraft, setJsonDraft] = useState(() => JSON.stringify(rows, null, 2));

  useEffect(() => {
    if (mode === 'json') {
      setJsonDraft(JSON.stringify(normalizeKvRows(headers), null, 2));
    }
  }, [headers, mode]);

  const commitJson = (text: string) => {
    try {
      const parsed = JSON.parse(text || '[]') as unknown;
      onHeadersChange(normalizeKvRows(parsed));
    } catch {
      /* JSON inválido — mantém draft local */
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Headers</Label>
        <ModeToggle
          value={mode}
          onChange={(m) => {
            if (m === 'json' && mode === 'fields') {
              setJsonDraft(JSON.stringify(rows, null, 2));
            }
            onUiModeChange(m);
          }}
        />
      </div>
      {mode === 'fields' ? (
        <KvRowsEditor
          rows={rows.length ? rows : [{ key: '', value: '' }]}
          onChange={onHeadersChange}
          keyPlaceholder="Authorization"
          valuePlaceholder="Bearer {{token}}"
          flowVariables={flowVariables}
          enableValueVariables={Boolean(flowVariables)}
        />
      ) : (
        <Textarea
          rows={3}
          value={jsonDraft}
          onChange={(e) => {
            setJsonDraft(e.target.value);
            commitJson(e.target.value);
          }}
          onBlur={(e) => commitJson(e.target.value)}
          placeholder='[{"key":"Authorization","value":"Bearer …"}]'
          className="font-mono text-xs"
        />
      )}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * Body JSON: persiste string. Fields = objeto flat chave/valor.
 * State local preserva linhas com key vazia (senão “Incluir linha” some no roundtrip JSON).
 */
export function BodyJsonFieldsEditor({
  body,
  uiMode,
  onBodyChange,
  onUiModeChange,
  flowVariables,
  label = 'Body',
  hint,
}: {
  body: string;
  uiMode?: string;
  onBodyChange: (body: string) => void;
  onUiModeChange: (mode: JsonFieldsMode) => void;
  flowVariables?: FlowDefinedVariable[];
  label?: string;
  hint?: string;
}) {
  const mode: JsonFieldsMode = uiMode === 'json' ? 'json' : 'fields';
  const [rows, setRows] = useState<KvRow[]>(() => jsonObjectStringToKvRows(body));
  /** Último body que nós mesmos emitimos — evita useEffect apagar linhas vazias. */
  const lastEmittedRef = useRef(canonicalBodyJson(body));

  useEffect(() => {
    const incoming = canonicalBodyJson(body);
    if (incoming === lastEmittedRef.current) return;
    lastEmittedRef.current = incoming;
    setRows(jsonObjectStringToKvRows(body));
  }, [body]);

  const commitRows = (next: KvRow[]) => {
    const ensured = next.length ? next : [{ key: '', value: '' }];
    setRows(ensured);
    const json = kvRowsToJsonObjectString(ensured);
    lastEmittedRef.current = canonicalBodyJson(json);
    onBodyChange(json);
  };

  const switchMode = (m: JsonFieldsMode) => {
    if (m === mode) return;
    if (m === 'json' && mode === 'fields') {
      const json = kvRowsToJsonObjectString(rows);
      lastEmittedRef.current = canonicalBodyJson(json);
      onBodyChange(json);
    }
    if (m === 'fields' && mode === 'json') {
      setRows(jsonObjectStringToKvRows(body));
    }
    onUiModeChange(m);
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <ModeToggle value={mode} onChange={switchMode} />
      </div>
      {mode === 'fields' ? (
        <KvRowsEditor
          rows={rows}
          onChange={commitRows}
          keyPlaceholder="nome"
          valuePlaceholder="{{answer}}"
          flowVariables={flowVariables}
          enableValueVariables
        />
      ) : (
        <VariableTextField
          id="body-json"
          label="JSON"
          rows={5}
          value={body}
          onChange={(v) => {
            lastEmittedRef.current = canonicalBodyJson(v);
            onBodyChange(v);
          }}
          placeholder={'{\n  "nome": "{{answer}}"\n}'}
          inputClassName="font-mono text-xs"
          flowVariables={flowVariables}
          className="[&_label]:sr-only"
        />
      )}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
