import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PlatformFeatureFlagRow = {
  key: string;
  namespace: string;
  description: string;
  default_enabled: boolean;
  shadow_mode: boolean;
  rollout_type: 'off' | 'internal' | 'allowlist' | 'percent' | 'global';
  rollout_percent: number;
  kill_switch_key: string | null;
  updated_at?: string;
};

type ListResponse = {
  ok: boolean;
  flags: PlatformFeatureFlagRow[];
  cache?: { hits: number; misses: number; size: number };
  error?: string;
};

type PatchResponse = {
  ok: boolean;
  flag?: PlatformFeatureFlagRow;
  cache?: { hits: number; misses: number; size: number };
  error?: string;
};

const NAMESPACE_ORDER = [
  'acquisition',
  'workflow',
  'communication',
  'outbox',
  'worker',
  'onboarding',
  'meta_readiness',
  'platform',
  'billing_recovery',
] as const;

function formatWhen(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

function isCriticalFlag(flag: PlatformFeatureFlagRow): boolean {
  if (flag.key.endsWith('.master_off')) return true;
  if (flag.key.startsWith('billing.')) return true;
  if (flag.namespace === 'outbox') return true;
  if (flag.namespace === 'workflow') return true;
  if (flag.namespace === 'communication') return true;
  if (flag.namespace === 'billing_recovery') return true;
  return false;
}

export default function SuperAdminAdvancedFeatureFlagsPage() {
  const [flags, setFlags] = useState<PlatformFeatureFlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheStats, setCacheStats] = useState<{ hits: number; misses: number; size: number } | null>(null);

  const [q, setQ] = useState('');
  const [namespace, setNamespace] = useState<string>('all');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [shadowFilter, setShadowFilter] = useState<'all' | 'shadow_on' | 'shadow_off'>('all');

  const flagsByKey = useMemo(() => new Map(flags.map((f) => [f.key, f])), [flags]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ListResponse>('/api/superadmin/advanced/feature-flags');
    if (res.error) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    if (!res.data?.ok) {
      toast.error(res.data?.error || 'Falha ao carregar flags');
      setLoading(false);
      return;
    }
    setFlags(res.data.flags || []);
    setCacheStats(res.data.cache ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const namespaces = useMemo(() => {
    const set = new Set<string>();
    for (const f of flags) set.add(f.namespace);
    const fromData = [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const ordered: string[] = [];
    for (const n of NAMESPACE_ORDER) if (set.has(n)) ordered.push(n);
    for (const n of fromData) if (!ordered.includes(n)) ordered.push(n);
    return ordered;
  }, [flags]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return flags.filter((f) => {
      if (namespace !== 'all' && f.namespace !== namespace) return false;
      if (enabledFilter === 'enabled' && !f.default_enabled) return false;
      if (enabledFilter === 'disabled' && f.default_enabled) return false;
      if (shadowFilter === 'shadow_on' && !f.shadow_mode) return false;
      if (shadowFilter === 'shadow_off' && f.shadow_mode) return false;
      if (!qq) return true;
      return (
        f.key.toLowerCase().includes(qq) ||
        f.namespace.toLowerCase().includes(qq) ||
        (f.description || '').toLowerCase().includes(qq) ||
        (f.kill_switch_key || '').toLowerCase().includes(qq)
      );
    });
  }, [flags, q, namespace, enabledFilter, shadowFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, PlatformFeatureFlagRow[]>();
    for (const f of filtered) {
      const arr = map.get(f.namespace) ?? [];
      arr.push(f);
      map.set(f.namespace, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.key.localeCompare(b.key, 'pt-BR'));
    }
    return map;
  }, [filtered]);

  const patchFlag = useCallback(
    async (key: string, patch: Partial<Pick<PlatformFeatureFlagRow, 'default_enabled' | 'shadow_mode' | 'rollout_percent'>>) => {
      const enc = encodeURIComponent(key);
      const res = await apiClient.patch<PatchResponse>(`/api/superadmin/advanced/feature-flags/${enc}`, patch);
      if (res.error) {
        toast.error(res.error);
        return null;
      }
      if (!res.data?.ok || !res.data.flag) {
        toast.error(res.data?.error || 'Falha ao atualizar flag');
        return null;
      }
      setFlags((prev) => prev.map((f) => (f.key === key ? res.data!.flag! : f)));
      setCacheStats(res.data.cache ?? null);
      return res.data.flag;
    },
    [],
  );

  return (
    <div className="space-y-4">
      <Card className="border-border/60 bg-card/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Feature Flags</span>
            {cacheStats ? (
              <span className="text-xs font-normal text-muted-foreground">
                cache: {cacheStats.size} flags · hits {cacheStats.hits} · misses {cacheStats.misses}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            Gestão operacional do registry <span className="font-mono">platform_feature_flags</span> (sem restart).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por key, descrição, namespace, kill switch..."
            />
          </div>
          <Select value={namespace} onValueChange={setNamespace}>
            <SelectTrigger>
              <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos namespaces</SelectItem>
              {namespaces.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}.*
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select value={enabledFilter} onValueChange={(v) => setEnabledFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Enabled" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Enabled: todos</SelectItem>
                <SelectItem value="enabled">Enabled: ON</SelectItem>
                <SelectItem value="disabled">Enabled: OFF</SelectItem>
              </SelectContent>
            </Select>
            <Select value={shadowFilter} onValueChange={(v) => setShadowFilter(v as any)}>
              <SelectTrigger>
                <SelectValue placeholder="Shadow" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Shadow: todos</SelectItem>
                <SelectItem value="shadow_on">Shadow: ON</SelectItem>
                <SelectItem value="shadow_off">Shadow: OFF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="rounded-xl border border-border/60 bg-card/50 p-6 text-sm text-muted-foreground">
          Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-card/50 p-6 text-sm text-muted-foreground">
          Nenhuma flag encontrada.
        </div>
      ) : (
        [...grouped.entries()]
          .sort((a, b) => {
            const ia = NAMESPACE_ORDER.indexOf(a[0] as any);
            const ib = NAMESPACE_ORDER.indexOf(b[0] as any);
            if (ia >= 0 && ib >= 0) return ia - ib;
            if (ia >= 0) return -1;
            if (ib >= 0) return 1;
            return a[0].localeCompare(b[0], 'pt-BR');
          })
          .map(([ns, items]) => (
            <Card key={ns} className="border-border/60 bg-card/70 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <span className="font-mono text-sm">{ns}.*</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[340px]">Key</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-[120px] text-center">Enabled</TableHead>
                      <TableHead className="w-[120px] text-center">Shadow</TableHead>
                      <TableHead className="w-[140px] text-center">Rollout %</TableHead>
                      <TableHead className="w-[200px]">Kill switch</TableHead>
                      <TableHead className="w-[170px]">Atualizado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((f) => {
                      const kill = f.kill_switch_key ? flagsByKey.get(f.kill_switch_key) : null;
                      const killActive = kill?.default_enabled === true;
                      const critical = isCriticalFlag(f);
                      const killMissing = !!f.kill_switch_key && !kill;
                      return (
                        <TableRow key={f.key} className={critical ? 'bg-amber-500/5' : undefined}>
                          <TableCell className="align-top">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono text-[12px]">{f.key}</span>
                                {critical ? (
                                  <Badge
                                    variant="outline"
                                    className="border-amber-500/40 bg-amber-500/10 text-[10px] font-semibold text-amber-800 dark:text-amber-200"
                                  >
                                    CRÍTICA
                                  </Badge>
                                ) : null}
                                {f.key.endsWith('.master_off') ? (
                                  <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-[10px] font-semibold text-destructive">
                                    KILL SWITCH
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                <span className="font-mono">{f.rollout_type}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm">{f.description || '—'}</div>
                          </TableCell>
                          <TableCell className="align-top text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Switch
                                checked={f.default_enabled}
                                onCheckedChange={async (checked) => {
                                  const prev = f.default_enabled;
                                  setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, default_enabled: checked } : x)));
                                  const updated = await patchFlag(f.key, { default_enabled: checked });
                                  if (!updated) {
                                    setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, default_enabled: prev } : x)));
                                    return;
                                  }
                                  toast.success('Flag atualizada (enabled)');
                                }}
                              />
                              <Badge variant={f.default_enabled ? 'default' : 'secondary'} className="text-[10px]">
                                {f.default_enabled ? 'ON' : 'OFF'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-center">
                            <div className="flex flex-col items-center gap-2">
                              <Switch
                                checked={f.shadow_mode}
                                onCheckedChange={async (checked) => {
                                  const prev = f.shadow_mode;
                                  setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, shadow_mode: checked } : x)));
                                  const updated = await patchFlag(f.key, { shadow_mode: checked });
                                  if (!updated) {
                                    setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, shadow_mode: prev } : x)));
                                    return;
                                  }
                                  toast.success('Flag atualizada (shadow)');
                                }}
                              />
                              <Badge variant={f.shadow_mode ? 'outline' : 'secondary'} className="text-[10px]">
                                {f.shadow_mode ? 'SHADOW' : '—'}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-center">
                            <RolloutPercentCell
                              value={f.rollout_percent}
                              disabled={false}
                              onCommit={async (next) => {
                                const prev = f.rollout_percent;
                                setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, rollout_percent: next } : x)));
                                const updated = await patchFlag(f.key, { rollout_percent: next });
                                if (!updated) {
                                  setFlags((p) => p.map((x) => (x.key === f.key ? { ...x, rollout_percent: prev } : x)));
                                  return;
                                }
                                toast.success('Flag atualizada (rollout %)');
                              }}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            {f.kill_switch_key ? (
                              <div className="space-y-1">
                                <div className="font-mono text-[11px]">{f.kill_switch_key}</div>
                                {killMissing ? (
                                  <Badge variant="outline" className="border-destructive/35 bg-destructive/10 text-[10px] font-semibold text-destructive">
                                    NÃO ENCONTRADA
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className={
                                      killActive
                                        ? 'border-destructive/35 bg-destructive/10 text-[10px] font-semibold text-destructive'
                                        : 'border-emerald-500/35 bg-emerald-500/10 text-[10px] font-semibold text-emerald-700 dark:text-emerald-200'
                                    }
                                  >
                                    {killActive ? 'ATIVA (bloqueando)' : 'inativa'}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <span className="text-xs text-muted-foreground">{formatWhen(f.updated_at)}</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
      )}
    </div>
  );
}

function RolloutPercentCell({
  value,
  disabled,
  onCommit,
}: {
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void | Promise<void>;
}) {
  const [v, setV] = useState(String(value ?? 0));

  useEffect(() => {
    setV(String(value ?? 0));
  }, [value]);

  const commit = async () => {
    const n = Number(v);
    if (!Number.isFinite(n) || Number.isNaN(n)) {
      toast.error('Rollout % inválido');
      setV(String(value ?? 0));
      return;
    }
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    setV(String(clamped));
    if (clamped !== value) await onCommit(clamped);
  };

  return (
    <div className="flex items-center justify-center">
      <Input
        value={v}
        disabled={disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setV(String(value ?? 0));
          }
        }}
        className="h-9 w-[92px] text-center font-mono text-[12px]"
      />
    </div>
  );
}

