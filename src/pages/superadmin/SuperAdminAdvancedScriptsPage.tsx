import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/components/ui/sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { Eye, ListOrdered, Loader2, Play, RefreshCw, Stethoscope, Terminal } from 'lucide-react';

const MEDIA_DATA_ACK_TEXT = 'Entendo que esta ação irá alterar dados de mídia.';

export type AdminScriptListItem = {
  key: string;
  name: string;
  description: string;
  risk: 'low' | 'medium' | 'high';
  category: 'diagnostic' | 'audit' | 'repair' | 'reprocess';
  implemented: boolean;
  auditOnly?: boolean;
  lastExecuteAt: string | null;
  lastPreviewAt: string | null;
};

const CONVERSATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CATEGORY_ORDER: Record<AdminScriptListItem['category'], number> = {
  diagnostic: 0,
  audit: 1,
  repair: 2,
  reprocess: 3,
};

/** Evita NaN na ordenação se a API devolver categoria desconhecida ou ausente (build antigo). */
function categorySortOrder(category: AdminScriptListItem['category'] | string | undefined): number {
  if (category == null || category === '') return 99;
  const n = CATEGORY_ORDER[category as AdminScriptListItem['category']];
  return typeof n === 'number' ? n : 99;
}

/** Ordem sugerida dentro de Fix/Diagnóstico (não alfabética). */
const DIAGNOSTIC_SCRIPT_ORDER: Record<string, number> = {
  'media.diagnose_system': 1,
  'media.test_storage_roundtrip': 2,
  'media.diagnose_conversation_avatar': 3,
};

type AvatarWorkerStatusPayload = {
  ok?: boolean;
  mediaAvatarWhatsappEnabled: boolean;
  workerEnabledEnv: boolean;
  workerIntervalMinutes: number;
  workerLimit: number;
  workerMaxFailures: number;
  lockBusy: boolean;
  nextCycleEstimatedAt: string | null;
  state: {
    last_cycle_started_at: string | null;
    last_cycle_finished_at: string | null;
    last_cycle_processed: number;
    last_cycle_success: number;
    last_cycle_failed: number;
    last_cycle_skipped: number;
    total_processed: number;
    total_success: number;
    total_failed: number;
    total_skipped: number;
    updated_at: string | null;
  } | null;
};

type RecentMediaAssetItem = {
  id: string;
  tenant_id: string;
  scope: string;
  owner_type: string;
  owner_id?: string | null;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

function riskLabel(r: AdminScriptListItem['risk']): string {
  switch (r) {
    case 'low':
      return 'Baixo';
    case 'medium':
      return 'Médio';
    case 'high':
      return 'Alto';
    default:
      return r;
  }
}

function riskVariant(r: AdminScriptListItem['risk']): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (r === 'high') return 'destructive';
  if (r === 'medium') return 'default';
  return 'secondary';
}

function categoryLabel(c: AdminScriptListItem['category'] | string): string {
  switch (c) {
    case 'diagnostic':
      return 'Fix / Diagnóstico';
    case 'audit':
      return 'Auditoria';
    case 'repair':
      return 'Correção';
    case 'reprocess':
      return 'Reprocessamento';
    default:
      return typeof c === 'string' && c ? `Categoria: ${c}` : '(sem categoria)';
  }
}

function overallStatusBadge(status: unknown) {
  const s = String(status ?? '');
  if (s === 'OK') {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-700 border-transparent">OK</Badge>
    );
  }
  if (s === 'Erro') {
    return <Badge variant="destructive">Erro</Badge>;
  }
  return <Badge variant="secondary">Atenção</Badge>;
}

function formatDiagnosticValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function DiagnosticSectionsDisplay({ result }: { result: Record<string, unknown> }) {
  const sections = result.sections;
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) {
    return null;
  }
  const entries = Object.entries(sections as Record<string, Record<string, unknown>>);
  return (
    <div className="space-y-3">
      {entries.map(([name, sec]) => (
        <Card key={name}>
          <CardHeader className="py-3 px-4 space-y-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-medium capitalize">{name.replace(/_/g, ' ')}</CardTitle>
              {typeof sec?.status === 'string' ? overallStatusBadge(sec.status) : null}
            </div>
          </CardHeader>
          <CardContent className="text-xs space-y-2 pt-0 px-4 pb-4">
            {Object.entries(sec || {})
              .filter(([k]) => k !== 'status')
              .map(([k, v]) => (
                <div
                  key={k}
                  className="grid gap-1 sm:grid-cols-[minmax(0,140px)_1fr] border-b border-border/50 pb-2 last:border-0"
                >
                  <span className="text-muted-foreground font-medium break-words">{k}</span>
                  <span className="break-all font-mono text-[11px] leading-snug whitespace-pre-wrap">
                    {formatDiagnosticValue(v)}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function SuperAdminAdvancedScriptsPage() {
  const [scripts, setScripts] = useState<AdminScriptListItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewScript, setPreviewScript] = useState<AdminScriptListItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRunId, setPreviewRunId] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<Record<string, unknown> | null>(null);

  const [executeOpen, setExecuteOpen] = useState(false);
  const [executeScript, setExecuteScript] = useState<AdminScriptListItem | null>(null);
  const [executeAck, setExecuteAck] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [executeOutcome, setExecuteOutcome] = useState<{
    runId: string;
    result: Record<string, unknown>;
  } | null>(null);
  const [recentAssets, setRecentAssets] = useState<RecentMediaAssetItem[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);

  const [workerStatus, setWorkerStatus] = useState<AvatarWorkerStatusPayload | null>(null);
  const [loadingWorkerStatus, setLoadingWorkerStatus] = useState(false);

  /** Filtros opcionais do script `media.reprocess_avatar_cache` */
  const [avatarReprocessTenantId, setAvatarReprocessTenantId] = useState('');
  const [avatarReprocessLimit, setAvatarReprocessLimit] = useState('20');
  const [uazGenerateMissingSecrets, setUazGenerateMissingSecrets] = useState(true);
  const [diagConversationId, setDiagConversationId] = useState('');
  const [diagRoundtripTenantId, setDiagRoundtripTenantId] = useState('');

  const scriptsDebugEnabled = useMemo(() => {
    if (import.meta.env.DEV) return true;
    try {
      if (typeof window === 'undefined') return false;
      if (new URLSearchParams(window.location.search).get('scriptsDebug') === '1') return true;
      return localStorage.getItem('superadmin_scripts_debug') === '1';
    } catch {
      return false;
    }
  }, []);

  const sortedScripts = useMemo(
    () =>
      [...scripts].sort((a, b) => {
        const byCat = categorySortOrder(a.category) - categorySortOrder(b.category);
        if (byCat !== 0) return byCat;
        if (a.category === 'diagnostic' && b.category === 'diagnostic') {
          const stepA = DIAGNOSTIC_SCRIPT_ORDER[a.key] ?? 99;
          const stepB = DIAGNOSTIC_SCRIPT_ORDER[b.key] ?? 99;
          if (stepA !== stepB) return stepA - stepB;
        }
        return a.name.localeCompare(b.name, 'pt-BR');
      }),
    [scripts],
  );

  const buildAvatarReprocessBody = useCallback(
    (s: AdminScriptListItem | null): Record<string, unknown> => {
      if (!s) return {};
      if (s.key === 'uazapi.review_webhooks') {
        return { generateMissingSecrets: uazGenerateMissingSecrets };
      }
      if (s.key === 'media.diagnose_conversation_avatar') {
        const id = diagConversationId.trim();
        if (!id) return {};
        return { conversationId: id };
      }
      if (s.key === 'media.test_storage_roundtrip') {
        const body: Record<string, unknown> = {};
        const t = diagRoundtripTenantId.trim();
        if (t) body.tenantId = t;
        return body;
      }
      if (s.key !== 'media.reprocess_avatar_cache') return {};
      const lim = parseInt(avatarReprocessLimit, 10);
      const body: Record<string, unknown> = {
        limit: Number.isFinite(lim) ? lim : 20,
      };
      const t = avatarReprocessTenantId.trim();
      if (t) body.tenantId = t;
      return body;
    },
    [
      avatarReprocessLimit,
      avatarReprocessTenantId,
      uazGenerateMissingSecrets,
      diagConversationId,
      diagRoundtripTenantId,
    ],
  );

  const loadScripts = useCallback(async () => {
    setLoadingList(true);
    const res = await apiClient.get<{ scripts: AdminScriptListItem[] }>('/api/superadmin/advanced/scripts');
    setLoadingList(false);
    if (res.error || !res.data?.scripts) {
      toast.error(res.error ?? 'Não foi possível carregar os scripts.');
      return;
    }
    const list = res.data.scripts;
    setScripts(list);

    const diagKeys = ['media.diagnose_system', 'media.test_storage_roundtrip', 'media.diagnose_conversation_avatar'];
    const wantDebug =
      import.meta.env.DEV ||
      (typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('scriptsDebug') === '1' ||
          localStorage.getItem('superadmin_scripts_debug') === '1'));

    if (wantDebug) {
      console.debug('[GET /api/superadmin/advanced/scripts]', {
        total: list.length,
        keys: list.map((s) => s.key),
        categories: [...new Set(list.map((s) => s.category))],
        diagnosticScriptsPresent: diagKeys.filter((k) => list.some((s) => s.key === k)),
        diagnosticScriptsMissing: diagKeys.filter((k) => !list.some((s) => s.key === k)),
      });
    }
  }, []);

  useEffect(() => {
    void loadScripts();
  }, [loadScripts]);

  const loadRecentAssets = useCallback(async () => {
    setLoadingAssets(true);
    const res = await apiClient.get<{ ok: boolean; items: RecentMediaAssetItem[] }>(
      '/api/superadmin/advanced/media/assets?limit=20',
    );
    setLoadingAssets(false);
    if (res.error || !res.data?.ok) {
      setRecentAssets([]);
      return;
    }
    setRecentAssets(res.data.items ?? []);
  }, []);

  useEffect(() => {
    void loadRecentAssets();
  }, [loadRecentAssets]);

  const loadWorkerStatus = useCallback(async () => {
    setLoadingWorkerStatus(true);
    const res = await apiClient.get<AvatarWorkerStatusPayload & { ok?: boolean }>(
      '/api/superadmin/advanced/whatsapp-avatar-cache-worker/status',
    );
    setLoadingWorkerStatus(false);
    if (res.error || !res.data || res.data.ok === false) {
      setWorkerStatus(null);
      return;
    }
    setWorkerStatus(res.data);
  }, []);

  useEffect(() => {
    void loadWorkerStatus();
  }, [loadWorkerStatus]);

  const runPreview = useCallback(
    async (s: AdminScriptListItem) => {
      if (s.key === 'media.diagnose_conversation_avatar') {
        const id = diagConversationId.trim();
        if (!CONVERSATION_UUID_RE.test(id)) {
          toast.error('Informe o ID da conversa (UUID válido).');
          return;
        }
      }
      setPreviewLoading(true);
      try {
        const enc = encodeURIComponent(s.key);
        const res = await apiClient.post<{ runId: string; result: Record<string, unknown> }>(
          `/api/superadmin/advanced/scripts/${enc}/preview`,
          buildAvatarReprocessBody(s),
        );
        if (res.error || !res.data) {
          toast.error(res.error ?? 'Preview falhou.');
          return;
        }
        setPreviewRunId(res.data.runId);
        setPreviewResult(res.data.result);
        void loadScripts();
      } finally {
        setPreviewLoading(false);
      }
    },
    [buildAvatarReprocessBody, loadScripts, diagConversationId],
  );

  const openPreview = (s: AdminScriptListItem) => {
    setPreviewScript(s);
    setPreviewResult(null);
    setPreviewRunId(null);
    setPreviewOpen(true);
    void runPreview(s);
  };

  const openExecute = (s: AdminScriptListItem) => {
    setExecuteScript(s);
    setExecuteAck(false);
    setExecuteOutcome(null);
    setExecuteOpen(true);
  };

  const confirmExecute = async () => {
    if (!executeScript) return;
    if (executeScript.key === 'media.diagnose_conversation_avatar') {
      const id = diagConversationId.trim();
      if (!CONVERSATION_UUID_RE.test(id)) {
        toast.error('Informe o ID da conversa (UUID válido).');
        return;
      }
    }
    const needsMediaAck =
      executeScript.key.startsWith('media.') && executeScript.category !== 'diagnostic';
    if (needsMediaAck && !executeAck) {
      toast.error('Confirme que compreende o impacto nos dados de mídia.');
      return;
    }
    setExecuteLoading(true);
    const enc = encodeURIComponent(executeScript.key);
    const res = await apiClient.post<{ runId: string; result: Record<string, unknown> }>(
      `/api/superadmin/advanced/scripts/${enc}/execute`,
      {
        ...(needsMediaAck
          ? {
              acknowledgeMediaDataChange: true,
              acknowledgeStatement: MEDIA_DATA_ACK_TEXT,
            }
          : {}),
        ...buildAvatarReprocessBody(executeScript),
      },
    );
    setExecuteLoading(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? 'Execução falhou.');
      return;
    }
    setExecuteOutcome(res.data);
    toast.success('Script executado.');
    void loadScripts();
    void loadWorkerStatus();
  };

  const auditAgain = useCallback(() => {
    const audit = scripts.find((x) => x.key === 'media.audit_urls');
    if (!audit) return;
    setPreviewScript(audit);
    setPreviewResult(null);
    setPreviewRunId(null);
    setPreviewOpen(true);
    void runPreview(audit);
  }, [scripts, runPreview]);

  const stripPreviewSample = useMemo(() => {
    if (!previewResult || typeof previewResult !== 'object') return null;
    const sample = previewResult.sample;
    if (!Array.isArray(sample)) return null;
    return sample as Array<{
      table: string;
      field: string;
      id: string;
      currentSummary: string;
      nextSummary: string;
    }>;
  }, [previewResult]);

  const mediaAuditPreview = useMemo(() => {
    if (previewScript?.key !== 'media.audit_urls' || !previewResult || typeof previewResult !== 'object') {
      return null;
    }
    const r = previewResult as {
      summary?: {
        localhost_em_colunas_texto?: number;
        whatsapp_net_em_campos_finais?: number;
        avatar_proxy_persistido?: number;
      };
      hint?: string;
      details?: {
        localhost?: Array<{
          table: string;
          field: string;
          id: string;
          value_preview: string;
          suggested: string | null;
        }>;
        whatsapp_cdn?: Array<{
          table: string;
          field: string;
          id: string;
          value_preview: string;
          note: string;
        }>;
      };
    };
    return {
      summary: r.summary,
      hint: r.hint,
      details: r.details,
      nLocal: r.summary?.localhost_em_colunas_texto ?? 0,
      nWa: r.summary?.whatsapp_net_em_campos_finais ?? 0,
      nProxy: r.summary?.avatar_proxy_persistido ?? 0,
    };
  }, [previewScript?.key, previewResult]);

  const isStripScript = previewScript?.key === 'media.strip_localhost_internal_urls';

  const avatarReprocessPreview = useMemo(() => {
    if (previewScript?.key !== 'media.reprocess_avatar_cache' || !previewResult || typeof previewResult !== 'object') {
      return null;
    }
    const r = previewResult as {
      mediaAvatarFlagEnabled?: boolean;
      warning?: string | null;
      totalCandidates?: number;
      candidatesPreviewed?: number;
      truncatedPreview?: boolean;
      candidates?: Array<{
        tenant_id: string | null;
        conversation_id: string;
        display_name: string;
        avatar_url: string | null;
        avatar_cached_url: string | null;
        avatar_source_url: string | null;
        motives: string[];
        predicted_action: string;
      }>;
      filters?: { tenantId?: string | null; limit?: number };
    };
    return r;
  }, [previewScript?.key, previewResult]);

  const uazapiWebhookReviewPreview = useMemo(() => {
    if (previewScript?.key !== 'uazapi.review_webhooks' || !previewResult || typeof previewResult !== 'object') {
      return null;
    }
    const p = previewResult as {
      summary?: Record<string, unknown>;
      rows?: Array<Record<string, unknown>>;
    };
    return {
      summary: p.summary ?? {},
      rows: Array.isArray(p.rows) ? p.rows : [],
    };
  }, [previewScript?.key, previewResult]);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="h-5 w-5" />
          <span className="text-sm font-medium">Super Admin · Avançado</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Scripts de manutenção</h1>
        <p className="text-muted-foreground text-sm max-w-3xl">
          Apenas scripts pré-aprovados no servidor. Não existe SQL livre. Use sempre o preview antes de alterar dados.
        </p>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">Automação de cache de avatares WhatsApp</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingWorkerStatus}
              onClick={() => void loadWorkerStatus()}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1.5', loadingWorkerStatus && 'animate-spin')} />
              Atualizar estado
            </Button>
          </div>
          <CardDescription>
            Processamento gradual em segundo plano (variáveis de ambiente). Requer{' '}
            <code className="text-xs bg-muted px-1 rounded">MEDIA_AVATAR_WHATSAPP_ENABLED</code> e{' '}
            <code className="text-xs bg-muted px-1 rounded">MEDIA_AVATAR_WHATSAPP_WORKER_ENABLED</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {loadingWorkerStatus && !workerStatus ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> A carregar estado do worker…
            </div>
          ) : workerStatus ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge variant={workerStatus.mediaAvatarWhatsappEnabled ? 'default' : 'secondary'}>
                  MEDIA_AVATAR_WHATSAPP: {workerStatus.mediaAvatarWhatsappEnabled ? 'ligado' : 'desligado'}
                </Badge>
                <Badge variant={workerStatus.workerEnabledEnv ? 'default' : 'secondary'}>
                  Worker: {workerStatus.workerEnabledEnv ? 'ligado' : 'desligado'}
                </Badge>
                {workerStatus.lockBusy && (
                  <Badge variant="outline">Ciclo em execução</Badge>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">Intervalo:</span>{' '}
                  {workerStatus.workerIntervalMinutes} min · Limite/ciclo: {workerStatus.workerLimit} · Falhas máx.:{' '}
                  {workerStatus.workerMaxFailures}
                </div>
                <div>
                  <span className="font-medium text-foreground">Próximo ciclo (estimado):</span>{' '}
                  {formatWhen(workerStatus.nextCycleEstimatedAt)}
                </div>
              </div>
              {workerStatus.state && (
                <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="font-medium text-foreground">Último ciclo</div>
                  <div className="grid gap-1 sm:grid-cols-2 text-xs">
                    <span>Início: {formatWhen(workerStatus.state.last_cycle_started_at)}</span>
                    <span>Fim: {formatWhen(workerStatus.state.last_cycle_finished_at)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <span>Processados: {workerStatus.state.last_cycle_processed}</span>
                    <span>Sucessos: {workerStatus.state.last_cycle_success}</span>
                    <span>Falhas: {workerStatus.state.last_cycle_failed}</span>
                    <span>Omitidos: {workerStatus.state.last_cycle_skipped}</span>
                  </div>
                  <div className="text-xs text-muted-foreground pt-1 border-t space-y-1">
                    <div>
                      Totais acumulados: proc. {workerStatus.state.total_processed} · ok{' '}
                      {workerStatus.state.total_success} · falha {workerStatus.state.total_failed} · skip{' '}
                      {workerStatus.state.total_skipped}
                    </div>
                    <div>Atualizado: {formatWhen(workerStatus.state.updated_at)}</div>
                  </div>
                </div>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!scripts.some((s) => s.key === 'media.reprocess_avatar_cache')}
                onClick={() => {
                  const s = scripts.find((x) => x.key === 'media.reprocess_avatar_cache');
                  if (s) openExecute(s);
                  else toast.error('Script de reprocessamento não encontrado.');
                }}
              >
                <Play className="h-4 w-4 mr-1.5" />
                Executar agora (script manual)
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">Não foi possível carregar o estado do worker.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-base">Mídia — indexação (`media_assets`)</CardTitle>
          <CardDescription>
            Visualização simples dos últimos assets indexados (sem migrar módulos legados).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadRecentAssets()}>
              Atualizar assets
            </Button>
          </div>
          {loadingAssets ? (
            <div className="text-sm text-muted-foreground">A carregar assets…</div>
          ) : recentAssets.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhum asset indexado ainda.</div>
          ) : (
            <ScrollArea className="h-[220px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentAssets.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">{formatWhen(a.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[130px] truncate">{a.tenant_id}</TableCell>
                      <TableCell className="font-mono text-xs">{a.scope}</TableCell>
                      <TableCell className="text-xs">
                        {a.owner_type}
                        {a.owner_id ? `/${a.owner_id}` : ''}
                      </TableCell>
                      <TableCell className="text-xs">{a.size_bytes}</TableCell>
                      <TableCell className="text-xs">{a.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {loadingList ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> A carregar…
        </div>
      ) : (
        <>
          {scriptsDebugEnabled && (
            <Card className="border-dashed border-amber-500/50 bg-amber-500/[0.06]">
              <CardHeader className="py-3 space-y-1">
                <CardTitle className="text-sm">Diagnóstico da API (lista de scripts)</CardTitle>
                <CardDescription className="text-xs leading-snug">
                  Ativar em produção: acrescente{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">?scriptsDebug=1</code> à URL ou{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                    localStorage.setItem(&apos;superadmin_scripts_debug&apos;,&apos;1&apos;)
                  </code>{' '}
                  no consola. Em desenvolvimento este painel aparece sempre.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 font-mono text-[11px] leading-relaxed pb-4">
                <div>
                  <span className="text-muted-foreground">total:</span> {scripts.length}
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">keys:</span>{' '}
                  {scripts.length ? scripts.map((x) => x.key).join(', ') : '—'}
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">categorias (únicas):</span>{' '}
                  {scripts.length ? [...new Set(scripts.map((x) => x.category))].join(', ') : '—'}
                </div>
                <div className="break-all">
                  <span className="text-muted-foreground">Fix/Diagnóstico esperados:</span>{' '}
                  {['media.diagnose_system', 'media.test_storage_roundtrip', 'media.diagnose_conversation_avatar']
                    .filter((k) => scripts.some((s) => s.key === k))
                    .join(', ') || 'nenhum — provável backend/deploy antigo'}
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="border-primary/25 bg-gradient-to-br from-primary/[0.06] to-transparent">
            <CardHeader className="pb-2">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <ListOrdered className="h-5 w-5" />
                </div>
                <div className="space-y-1 min-w-0">
                  <CardTitle className="text-base leading-snug">Qual script usar? (mídia e avatares)</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    Secção <strong className="text-foreground font-medium">Fix / Diagnóstico</strong> abaixo — ordem
                    recomendada em produção quando imagens ou avatares não carregam.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-sm">
              <ol className="list-decimal list-inside space-y-2.5 text-muted-foreground marker:text-primary">
                <li>
                  <span className="text-foreground font-medium">Diagnosticar mídia do sistema</span> — comece aqui:
                  ambiente, pasta no servidor, leitura/escrita, espaço e rota esperada{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-[11px]">/api/media/v1/raw</code>. Apenas preview.
                </li>
                <li>
                  <span className="text-foreground font-medium">Testar escrita/leitura de mídia</span> — confirma gravação
                  real, registo em <code className="rounded bg-muted px-1 py-0.5 text-[11px]">media_assets</code> e GET
                  HTTP interno à URL assinada; remove o ficheiro de teste. Use execute após o passo 1 apontar problema de
                  volume/permissões.
                </li>
                <li>
                  <span className="text-foreground font-medium">Diagnosticar avatar de conversa</span> — quando um{' '}
                  <strong className="text-foreground font-medium">chat específico</strong> está sem foto: indique o UUID
                  da conversa e veja URL (CDN, assinatura, ficheiro em disco).
                </li>
              </ol>
              <p className="text-xs text-muted-foreground border-t pt-3 leading-relaxed">
                Auditoria (URLs localhost, CDN), correções e reprocessamento estão nas outras secções; não substituem o
                diagnóstico técnico acima.
              </p>
            </CardContent>
          </Card>
          <div className="grid gap-4 md:grid-cols-1 xl:grid-cols-2">
            {sortedScripts.map((s, i) => {
              const showCategoryHeading =
                i === 0 || sortedScripts[i - 1]?.category !== s.category;
              const diagStep =
                s.category === 'diagnostic' ? DIAGNOSTIC_SCRIPT_ORDER[s.key] : undefined;
              return (
                <Fragment key={s.key}>
                  {showCategoryHeading && (
                    <div
                      className={cn(
                        'col-span-full',
                        i > 0 && 'pt-3 mt-2 border-t border-border',
                        s.category === 'diagnostic' &&
                          'rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-3 -mx-0 sm:px-4',
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2 gap-y-1">
                        {s.category === 'diagnostic' ? (
                          <Stethoscope className="h-5 w-5 text-primary shrink-0" aria-hidden />
                        ) : null}
                        <h2 className="text-base font-semibold tracking-tight">{categoryLabel(s.category)}</h2>
                      </div>
                      {s.category === 'diagnostic' ? (
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          Ferramentas de investigação (sem reprocessar avatares automaticamente). Os cartões seguem a
                          ordem 1 → 2 → 3 do guia acima.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          {sortedScripts.filter((x) => x.category === s.category).length} script(s)
                        </p>
                      )}
                    </div>
                  )}
                  <Card
                    className={cn(
                      !s.implemented && 'opacity-80',
                      s.category === 'diagnostic' && 'border-primary/15 shadow-sm',
                    )}
                  >
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-lg flex flex-wrap items-center gap-2">
                    {diagStep != null ? (
                      <Badge
                        variant="secondary"
                        className="shrink-0 font-mono text-[10px] uppercase tracking-wide"
                        title="Ordem sugerida na secção Fix / Diagnóstico"
                      >
                        Passo {diagStep}/3
                      </Badge>
                    ) : null}
                    {s.name}
                  </CardTitle>
                  {!s.implemented && (
                    <Badge variant="outline" className="shrink-0">
                      Em breve
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-sm leading-relaxed">{s.description}</CardDescription>
                {s.key === 'media.reprocess_avatar_cache' && (
                  <div className="grid gap-2 pt-2 sm:grid-cols-2 rounded-md border bg-muted/20 p-3 text-xs">
                    <div className="space-y-1">
                      <Label htmlFor={`tenant-${s.key}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Tenant ID (opcional)
                      </Label>
                      <Input
                        id={`tenant-${s.key}`}
                        placeholder="UUID do tenant"
                        value={avatarReprocessTenantId}
                        onChange={(e) => setAvatarReprocessTenantId(e.target.value)}
                        className="h-8 font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`lim-${s.key}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Limite (1–100)
                      </Label>
                      <Input
                        id={`lim-${s.key}`}
                        type="number"
                        min={1}
                        max={100}
                        value={avatarReprocessLimit}
                        onChange={(e) => setAvatarReprocessLimit(e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                )}
                {s.key === 'uazapi.review_webhooks' && (
                  <div className="grid gap-2 pt-2 rounded-md border bg-muted/20 p-3 text-xs">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`uaz-gen-secret-${s.key}`}
                        checked={uazGenerateMissingSecrets}
                        onCheckedChange={(v) => setUazGenerateMissingSecrets(v === true)}
                      />
                      <Label htmlFor={`uaz-gen-secret-${s.key}`} className="cursor-pointer">
                        Gerar secret interno para instâncias sem secret/secret curto durante execute
                      </Label>
                    </div>
                  </div>
                )}
                {s.key === 'media.diagnose_conversation_avatar' && (
                  <div className="grid gap-2 pt-2 rounded-md border bg-muted/20 p-3 text-xs">
                    <Label htmlFor={`conv-${s.key}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      ID da conversa (obrigatório)
                    </Label>
                    <Input
                      id={`conv-${s.key}`}
                      placeholder="UUID da conversa"
                      value={diagConversationId}
                      onChange={(e) => setDiagConversationId(e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                )}
                {s.key === 'media.test_storage_roundtrip' && (
                  <div className="grid gap-2 pt-2 rounded-md border bg-muted/20 p-3 text-xs">
                    <Label htmlFor={`rt-tenant-${s.key}`} className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Tenant ID (opcional — default primeiro tenant)
                    </Label>
                    <Input
                      id={`rt-tenant-${s.key}`}
                      placeholder="UUID do tenant"
                      value={diagRoundtripTenantId}
                      onChange={(e) => setDiagRoundtripTenantId(e.target.value)}
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant={riskVariant(s.risk)}>Risco: {riskLabel(s.risk)}</Badge>
                  <Badge variant="outline">{categoryLabel(s.category)}</Badge>
                  {s.auditOnly && (
                    <Badge variant="secondary" className="font-normal">
                      Só leitura
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <div>
                  <span className="font-medium text-foreground">Última execução (alteração):</span>{' '}
                  {formatWhen(s.lastExecuteAt)}
                </div>
                <div>
                  <span className="font-medium text-foreground">Último preview:</span> {formatWhen(s.lastPreviewAt)}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 border-t pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!s.implemented}
                  onClick={() => openPreview(s)}
                >
                  <Eye className="h-4 w-4 mr-1.5" />
                  Visualizar impacto
                </Button>
                {!s.auditOnly && (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={!s.implemented}
                    onClick={() => openExecute(s)}
                  >
                    <Play className="h-4 w-4 mr-1.5" />
                    {s.key === 'media.reprocess_avatar_cache'
                      ? 'Executar reprocessamento'
                      : s.category === 'repair'
                        ? 'Executar correção'
                        : 'Executar script'}
                  </Button>
                )}
              </CardFooter>
            </Card>
                </Fragment>
              );
            })}
          </div>
        </>
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl w-[min(100%,calc(100vw-1.5rem))] min-w-0 max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{previewScript?.name ?? 'Preview'}</DialogTitle>
            <DialogDescription>
              Simulação registada no servidor{previewRunId ? ` · execução #${previewRunId.slice(0, 8)}…` : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 min-w-0 overflow-x-hidden">
            {previewLoading && (
              <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> A calcular impacto…
              </div>
            )}

            {!previewLoading && previewResult && isStripScript && (
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="font-medium">Total encontrado:</span>{' '}
                  {String((previewResult as { totalFound?: number }).totalFound ?? '—')}
                </div>
                {(previewResult as { jsonProductsLocalhostRowsEstimate?: number }).jsonProductsLocalhostRowsEstimate !=
                  null && (
                  <Alert>
                    <AlertTitle>Produtos (JSON)</AlertTitle>
                    <AlertDescription>
                      Linhas de produto com referências localhost em JSON (estimativa):{' '}
                      <strong>
                        {(previewResult as { jsonProductsLocalhostRowsEstimate: number }).jsonProductsLocalhostRowsEstimate}
                      </strong>
                      . {(previewResult as { jsonNote?: string }).jsonNote}
                    </AlertDescription>
                  </Alert>
                )}
                {stripPreviewSample && stripPreviewSample.length > 0 ? (
                  <ScrollArea className="h-[min(420px,50vh)] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tabela</TableHead>
                          <TableHead>Campo</TableHead>
                          <TableHead>ID</TableHead>
                          <TableHead>Atual (resumo)</TableHead>
                          <TableHead>Novo (resumo)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stripPreviewSample.map((row, i) => (
                          <TableRow key={`${row.table}-${row.field}-${row.id}-${i}`}>
                            <TableCell className="font-mono text-xs">{row.table}</TableCell>
                            <TableCell className="font-mono text-xs">{row.field}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[120px] truncate" title={row.id}>
                              {row.id}
                            </TableCell>
                            <TableCell className="text-xs max-w-[200px] break-all">{row.currentSummary}</TableCell>
                            <TableCell className="text-xs max-w-[200px] break-all">{row.nextSummary}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  !previewLoading && <p className="text-sm text-muted-foreground">Nenhuma alteração prevista.</p>
                )}
                {(previewResult as { truncatedSample?: boolean }).truncatedSample && (
                  <p className="text-xs text-muted-foreground">Amostra truncada — existem mais registos.</p>
                )}
              </div>
            )}

            {!previewLoading && avatarReprocessPreview && (
              <div className="space-y-4 pr-1">
                {avatarReprocessPreview.mediaAvatarFlagEnabled === false && (
                  <Alert variant="destructive">
                    <AlertTitle>MEDIA_AVATAR_WHATSAPP_ENABLED desligado</AlertTitle>
                    <AlertDescription>
                      {avatarReprocessPreview.warning ??
                        'Ative a flag em staging antes de executar o reprocessamento com MediaService.'}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="text-sm space-y-1 rounded-md border bg-muted/30 p-3">
                  <div>
                    <span className="font-medium">Candidatos (total):</span>{' '}
                    {avatarReprocessPreview.totalCandidates ?? '—'}
                  </div>
                  <div>
                    <span className="font-medium">Nesta pré-visualização:</span>{' '}
                    {avatarReprocessPreview.candidatesPreviewed ?? 0}
                  </div>
                  {avatarReprocessPreview.filters?.tenantId && (
                    <div className="font-mono text-xs">
                      Filtro tenant: {avatarReprocessPreview.filters.tenantId}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Limite do lote: {avatarReprocessPreview.filters?.limit ?? '—'} · máx. 100 na execução · pré-visualização
                    até 20 linhas
                  </div>
                </div>
                {avatarReprocessPreview.candidates && avatarReprocessPreview.candidates.length > 0 ? (
                  <ScrollArea className="h-[min(420px,50vh)] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tenant</TableHead>
                          <TableHead>Conversa</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>avatar_url</TableHead>
                          <TableHead>avatar_cached_url</TableHead>
                          <TableHead>avatar_source_url</TableHead>
                          <TableHead>Motivos</TableHead>
                          <TableHead>Ação prevista</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {avatarReprocessPreview.candidates.map((row) => (
                          <TableRow key={row.conversation_id}>
                            <TableCell className="font-mono text-[10px] max-w-[100px] truncate align-top">
                              {row.tenant_id ?? '—'}
                            </TableCell>
                            <TableCell className="font-mono text-[10px] max-w-[90px] truncate align-top" title={row.conversation_id}>
                              {row.conversation_id}
                            </TableCell>
                            <TableCell className="text-xs align-top">{row.display_name}</TableCell>
                            <TableCell className="text-[10px] align-top max-w-[120px] break-all" title={row.avatar_url ?? ''}>
                              {row.avatar_url ? `${row.avatar_url.slice(0, 64)}${row.avatar_url.length > 64 ? '…' : ''}` : '—'}
                            </TableCell>
                            <TableCell className="text-[10px] align-top max-w-[120px] break-all" title={row.avatar_cached_url ?? ''}>
                              {row.avatar_cached_url
                                ? `${row.avatar_cached_url.slice(0, 64)}${row.avatar_cached_url.length > 64 ? '…' : ''}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-[10px] align-top max-w-[120px] break-all" title={row.avatar_source_url ?? ''}>
                              {row.avatar_source_url
                                ? `${row.avatar_source_url.slice(0, 64)}${row.avatar_source_url.length > 64 ? '…' : ''}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-[11px] align-top">
                              <ul className="list-disc pl-3 space-y-0.5">
                                {row.motives.map((m, mi) => (
                                  <li key={`${row.conversation_id}-m-${mi}`}>{m}</li>
                                ))}
                              </ul>
                            </TableCell>
                            <TableCell className="text-[11px] align-top max-w-[200px]">{row.predicted_action}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhuma conversa candidata com os filtros atuais.</p>
                )}
                {avatarReprocessPreview.truncatedPreview && (
                  <p className="text-xs text-muted-foreground">
                    Existem mais candidatos do que os mostrados — ajuste filtros ou aumente o limite na execução (até 100).
                  </p>
                )}
              </div>
            )}

            {!previewLoading && uazapiWebhookReviewPreview && (
              <div className="space-y-4 pr-1">
                <div className="text-sm space-y-1.5 rounded-md border bg-muted/30 p-3">
                  {Object.entries(uazapiWebhookReviewPreview.summary).map(([k, v]) => (
                    <div key={k}>
                      <span className="font-medium">{k}:</span> {String(v)}
                    </div>
                  ))}
                </div>
                <ScrollArea className="h-[min(420px,52vh)] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>tenant</TableHead>
                        <TableHead>instance_id</TableHead>
                        <TableHead>nome</TableHead>
                        <TableHead>telefone</TableHead>
                        <TableHead>status</TableHead>
                        <TableHead>has_secret</TableHead>
                        <TableHead>secret_len</TableHead>
                        <TableHead>webhook_url_status</TableHead>
                        <TableHead>needs_reconfiguration</TableHead>
                        <TableHead>last_seen_at</TableHead>
                        <TableHead>ação sugerida</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uazapiWebhookReviewPreview.rows.map((row, idx) => (
                        <TableRow key={`uazapi-review-${idx}`}>
                          <TableCell className="text-xs">{String(row.tenant ?? '—')}</TableCell>
                          <TableCell className="font-mono text-[11px]">{String(row.instance_id ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.nome ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.telefone ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.status ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.has_secret ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.secret_len ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.webhook_url_status ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.needs_reconfiguration ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.last_seen_at ?? '—')}</TableCell>
                          <TableCell className="text-xs">{String(row.suggested_action ?? '—')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {!previewLoading && mediaAuditPreview && (
              <div className="space-y-4 pr-1">
                <div className="text-sm space-y-1.5 rounded-md border bg-muted/30 p-3">
                  <div>
                    <span className="font-medium">localhost (colunas texto):</span>{' '}
                    {mediaAuditPreview.nLocal}
                  </div>
                  <div>
                    <span className="font-medium">WhatsApp net (campos finais):</span>{' '}
                    {mediaAuditPreview.nWa}
                  </div>
                  <div>
                    <span className="font-medium">Avatar proxy persistido:</span>{' '}
                    {mediaAuditPreview.nProxy}
                  </div>
                </div>

                {mediaAuditPreview.hint && (
                  <Alert>
                    <AlertTitle>Leitura</AlertTitle>
                    <AlertDescription>{mediaAuditPreview.hint}</AlertDescription>
                  </Alert>
                )}

                {mediaAuditPreview.nLocal > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Registos com localhost detectados</h3>
                    {mediaAuditPreview.details?.localhost && mediaAuditPreview.details.localhost.length > 0 ? (
                      <ScrollArea className="h-[min(320px,42vh)] rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tabela</TableHead>
                              <TableHead>Campo</TableHead>
                              <TableHead>ID</TableHead>
                              <TableHead>Valor atual (resumido)</TableHead>
                              <TableHead>Valor corrigido (resumido)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mediaAuditPreview.details.localhost.map((row, i) => (
                              <TableRow key={`loc-${row.table}-${row.field}-${row.id}-${i}`}>
                                <TableCell className="font-mono text-xs align-top">{row.table}</TableCell>
                                <TableCell className="font-mono text-xs align-top">{row.field}</TableCell>
                                <TableCell
                                  className="font-mono text-xs max-w-[100px] break-all align-top"
                                  title={row.id}
                                >
                                  {row.id}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] break-all align-top">
                                  {row.value_preview}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] break-all text-muted-foreground align-top">
                                  {row.suggested ?? '—'}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum registo na amostra (total acima indica ocorrências noutros contextos, p.ex. JSON).
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Amostra: até 20 registos. Valores truncados no servidor.</p>
                  </div>
                )}

                {mediaAuditPreview.nWa > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Registos com CDN WhatsApp</h3>
                    {mediaAuditPreview.details?.whatsapp_cdn && mediaAuditPreview.details.whatsapp_cdn.length > 0 ? (
                      <ScrollArea className="h-[min(320px,42vh)] rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tabela</TableHead>
                              <TableHead>Campo</TableHead>
                              <TableHead>ID</TableHead>
                              <TableHead>Valor atual (resumido)</TableHead>
                              <TableHead>Nota</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {mediaAuditPreview.details.whatsapp_cdn.map((row, i) => (
                              <TableRow key={`wa-${row.table}-${row.field}-${row.id}-${i}`}>
                                <TableCell className="font-mono text-xs align-top">{row.table}</TableCell>
                                <TableCell className="font-mono text-xs align-top">{row.field}</TableCell>
                                <TableCell
                                  className="font-mono text-xs max-w-[100px] break-all align-top"
                                  title={row.id}
                                >
                                  {row.id}
                                </TableCell>
                                <TableCell className="text-xs max-w-[200px] break-all align-top">
                                  {row.value_preview}
                                </TableCell>
                                <TableCell className="text-xs text-muted-foreground align-top">{row.note}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Nenhum registo na amostra (total acima pode incluir linhas não devolvidas neste lote).
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">Amostra: até 20 registos.</p>
                  </div>
                )}

                <details className="text-xs border rounded-md p-2 bg-muted/20">
                  <summary className="cursor-pointer font-medium text-muted-foreground select-none">
                    Resposta técnica (JSON)
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-all overflow-auto max-h-48 max-w-full font-mono text-[11px] leading-snug">
                    {JSON.stringify(previewResult, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            {!previewLoading &&
              previewScript?.category === 'diagnostic' &&
              previewResult &&
              typeof previewResult === 'object' && (
                <div className="space-y-3 pr-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Estado geral</span>
                    {overallStatusBadge((previewResult as Record<string, unknown>).overall_status)}
                  </div>
                  <DiagnosticSectionsDisplay result={previewResult as Record<string, unknown>} />
                  {(previewResult as Record<string, unknown>).hint != null &&
                    typeof (previewResult as Record<string, unknown>).hint === 'string' && (
                      <Alert>
                        <AlertTitle>Nota</AlertTitle>
                        <AlertDescription>
                          {(previewResult as Record<string, unknown>).hint as string}
                        </AlertDescription>
                      </Alert>
                    )}
                  <details className="text-xs border rounded-md p-2 bg-muted/20">
                    <summary className="cursor-pointer font-medium text-muted-foreground select-none">
                      JSON técnico
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all overflow-auto max-h-48 max-w-full font-mono text-[11px] leading-snug">
                      {JSON.stringify(previewResult, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

            {!previewLoading &&
              previewResult &&
              previewScript &&
              previewScript.key !== 'media.strip_localhost_internal_urls' &&
              previewScript.key !== 'media.audit_urls' &&
              previewScript.key !== 'media.reprocess_avatar_cache' &&
              previewScript.key !== 'uazapi.review_webhooks' &&
              previewScript.category !== 'diagnostic' && (
                <ScrollArea className="max-h-[min(480px,55vh)] min-w-0 max-w-full">
                  <pre className="text-xs bg-muted/50 rounded-md p-3 whitespace-pre-wrap break-all max-w-full font-mono leading-snug">
                    {JSON.stringify(previewResult, null, 2)}
                  </pre>
                </ScrollArea>
              )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => void loadScripts()}>
              Atualizar lista
            </Button>
            <Button type="button" onClick={() => setPreviewOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={executeOpen}
        onOpenChange={(open) => {
          setExecuteOpen(open);
          if (!open) {
            setExecuteOutcome(null);
            setExecuteAck(false);
            setExecuteScript(null);
          }
        }}
      >
        <AlertDialogContent className="flex max-h-[min(90vh,720px)] w-[min(100%,calc(100vw-1.5rem))] max-w-lg min-w-0 flex-col gap-4 overflow-y-auto sm:max-w-xl">
          <AlertDialogHeader className="min-w-0 shrink-0 text-left">
            <AlertDialogTitle className="break-words pr-6">
              Executar {executeScript?.name ?? 'script'}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              {executeScript?.category === 'diagnostic'
                ? 'Diagnóstico: sem reprocessar avatares. O teste de round-trip grava e remove um PNG mínimo; os outros scripts só leem evidências.'
                : 'Esta operação altera dados na base de dados. Confirme apenas após rever o preview.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {!executeOutcome &&
            executeScript?.key.startsWith('media.') &&
            executeScript.category !== 'diagnostic' && (
            <div className="flex min-w-0 items-start gap-3 py-2">
              <Checkbox
                id="ack-media"
                checked={executeAck}
                onCheckedChange={(v) => setExecuteAck(v === true)}
              />
              <div className="grid gap-1.5 leading-snug">
                <Label htmlFor="ack-media" className="font-normal cursor-pointer">
                  {MEDIA_DATA_ACK_TEXT}
                </Label>
              </div>
            </div>
          )}

          {executeOutcome && (
            <div className="min-w-0 max-w-full space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="min-w-0 break-all font-mono text-xs">
                <span className="font-medium font-sans text-sm">Run:</span> {executeOutcome.runId}
              </div>
              {executeScript?.category === 'diagnostic' &&
              executeOutcome.result &&
              typeof executeOutcome.result === 'object' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">Estado geral</span>
                    {overallStatusBadge((executeOutcome.result as Record<string, unknown>).overall_status)}
                  </div>
                  <DiagnosticSectionsDisplay result={executeOutcome.result as Record<string, unknown>} />
                  <details className="text-xs border rounded-md p-2 bg-muted/20">
                    <summary className="cursor-pointer font-medium text-muted-foreground select-none">
                      JSON técnico
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-all overflow-auto max-h-48 font-mono text-[11px]">
                      {JSON.stringify(executeOutcome.result, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : (
              <div className="min-h-0 min-w-0 max-w-full overflow-hidden rounded-md border border-border/60 bg-muted/50">
                <pre className="m-0 max-h-52 max-w-full overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(executeOutcome.result, null, 2)}
                </pre>
              </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-1 w-full shrink-0"
                type="button"
                onClick={() => auditAgain()}
              >
                Rodar auditoria novamente
              </Button>
            </div>
          )}

          <AlertDialogFooter className="min-w-0 shrink-0 gap-2 sm:gap-2">
            {executeOutcome ? (
              <AlertDialogAction type="button" onClick={() => setExecuteOpen(false)}>
                Fechar
              </AlertDialogAction>
            ) : (
              <>
                <AlertDialogCancel disabled={executeLoading}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  disabled={
                    executeLoading ||
                    (executeScript?.key.startsWith('media.') &&
                    executeScript.category !== 'diagnostic'
                      ? !executeAck
                      : false)
                  }
                  onClick={(e) => {
                    e.preventDefault();
                    void confirmExecute();
                  }}
                >
                  {executeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2 inline" /> A executar…
                    </>
                  ) : (
                    'Confirmar execução'
                  )}
                </AlertDialogAction>
              </>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
