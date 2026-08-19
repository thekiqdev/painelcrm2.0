import React, { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/entities/StatCard';
import { COMMERCIAL_SUMMARY_GRID_4 } from '@/lib/commercialListUi';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import { formatBrlCents, type PartnerCustomer } from './partnerTypes';
import { formatCpfCnpjDigits } from '@/lib/brazilInputMasks';

export default function PartnerCustomersPage() {
  const {
    customers,
    sellers,
    plans,
    licenses,
    houseLink,
    saving,
    reassignCustomer,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    copySaleLink,
  } = usePartnerPanel();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PartnerCustomer | null>(null);
  const [deleting, setDeleting] = useState<PartnerCustomer | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [seats, setSeats] = useState('1');
  const [sellPlanId, setSellPlanId] = useState('');
  const [sellerId, setSellerId] = useState('__house__');
  const [cpfCnpj, setCpfCnpj] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.slug.toLowerCase().includes(term) ||
        c.status.toLowerCase().includes(term) ||
        (c.admin_email || '').toLowerCase().includes(term) ||
        (c.sell_plan_name || '').toLowerCase().includes(term)
    );
  }, [customers, q]);

  const active = customers.filter((c) => c.status === 'active').length;
  const pending = customers.filter((c) =>
    ['trial', 'payment_pending', 'pending'].includes(c.status)
  ).length;
  const cancelled = customers.filter((c) =>
    ['suspended', 'cancelled', 'canceled'].includes(c.status)
  ).length;

  const activePlans = plans.filter((p) => p.status === 'active');
  const availableSeats = licenses?.available_seats ?? 0;

  const resetForm = () => {
    setCompanyName('');
    setAdminEmail('');
    setAdminName('');
    setAdminPassword('');
    setSeats('1');
    setSellPlanId(activePlans[0]?.id || '');
    setSellerId('__house__');
    setCpfCnpj('');
  };

  const openEdit = (c: PartnerCustomer) => {
    setEditing(c);
    setCompanyName(c.name);
    setAdminEmail(c.admin_email || '');
    setAdminName(c.admin_name || '');
    setAdminPassword('');
    setCpfCnpj(c.cpf_cnpj ? formatCpfCnpjDigits(c.cpf_cnpj) : '');
    setSeats(String(c.seats_allocated ?? Math.max(1, c.users_count)));
    setSellPlanId(c.partner_sell_plan_id || activePlans[0]?.id || '');
    setSellerId(c.seller_user_id || '__house__');
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Clientes"
        description="Carteira do canal. Crie clientes manualmente ou compartilhe o link de vendas."
        actions={
          <Button
            onClick={() => {
              setSellPlanId(activePlans[0]?.id || '');
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo cliente
          </Button>
        }
      />

      <div className={COMMERCIAL_SUMMARY_GRID_4}>
        <StatCard label="Total" value={String(customers.length)} icon={Users} />
        <StatCard label="Ativos" value={String(active)} icon={Users} iconClassName="text-emerald-600" />
        <StatCard label="Pendentes" value={String(pending)} icon={Users} iconClassName="text-amber-600" />
        <StatCard label="Cancelados" value={String(cancelled)} icon={Users} iconClassName="text-destructive" />
      </div>

      {customers.length === 0 ? (
        <PartnerEmptyState
          title="Nenhum cliente ainda"
          description="Crie um cliente agora ou compartilhe seu link de vendas."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => {
                  setSellPlanId(activePlans[0]?.id || '');
                  setOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo cliente
              </Button>
              {houseLink ? (
                <Button variant="outline" onClick={() => void copySaleLink(houseLink.sale_url)}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar link de vendas
                </Button>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nome, login, plano ou status…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Licenças</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vendedor</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Nenhum resultado para a busca.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm">{c.admin_email || '—'}</TableCell>
                      <TableCell>
                        <div className="text-sm">{c.sell_plan_name || 'Padrão'}</div>
                        {c.sell_plan_price_cents != null ? (
                          <div className="text-xs text-muted-foreground">
                            {formatBrlCents(c.sell_plan_price_cents)}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {c.seats_allocated != null
                          ? `${c.users_count} / ${c.seats_allocated}`
                          : c.users_count}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{c.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={c.seller_user_id || '__house__'}
                          onValueChange={(v) =>
                            void reassignCustomer(c.id, v === '__house__' ? null : v)
                          }
                          disabled={saving}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Vendedor" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__house__">Casa</SelectItem>
                            {sellers.map((s) => (
                              <SelectItem key={s.user_id} value={s.user_id}>
                                {s.name || s.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar cliente"
                            onClick={() => openEdit(c)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir cliente"
                            className="text-destructive hover:text-destructive"
                            disabled={saving}
                            onClick={() => setDeleting(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetForm();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Defina o login e a senha do admin, o plano e quantas licenças ele poderá usar do seu
              pool. Disponíveis agora: {availableSeats}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Nome da empresa do cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Login (e-mail)</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@cliente.com"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ (opcional)</Label>
              <Input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(formatCpfCnpjDigits(e.target.value))}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Necessário para cobranças Asaas (PIX, boleto, cartão).
              </p>
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do responsável</Label>
              <Input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label>Licenças (usuários)</Label>
              <Input
                type="number"
                min={1}
                max={availableSeats || undefined}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                1 licença = 1 usuário. O admin já consome a primeira licença.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Plano de venda</Label>
              <Select
                value={sellPlanId || undefined}
                onValueChange={setSellPlanId}
                disabled={activePlans.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano seu" />
                </SelectTrigger>
                <SelectContent>
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatBrlCents(p.price_cents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activePlans.length === 0 ? (
                <p className="text-xs text-amber-700">
                  Publique ao menos um plano de venda em Planos antes de criar clientes.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Apenas planos criados por você. O cliente verá este valor em Meu plano.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__house__">Carteira da casa</SelectItem>
                  {sellers
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.name || s.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving || activePlans.length === 0}
              onClick={async () => {
                if (!sellPlanId) {
                  return;
                }
                const seatsNum = Math.floor(Number(String(seats).replace(',', '.')));
                const ok = await createCustomer({
                  company_name: companyName,
                  admin_email: adminEmail,
                  admin_name: adminName || undefined,
                  admin_password: adminPassword,
                  seats: seatsNum,
                  sell_plan_id: sellPlanId,
                  seller_user_id: sellerId === '__house__' ? null : sellerId,
                  cpf_cnpj: cpfCnpj.replace(/\D/g, '') || null,
                });
                if (ok) {
                  setOpen(false);
                  resetForm();
                }
              }}
            >
              Criar cliente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) {
            setEditing(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>
              Atualize dados, licenças ou faça upgrade/downgrade do plano. Deixe a senha em branco
              para não alterar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Empresa</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Login (e-mail)</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(formatCpfCnpjDigits(e.target.value))}
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Opcional — mín. 8 caracteres"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do responsável</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Licenças (usuários)</Label>
              <Input
                type="number"
                min={editing?.users_count || 1}
                value={seats}
                onChange={(e) => setSeats(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Mínimo: {editing?.users_count ?? 1} (usuários já existentes). Pool disponível:{' '}
                {availableSeats}.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Plano de venda (upgrade / downgrade)</Label>
              <Select
                value={sellPlanId || undefined}
                onValueChange={setSellPlanId}
                disabled={!sellPlanId && activePlans.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plano seu" />
                </SelectTrigger>
                <SelectContent>
                  {editing?.partner_sell_plan_id &&
                  !activePlans.some((p) => p.id === editing.partner_sell_plan_id) ? (
                    <SelectItem value={editing.partner_sell_plan_id}>
                      {editing.sell_plan_name || 'Plano atual'} (inativo)
                    </SelectItem>
                  ) : null}
                  {activePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {formatBrlCents(p.price_cents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={sellerId} onValueChange={setSellerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__house__">Carteira da casa</SelectItem>
                  {sellers
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        {s.name || s.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving || !editing}
              onClick={async () => {
                if (!editing) return;
                const seatsNum = Math.floor(Number(String(seats).replace(',', '.')));
                const ok = await updateCustomer(editing.id, {
                  company_name: companyName.trim(),
                  admin_email: adminEmail.trim(),
                  admin_name: adminName.trim() || undefined,
                  admin_password: adminPassword.trim() || undefined,
                  seats: seatsNum,
                  sell_plan_id: sellPlanId || undefined,
                  seller_user_id: sellerId === '__house__' ? null : sellerId,
                  cpf_cnpj: cpfCnpj.replace(/\D/g, '') || null,
                });
                if (ok) {
                  setEditOpen(false);
                  setEditing(null);
                  resetForm();
                }
              }}
            >
              Salvar alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => {
          if (!v) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove permanentemente a conta{' '}
              <strong className="text-foreground">{deleting?.name}</strong>
              {deleting?.admin_email ? (
                <>
                  {' '}
                  ({deleting.admin_email})
                </>
              ) : null}
              , usuários e dados associados. As licenças voltam ao seu pool. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving || !deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!deleting) return;
                const ok = await deleteCustomer(deleting.id);
                if (ok) setDeleting(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
