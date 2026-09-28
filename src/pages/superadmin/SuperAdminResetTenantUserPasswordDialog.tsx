import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/sonner';
import { resetSuperadminCompanyUserPassword } from '@/services/superadminCompanyUsers';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  userLabel?: string;
};

export function SuperAdminResetTenantUserPasswordDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  userLabel,
}: Props) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setPassword('');
      setConfirm('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    if (password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('A confirmação da senha não coincide.');
      return;
    }
    setSaving(true);
    const res = await resetSuperadminCompanyUserPassword(tenantId, userId, password, confirm);
    setSaving(false);
    if (res.error || !res.data?.ok) {
      toast.error(res.data?.error ?? res.error ?? 'Erro ao redefinir senha');
      return;
    }
    toast.success('Senha redefinida. Sessões ativas foram encerradas.');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Redefinir senha</DialogTitle>
          <DialogDescription>
            {userLabel
              ? `Nova senha para ${userLabel}. O usuário precisará entrar novamente.`
              : 'Defina uma nova senha para o usuário.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sa-new-password">Nova senha</Label>
            <Input
              id="sa-new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sa-confirm-password">Confirmar senha</Label>
            <Input
              id="sa-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={saving}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
