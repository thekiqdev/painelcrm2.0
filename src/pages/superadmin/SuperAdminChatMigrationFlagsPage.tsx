import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/integrations/api/client';
import { toast } from '@/components/ui/sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CHAT_MIGRATION_FLAG_GROUPS,
  createDefaultChatMigrationFlags,
  type ChatMigrationFlagKey,
  type ChatMigrationFlagsMap,
} from '@/lib/chatMigrationFlags/catalog';
import {
  applyChatMigrationFlagPatch,
  refreshChatMigrationFlagsFromServer,
} from '@/lib/chatMigrationFlagManager';
import { ArrowLeft, MessageCircle, RefreshCw } from 'lucide-react';

type ApiResponse = {
  ok: boolean;
  flags?: Partial<ChatMigrationFlagsMap>;
  updated_at?: string | null;
  error?: string;
};

type PatchResponse = {
  ok: boolean;
  key?: ChatMigrationFlagKey;
  enabled?: boolean;
  flags?: ChatMigrationFlagsMap;
  error?: string;
};

function formatWhen(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

/** Badge visual do estado da flag — não altera lógica de ativação. */
function ChatMigrationFlagStatusBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <Badge
        variant="outline"
        className="shrink-0 min-w-[4.5rem] justify-center border-emerald-500/45 bg-emerald-500/15 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
      >
        Novo
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className="shrink-0 min-w-[4.5rem] justify-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
    >
      Legado
    </Badge>
  );
}

export default function SuperAdminChatMigrationFlagsPage() {
  const [flags, setFlags] = useState<ChatMigrationFlagsMap>(createDefaultChatMigrationFlags());
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<ChatMigrationFlagKey | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const enabledCount = useMemo(
    () => Object.values(flags).filter(Boolean).length,
    [flags],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiClient.get<ApiResponse>('/api/superadmin/advanced/chat-migration-flags');
    if (res.error || !res.data?.ok) {
      toast.error(res.error ?? res.data?.error ?? 'Falha ao carregar flags do Chat');
      setLoading(false);
      return;
    }
    const next = createDefaultChatMigrationFlags();
    if (res.data.flags) {
      for (const group of CHAT_MIGRATION_FLAG_GROUPS) {
        for (const def of group.flags) {
          if (typeof res.data.flags[def.key] === 'boolean') {
            next[def.key] = res.data.flags[def.key]!;
          }
        }
      }
    }
    setFlags(next);
    setUpdatedAt(res.data.updated_at ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchFlag = async (key: ChatMigrationFlagKey, enabled: boolean) => {
    const previous = flags[key];
    setSavingKey(key);
    setFlags((current) => ({ ...current, [key]: enabled }));
    applyChatMigrationFlagPatch(key, enabled);

    const res = await apiClient.patch<PatchResponse>(
      `/api/superadmin/advanced/chat-migration-flags/${encodeURIComponent(key)}`,
      { enabled },
    );

    setSavingKey(null);

    if (res.error || !res.data?.ok) {
      setFlags((current) => ({ ...current, [key]: previous }));
      applyChatMigrationFlagPatch(key, previous);
      toast.error(res.error ?? res.data?.error ?? 'Não foi possível guardar a flag');
      return;
    }

    if (res.data.flags) {
      setFlags(res.data.flags);
      for (const [k, v] of Object.entries(res.data.flags)) {
        applyChatMigrationFlagPatch(k as ChatMigrationFlagKey, v);
      }
    }
    setUpdatedAt(new Date().toISOString());
    toast.success(`${key} ${enabled ? 'ativada' : 'desativada'}`);
    void refreshChatMigrationFlagsFromServer();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" asChild>
            <Link to="/superadmin/avancado/feature-flags">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Feature Flags
            </Link>
          </Button>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <MessageCircle className="h-7 w-7" />
            Otimização do Chat
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Controle exclusivo das Feature Flags da migração arquitetural do Chat (F1–F4). Alterações
            aplicam-se em toda a plataforma e substituem variáveis de ambiente para estas flags.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{enabledCount} ativa(s)</Badge>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Fonte de verdade</CardTitle>
          <CardDescription>
            Última atualização: {formatWhen(updatedAt)}. Rollback imediato desligando o switch
            correspondente.
          </CardDescription>
        </CardHeader>
      </Card>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar flags…</p>
      ) : (
        CHAT_MIGRATION_FLAG_GROUPS.map((group) => (
          <Card key={group.id} className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">{group.title}</CardTitle>
              <CardDescription>{group.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {group.flags.map((def, index) => (
                <div key={def.key}>
                  {index > 0 ? <Separator className="mb-4" /> : null}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <Label htmlFor={def.key} className="text-base font-medium">
                        {def.label}
                      </Label>
                      <p className="text-sm text-muted-foreground">{def.description}</p>
                      <code className="text-xs text-muted-foreground">{def.key}</code>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <ChatMigrationFlagStatusBadge enabled={flags[def.key]} />
                      <Switch
                        id={def.key}
                        checked={flags[def.key]}
                        disabled={savingKey === def.key}
                        onCheckedChange={(checked) => void patchFlag(def.key, checked)}
                        aria-label={`${def.label}: ${flags[def.key] ? 'Novo' : 'Legado'}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
