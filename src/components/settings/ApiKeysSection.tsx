import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Copy, KeyRound, Loader2 } from 'lucide-react';
import { PageContentSkeleton } from '@/components/PageContentSkeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { toast } from '@/components/ui/sonner';
import {
  API_KEYS_QUERY_KEY,
  createTenantApiKey,
  revokeTenantApiKey,
  type TenantApiKey,
} from '@/services/tenantApiKeys';
import { buildPublicLeadCurl, publicApiOrigin } from './apiKeysCurl';
import { useApiKeysAccess } from './useApiKeysAccess';

function formatWhen(iso: string | null, language: string, emptyLabel: string): string {
  if (!iso) return emptyLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return new Intl.DateTimeFormat(language, { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function ApiKeysSection() {
  const { t, i18n } = useTranslation('settings');
  const access = useApiKeysAccess();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState<string | null>(null);
  const [secretOpen, setSecretOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TenantApiKey | null>(null);

  const createMutation = useMutation({
    mutationFn: createTenantApiKey,
    onSuccess: async (created) => {
      setSecret(created.key);
      setSecretOpen(true);
      setName('');
      await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message || t('api_keys_create_error')),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeTenantApiKey,
    onSuccess: async () => {
      setRevokeTarget(null);
      toast.success(t('api_keys_revoked_toast'));
      await queryClient.invalidateQueries({ queryKey: API_KEYS_QUERY_KEY });
    },
    onError: (error: Error) => toast.error(error.message || t('api_keys_revoke_error')),
  });

  if (access.checking) return <PageContentSkeleton />;
  if (!access.isAdmin || access.flagOff) return <Navigate to="/settings" replace />;
  if (access.failed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('sec_apiKeys')}</CardTitle>
          <CardDescription>{access.query.error instanceof Error ? access.query.error.message : t('api_keys_load_error')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={() => void access.query.refetch()}>
            {t('api_keys_retry')}
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (!access.visible) return <PageContentSkeleton />;

  const keys = access.query.data ?? [];
  const curl = buildPublicLeadCurl(publicApiOrigin());
  const never = t('api_keys_never');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" aria-hidden />
            {t('sec_apiKeys')}
          </CardTitle>
          <CardDescription>{t('api_keys_intro')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (!trimmed || createMutation.isPending) return;
              createMutation.mutate(trimmed);
            }}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="api-key-name">{t('api_keys_name')}</Label>
              <Input
                id="api-key-name"
                value={name}
                maxLength={80}
                placeholder={t('api_keys_name_placeholder')}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
            </div>
            <Button type="submit" disabled={!name.trim() || createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('api_keys_create')}
            </Button>
          </form>

          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('api_keys_empty')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {keys.map((item) => {
                const revoked = item.revoked_at != null;
                return (
                  <li key={item.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{item.name}</span>
                        <Badge variant={revoked ? 'secondary' : 'default'}>
                          {revoked ? t('api_keys_revoked') : t('api_keys_active')}
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{item.key_prefix}…</p>
                      <p className="text-xs text-muted-foreground">
                        {t('api_keys_created')}: {formatWhen(item.created_at, i18n.language, never)}
                        {' · '}
                        {t('api_keys_last_used')}: {formatWhen(item.last_used_at, i18n.language, never)}
                      </p>
                    </div>
                    {revoked ? null : (
                      <Button type="button" variant="outline" onClick={() => setRevokeTarget(item)}>
                        {t('api_keys_revoke')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('api_keys_curl_title')}</CardTitle>
          <CardDescription>{t('api_keys_curl_hint')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed text-foreground">{curl}</pre>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void copyText(curl).then((ok) => {
                if (ok) toast.success(t('api_keys_copied'));
                else toast.error(t('api_keys_copy_error'));
              });
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            {t('api_keys_copy_curl')}
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={secretOpen}
        onOpenChange={(open) => {
          setSecretOpen(open);
          if (!open) setSecret(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('api_keys_secret_title')}</DialogTitle>
            <DialogDescription>{t('api_keys_secret_warning')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="api-key-secret">{t('api_keys_secret_label')}</Label>
            <Input id="api-key-secret" readOnly value={secret ?? ''} className="font-mono" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (!secret) return;
                void copyText(secret).then((ok) => {
                  if (ok) toast.success(t('api_keys_copied'));
                  else toast.error(t('api_keys_copy_error'));
                });
              }}
            >
              <Copy className="mr-2 h-4 w-4" />
              {t('api_keys_copy')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setSecretOpen(false)}>
              {t('api_keys_done')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={revokeTarget != null} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('api_keys_revoke_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('api_keys_revoke_body', { name: revokeTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>{t('api_keys_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokeMutation.isPending || !revokeTarget}
              onClick={(event) => {
                event.preventDefault();
                if (!revokeTarget) return;
                revokeMutation.mutate(revokeTarget.id);
              }}
            >
              {t('api_keys_revoke_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
