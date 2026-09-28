import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import { billingIntervalLabel, formatBrlCents } from './partnerTypes';

export default function PartnerPlansPage() {
  const {
    plans,
    licenses,
    planName,
    setPlanName,
    planPriceBrl,
    setPlanPriceBrl,
    planInterval,
    setPlanInterval,
    planTrialDays,
    setPlanTrialDays,
    projection,
    saving,
    createPlan,
    publishPlan,
  } = usePartnerPanel();
  const [open, setOpen] = useState(false);

  const unitCost = licenses?.unit_cost_cents ?? 0;

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Planos de venda"
        description="Defina quanto você deseja cobrar dos seus clientes e veja a margem estimada."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo plano
          </Button>
        }
      />

      {plans.length === 0 ? (
        <PartnerEmptyState
          title="Nenhum plano ainda"
          description="Crie um plano para começar a oferecer o produto aos seus clientes."
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo plano
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead>Intervalo</TableHead>
                <TableHead>Teste grátis</TableHead>
                <TableHead>Custo</TableHead>
                <TableHead>Margem est.</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((p) => {
                const margin = p.price_cents - unitCost;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>{formatBrlCents(p.price_cents)}</TableCell>
                    <TableCell>{billingIntervalLabel(p.billing_interval)}</TableCell>
                    <TableCell>
                      {(p.trial_days ?? 0) > 0 ? `${p.trial_days} dias` : '—'}
                    </TableCell>
                    <TableCell>{formatBrlCents(unitCost)}</TableCell>
                    <TableCell>{formatBrlCents(margin)}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'active' ? 'default' : 'outline'}>
                        {p.status === 'active' ? 'Ativo' : p.status === 'draft' ? 'Rascunho' : p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {p.status === 'draft' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => void publishPlan(p.id)}
                        >
                          Publicar
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo plano de venda</DialogTitle>
            <DialogDescription>
              O preço precisa respeitar o piso do programa. Publicar exige gateway testado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={planName} onChange={(e) => setPlanName(e.target.value)} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Preço (R$)</Label>
                <Input value={planPriceBrl} onChange={(e) => setPlanPriceBrl(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Intervalo</Label>
                <Select value={planInterval} onValueChange={setPlanInterval}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="quarterly">Trimestral</SelectItem>
                    <SelectItem value="semiannual">Semestral</SelectItem>
                    <SelectItem value="yearly">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Teste grátis (dias)</Label>
              <Input
                type="number"
                min={0}
                max={365}
                value={planTrialDays}
                onChange={(e) => setPlanTrialDays(e.target.value)}
                placeholder="0 = sem teste"
              />
              <p className="text-xs text-muted-foreground">
                O Partner banca a licença durante o trial. Use 0 para cobrar desde o início.
              </p>
            </div>
            {projection ? (
              <Card className="border-dashed bg-muted/20 shadow-none">
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Margem estimada (1 cliente / 1 usuário)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 pb-3 text-xs text-muted-foreground">
                  <p>
                    Receita {formatBrlCents(projection.projected_revenue_cents)} − custo{' '}
                    {formatBrlCents(projection.projected_cost_cents)} = margem{' '}
                    <strong className="text-foreground">
                      {formatBrlCents(projection.projected_margin_cents)}
                    </strong>
                  </p>
                  <p>Piso do programa: {formatBrlCents(projection.floor_price_cents)}</p>
                </CardContent>
              </Card>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const ok = await createPlan();
                if (ok) setOpen(false);
              }}
            >
              Criar rascunho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
