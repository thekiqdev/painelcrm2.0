import React from 'react';
import { MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { BusinessFormState } from '@/lib/profileForm';
import type { LucideIcon } from 'lucide-react';

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/50 bg-background/80 px-4 py-3 sm:col-span-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="break-words text-sm font-semibold text-foreground">{value || '—'}</p>
      </div>
    </div>
  );
}

type Props = {
  form: BusinessFormState;
  onChange: (next: BusinessFormState) => void;
  mode: 'view' | 'edit';
};

export function BusinessAddressCard({ form, onChange, mode }: Props) {
  const set = (patch: Partial<BusinessFormState>) => onChange({ ...form, ...patch });
  const edit = mode === 'edit';

  const summaryLine = [
    form.company_street,
    form.company_number,
    form.company_district,
    form.company_city,
    form.company_state,
    form.company_postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Endereço</CardTitle>
      </CardHeader>
      <CardContent>
        {edit ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="addr-cep">CEP</Label>
              <Input
                id="addr-cep"
                value={form.company_postal_code}
                onChange={(e) => set({ company_postal_code: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addr-street">Rua</Label>
              <Input
                id="addr-street"
                value={form.company_street}
                onChange={(e) => set({ company_street: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-num">Número</Label>
              <Input
                id="addr-num"
                value={form.company_number}
                onChange={(e) => set({ company_number: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-dist">Bairro</Label>
              <Input
                id="addr-dist"
                value={form.company_district}
                onChange={(e) => set({ company_district: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-city">Cidade</Label>
              <Input
                id="addr-city"
                value={form.company_city}
                onChange={(e) => set({ company_city: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="addr-uf">Estado</Label>
              <Input
                id="addr-uf"
                value={form.company_state}
                onChange={(e) => set({ company_state: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
                maxLength={2}
                placeholder="UF"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="addr-line">Complemento</Label>
              <Input
                id="addr-line"
                value={form.company_address_line}
                onChange={(e) => set({ company_address_line: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3">
            <Row icon={MapPin} label="Endereço completo" value={summaryLine || '—'} />
            {form.company_address_line.trim() ? (
              <Row icon={MapPin} label="Complemento" value={form.company_address_line} />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
