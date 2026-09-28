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
import {
  getSuperadminCompanyUser,
  patchSuperadminCompanyUser,
  type SuperadminCompanyUserDetail,
} from '@/services/superadminCompanyUsers';

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  member: 'Membro',
  viewer: 'Visualizador',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onSaved: () => void;
};

export function SuperAdminEditTenantUserDialog({
  open,
  onOpenChange,
  tenantId,
  userId,
  onSaved,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<SuperadminCompanyUserDetail | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');

  useEffect(() => {
    if (!open || !userId) return;
    setLoading(true);
    void getSuperadminCompanyUser(tenantId, userId).then((res) => {
      if (res.error || !res.data?.ok || !res.data.user) {
        toast.error(res.data?.error ?? res.error ?? 'Erro ao carregar usuário');
        onOpenChange(false);
        return;
      }
      const u = res.data.user;
      setUser(u);
      setFullName(u.full_name ?? '');
      setEmail(u.email);
      setPhone(u.whatsapp_number ?? '');
      setJobTitle(u.job_title ?? '');
      setLoading(false);
    });
  }, [open, tenantId, userId, onOpenChange]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !user) return;
    if (!fullName.trim() || !email.trim()) {
      toast.error('Nome e e-mail são obrigatórios.');
      return;
    }
    setSaving(true);
    const res = await patchSuperadminCompanyUser(tenantId, userId, {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() ? phone.replace(/\D/g, '') : null,
      job_title: jobTitle.trim() || null,
    });
    setSaving(false);
    if (res.error || !res.data?.ok) {
      toast.error(res.data?.error ?? res.error ?? 'Erro ao salvar');
      return;
    }
    toast.success('Usuário atualizado.');
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>
            Dados da conta na empresa. O perfil de acesso não é alterado aqui.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sa-user-name">Nome</Label>
              <Input
                id="sa-user-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-user-email">E-mail</Label>
              <Input
                id="sa-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-user-phone">WhatsApp</Label>
              <Input
                id="sa-user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="DDD + número"
                disabled={saving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sa-user-job">Cargo / Função</Label>
              <Input
                id="sa-user-job"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={saving}
              />
            </div>
            {user?.role ? (
              <p className="text-xs text-muted-foreground">
                Perfil de acesso: {roleLabels[user.role] ?? user.role}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
