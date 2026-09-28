import React, { useMemo, useState } from 'react';
import { Plus, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/entities/StatCard';
import { COMMERCIAL_SUMMARY_GRID_4 } from '@/lib/commercialListUi';
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import { formatBrlCents } from './partnerTypes';

export default function PartnerSellersPage() {
  const {
    sellers,
    customers,
    commissions,
    sellerEmail,
    setSellerEmail,
    sellerName,
    setSellerName,
    saving,
    createSeller,
    deactivateSeller,
  } = usePartnerPanel();
  const [open, setOpen] = useState(false);

  const active = sellers.filter((s) => s.status === 'active').length;
  const customersBySeller = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      if (!c.seller_user_id) continue;
      map.set(c.seller_user_id, (map.get(c.seller_user_id) || 0) + 1);
    }
    return map;
  }, [customers]);

  const commissionBySeller = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of commissions) {
      map.set(
        c.seller_user_id,
        (map.get(c.seller_user_id) || 0) + c.commission_amount_cents
      );
    }
    return map;
  }, [commissions]);

  const totalCommission = commissions.reduce((acc, c) => acc + c.commission_amount_cents, 0);

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Vendedores"
        description="Equipe comercial do canal e clientes atribuídos."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo vendedor
          </Button>
        }
      />

      <div className={COMMERCIAL_SUMMARY_GRID_4}>
        <StatCard label="Total" value={String(sellers.length)} icon={UserPlus} />
        <StatCard
          label="Ativos"
          value={String(active)}
          icon={UserPlus}
          iconClassName="text-emerald-600"
        />
        <StatCard
          label="Comissões (extrato)"
          value={formatBrlCents(totalCommission)}
          icon={UserPlus}
          iconClassName="text-crm-primary"
        />
        <StatCard
          label="Clientes atribuídos"
          value={String(customers.filter((c) => c.seller_user_id).length)}
          icon={UserPlus}
        />
      </div>

      {sellers.length === 0 ? (
        <PartnerEmptyState
          title="Nenhum vendedor"
          description="Cadastre vendedores para distribuir links e comissões."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo vendedor
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Clientes</TableHead>
                <TableHead>Comissão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.map((s) => (
                <TableRow key={s.user_id}>
                  <TableCell className="font-medium">{s.name || '—'}</TableCell>
                  <TableCell>
                    <div>{s.email}</div>
                    <div className="text-xs text-muted-foreground">
                      ref <code>{s.referral_code || '—'}</code>
                    </div>
                  </TableCell>
                  <TableCell>{customersBySeller.get(s.user_id) || 0}</TableCell>
                  <TableCell>
                    {formatBrlCents(commissionBySeller.get(s.user_id) || 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={s.status === 'active' ? 'default' : 'outline'}>
                      {s.status === 'active' ? 'Ativo' : s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {s.status === 'active' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void deactivateSeller(s.user_id)}
                      >
                        Desativar
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo vendedor</DialogTitle>
            <DialogDescription>
              O vendedor poderá acessar o painel com link próprio e extrato de ganhos.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input value={sellerEmail} onChange={(e) => setSellerEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const ok = await createSeller();
                if (ok) setOpen(false);
              }}
            >
              Criar vendedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
