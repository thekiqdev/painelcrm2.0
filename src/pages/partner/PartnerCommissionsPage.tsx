import React, { useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
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
import { usePartnerPanel } from './PartnerPanelContext';
import { PartnerEmptyState, PartnerSectionHeader } from './PartnerSectionHeader';
import { appliesToLabel, formatBrlCents } from './partnerTypes';

export default function PartnerCommissionsPage() {
  const {
    isAdmin,
    isSeller,
    me,
    rules,
    commissions,
    sellers,
    selectedLedger,
    setSelectedLedger,
    ruleName,
    setRuleName,
    ruleType,
    setRuleType,
    rulePercent,
    setRulePercent,
    ruleFixedBrl,
    setRuleFixedBrl,
    ruleApplies,
    setRuleApplies,
    ruleSellerId,
    setRuleSellerId,
    sellerEarnings,
    saving,
    saveRule,
    markSelectedPaid,
  } = usePartnerPanel();
  const [ruleOpen, setRuleOpen] = useState(false);

  const activeTeamRule = useMemo(
    () => rules.find((r) => r.status === 'active' && !r.seller_user_id) || null,
    [rules]
  );

  if (isSeller) {
    return (
      <div className="space-y-6">
        <PartnerSectionHeader
          title="Meus ganhos"
          description="Extrato de comissões da sua carteira."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Disponível</CardDescription>
              <CardTitle className="text-2xl">
                {sellerEarnings ? formatBrlCents(sellerEarnings.available_cents) : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-border/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardDescription>Já pago</CardDescription>
              <CardTitle className="text-2xl">
                {sellerEarnings ? formatBrlCents(sellerEarnings.paid_cents) : '—'}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
        {!sellerEarnings || sellerEarnings.items.length === 0 ? (
          <PartnerEmptyState
            title="Sem lançamentos ainda"
            description="Quando seus clientes forem ativados, as comissões aparecerão aqui."
          />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {sellerEarnings.items.slice(0, 40).map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{i.customer_name || 'Cliente'}</p>
                  <p className="text-xs text-muted-foreground">{i.status}</p>
                </div>
                <span className="font-semibold tabular-nums">
                  {formatBrlCents(i.commission_amount_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <PartnerSectionHeader
        title="Comissões"
        description="Regras da equipe e extrato do canal. Cadência preferida: mensal."
        actions={
          <Button variant="outline" onClick={() => setRuleOpen(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {activeTeamRule ? 'Editar regra' : 'Criar regra'}
          </Button>
        }
      />

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Regra atual</CardTitle>
          <CardDescription>
            Comissão calculada sobre o lucro (venda − custo de licença), com teto no lucro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!activeTeamRule ? (
            <PartnerEmptyState
              title="Nenhuma regra de equipe ativa"
              description="Defina o percentual padrão para os vendedores."
              action={<Button onClick={() => setRuleOpen(true)}>Criar regra</Button>}
            />
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-bold tracking-tight">
                  {activeTeamRule.percent_bps != null
                    ? `${(activeTeamRule.percent_bps / 100).toFixed(0)}%`
                    : activeTeamRule.fixed_cents != null
                      ? formatBrlCents(activeTeamRule.fixed_cents)
                      : '—'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{activeTeamRule.name}</p>
                <p className="text-xs text-muted-foreground">
                  Aplicação: {appliesToLabel(activeTeamRule.applies_to)}
                </p>
              </div>
              <Badge variant="outline">{activeTeamRule.rule_type}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {rules.filter((r) => r.status === 'active' && r.seller_user_id).length > 0 ? (
        <Card className="border-border/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Overrides por vendedor</CardTitle>
          </CardHeader>
          <CardContent className="divide-y rounded-md border">
            {rules
              .filter((r) => r.status === 'active' && r.seller_user_id)
              .map((r) => (
                <div key={r.id} className="px-3 py-2 text-sm">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.rule_type}
                    {r.percent_bps != null ? ` · ${(r.percent_bps / 100).toFixed(2)}%` : ''}
                    {r.fixed_cents != null ? ` · ${formatBrlCents(r.fixed_cents)}` : ''} ·{' '}
                    {appliesToLabel(r.applies_to)}
                  </p>
                </div>
              ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/80 shadow-sm">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Extrato</CardTitle>
            <CardDescription>
              Cadência: {me?.profile.payout_cadence_preference || 'monthly'}
            </CardDescription>
          </div>
          <Button variant="secondary" disabled={saving} onClick={() => void markSelectedPaid()}>
            Marcar selecionadas como pagas
          </Button>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <PartnerEmptyState title="Sem lançamentos" description="As comissões aparecem após ativação de planos dos clientes." />
          ) : (
            <div className="divide-y rounded-md border">
              {commissions.map((c) => (
                <label key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                  {c.status === 'available' ? (
                    <input
                      type="checkbox"
                      checked={Boolean(selectedLedger[c.id])}
                      onChange={(e) =>
                        setSelectedLedger((prev) => ({
                          ...prev,
                          [c.id]: e.target.checked,
                        }))
                      }
                    />
                  ) : (
                    <span className="w-4" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {c.seller_email || c.seller_user_id} → {c.customer_name || 'cliente'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ciclo {c.cycle_number} · lucro {formatBrlCents(c.profit_amount_cents)} ·{' '}
                      {c.status}
                      {c.commission_capped ? ' · limitado ao lucro' : ''}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {formatBrlCents(c.commission_amount_cents)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regra de comissão</DialogTitle>
            <DialogDescription>
              Defina como a equipe (ou um vendedor) participa do lucro de cada venda.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Escopo</Label>
              <Select value={ruleSellerId} onValueChange={setRuleSellerId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__team__">Equipe (padrão)</SelectItem>
                  {sellers
                    .filter((s) => s.status === 'active')
                    .map((s) => (
                      <SelectItem key={s.user_id} value={s.user_id}>
                        Override: {s.name || s.email}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={ruleType}
                onValueChange={(v) => setRuleType(v as 'percent' | 'fixed' | 'hybrid')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {ruleType !== 'fixed' ? (
              <div className="space-y-2">
                <Label>% do lucro</Label>
                <Input value={rulePercent} onChange={(e) => setRulePercent(e.target.value)} />
              </div>
            ) : null}
            {ruleType !== 'percent' ? (
              <div className="space-y-2">
                <Label>Fixo (R$)</Label>
                <Input value={ruleFixedBrl} onChange={(e) => setRuleFixedBrl(e.target.value)} />
              </div>
            ) : null}
            <div className="space-y-2 sm:col-span-2">
              <Label>Aplicação</Label>
              <Select value={ruleApplies} onValueChange={setRuleApplies}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">1ª mensalidade + renovações</SelectItem>
                  <SelectItem value="first_only">Só 1ª venda</SelectItem>
                  <SelectItem value="renewals">Só renovações</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const ok = await saveRule();
                if (ok) setRuleOpen(false);
              }}
            >
              Salvar regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
