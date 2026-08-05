import { useState } from 'react';
import { Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  testChatbotFlowIntegration,
  type ChatbotFlowIntegrationTestResult,
} from '@/services/chatbotFlows';
import { buildMockFlowVariableSeed } from '../lib/mockVariableSeed';
import {
  formatSampleValue,
  LAST_TEST_BODY_MAX,
  parseLastTestBodyJson,
  suggestVarNameFromPath,
} from '../lib/httpTestHelpers';
import { HttpJsonSampleTree } from './HttpJsonSampleTree';

type ResponseMapRow = { path: string; variable: string };

type Props = {
  kind: 'http_request' | 'webhook_out';
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
};

function normalizeMap(raw: unknown): ResponseMapRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const path = String(r.path || '').trim();
      const variable = String(r.variable || '').trim();
      if (!path || !variable) return null;
      return { path, variable };
    })
    .filter(Boolean) as ResponseMapRow[];
}

function uniqueVarName(base: string, existing: ResponseMapRow[]): string {
  const used = new Set(existing.map((r) => r.variable));
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i += 1;
  return `${base}_${i}`;
}

export function HttpIntegrationTestSection({ kind, data, onChange }: Props) {
  const [testing, setTesting] = useState(false);
  const [pickPath, setPickPath] = useState<string | null>(null);
  const [pickVar, setPickVar] = useState('');
  const mapRows = normalizeMap(data.response_map);
  const sampleJson = parseLastTestBodyJson(data);
  const hasSample = Boolean(data.last_test_at);

  const persistResult = (result: ChatbotFlowIntegrationTestResult) => {
    const bodyText = (result.body_text || '').slice(0, LAST_TEST_BODY_MAX);
    onChange({
      last_test_at: result.tested_at,
      last_test_ok: result.ok,
      last_test_status: result.status,
      last_test_body: bodyText,
      last_test_json: result.body_json ?? null,
      last_test_error: result.error,
      last_test_mapped: result.mapped || {},
    });
  };

  const runTest = async () => {
    const url = String(data.url || '').trim();
    if (!url) {
      onChange({
        last_test_at: new Date().toISOString(),
        last_test_ok: false,
        last_test_status: 0,
        last_test_body: '',
        last_test_json: null,
        last_test_error: 'Informe a URL antes de testar',
        last_test_mapped: {},
      });
      return;
    }
    setTesting(true);
    try {
      const result = await testChatbotFlowIntegration({
        kind,
        method: String(data.method || (kind === 'webhook_out' ? 'POST' : 'GET')) as
          | 'GET'
          | 'POST'
          | 'PUT'
          | 'PATCH'
          | 'DELETE',
        url,
        headers: Array.isArray(data.headers)
          ? (data.headers as Array<{ key: string; value: string }>)
          : [],
        body: String(data.body || ''),
        timeout_ms: Number(data.timeout_ms) || 10000,
        secret: String(data.secret || ''),
        include_session_vars: data.include_session_vars !== false,
        payload_mode: (String(data.payload_mode || 'envelope') as
          | 'envelope'
          | 'envelope_plus'
          | 'custom'),
        body_template: String(data.body_template || ''),
        variables: buildMockFlowVariableSeed(),
        response_variable: data.response_variable
          ? String(data.response_variable)
          : undefined,
        status_variable: data.status_variable ? String(data.status_variable) : undefined,
        response_map: mapRows,
      });
      persistResult(result);
      // Resultado fica no sample do nó (sem toast).
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha no teste';
      onChange({
        last_test_at: new Date().toISOString(),
        last_test_ok: false,
        last_test_status: 0,
        last_test_body: '',
        last_test_json: null,
        last_test_error: msg,
        last_test_mapped: {},
      });
    } finally {
      setTesting(false);
    }
  };

  const startPick = (path: string) => {
    const effective = path === 'body' ? '' : path;
    if (!effective && kind === 'webhook_out') return;
    const suggested = uniqueVarName(
      suggestVarNameFromPath(effective || 'body'),
      mapRows
    );
    setPickPath(effective || 'body');
    setPickVar(suggested);
  };

  const confirmPick = () => {
    if (pickPath == null) return;
    const path = pickPath === 'body' ? '' : pickPath;
    const variable = pickVar.trim().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!variable || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable)) {
      return;
    }
    if (kind === 'http_request' && !path) {
      // body inteiro → response_variable
      onChange({ response_variable: variable });
      setPickPath(null);
      return;
    }
    if (!path) return;
    const next = [...mapRows.filter((r) => r.path !== path && r.variable !== variable), { path, variable }];
    onChange({ response_map: next });
    setPickPath(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Testar integração</p>
          <p className="text-[11px] text-muted-foreground">
            Dispara de verdade (com SSRF). Sample fica só no rascunho.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => void runTest()} disabled={testing}>
          {testing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          Testar
        </Button>
      </div>

      {hasSample ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span
              className={
                data.last_test_ok
                  ? 'rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'rounded bg-rose-100 px-1.5 py-0.5 font-medium text-rose-800 dark:bg-rose-950 dark:text-rose-200'
              }
            >
              {data.last_test_ok ? 'OK' : 'Erro'} · HTTP {String(data.last_test_status ?? '—')}
            </span>
            <span className="text-muted-foreground">
              {data.last_test_at ? new Date(String(data.last_test_at)).toLocaleString() : ''}
            </span>
          </div>
          {data.last_test_error ? (
            <p className="text-[11px] text-rose-600">{String(data.last_test_error)}</p>
          ) : null}

          {kind === 'http_request' ? (
            <>
              <Label className="text-[11px]">Última resposta — clique para criar variável</Label>
              {sampleJson != null ? (
                <HttpJsonSampleTree value={sampleJson} onPickPath={(p) => startPick(p)} />
              ) : (
                <pre className="max-h-32 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px] whitespace-pre-wrap">
                  {String(data.last_test_body || '(vazio)')}
                </pre>
              )}

              {pickPath != null ? (
                <div className="space-y-1.5 rounded-md border bg-background p-2">
                  <p className="text-[11px]">
                    Mapear{' '}
                    <code className="text-[10px]">
                      {pickPath === 'body' ? '(body inteiro)' : pickPath}
                    </code>
                  </p>
                  <div className="flex gap-1.5">
                    <Input
                      className="h-8 font-mono text-xs"
                      value={pickVar}
                      onChange={(e) => setPickVar(e.target.value)}
                      placeholder="nome_variavel"
                    />
                    <Button type="button" size="sm" className="h-8" onClick={confirmPick}>
                      Criar
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      onClick={() => setPickPath(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <pre className="max-h-28 overflow-auto rounded-md border bg-muted/20 p-2 font-mono text-[10px] whitespace-pre-wrap">
              {String(data.last_test_body || '(sem body)')}
            </pre>
          )}
        </div>
      ) : null}

      {kind === 'http_request' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Variáveis mapeadas</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() =>
                onChange({
                  response_map: [...mapRows, { path: 'data.id', variable: 'ext_id' }],
                })
              }
            >
              <Plus className="mr-0.5 h-3 w-3" />
              Manual
            </Button>
          </div>
          {mapRows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma ainda. Teste a API e clique num campo da resposta.
            </p>
          ) : (
            mapRows.map((row, i) => (
              <div key={`${row.path}-${i}`} className="flex gap-1.5">
                <Input
                  className="h-8 font-mono text-[11px]"
                  value={row.path}
                  placeholder="data.id"
                  onChange={(e) => {
                    const next = [...mapRows];
                    next[i] = { ...row, path: e.target.value };
                    onChange({ response_map: next });
                  }}
                />
                <Input
                  className="h-8 font-mono text-[11px]"
                  value={row.variable}
                  placeholder="ext_id"
                  onChange={(e) => {
                    const next = [...mapRows];
                    next[i] = { ...row, variable: e.target.value };
                    onChange({ response_map: next });
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => onChange({ response_map: mapRows.filter((_, j) => j !== i) })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
          {data.last_test_mapped &&
          typeof data.last_test_mapped === 'object' &&
          Object.keys(data.last_test_mapped as object).length > 0 ? (
            <div className="rounded-md border bg-muted/10 p-2 text-[10px] text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Valores do último teste</p>
              {Object.entries(data.last_test_mapped as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="font-mono">
                  {`{{${k}}}`} = {formatSampleValue(v)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
