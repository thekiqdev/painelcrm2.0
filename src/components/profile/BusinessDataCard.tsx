import React from 'react';
import { Building2, Globe, Hash, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCpfCnpjDigits, formatPhoneBrDigits } from '@/lib/brazilInputMasks';
import type { BusinessFormState } from '@/lib/profileForm';
import type { LucideIcon } from 'lucide-react';

function Row({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border/50 bg-background/80 px-4 py-3">
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

export function BusinessDataCard({ form, onChange, mode }: Props) {
  const set = (patch: Partial<BusinessFormState>) => onChange({ ...form, ...patch });
  const edit = mode === 'edit';

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Dados da empresa</CardTitle>
        <CardDescription className="text-sm">Informações legais e de contato usadas em documentos e na conta.</CardDescription>
      </CardHeader>
      <CardContent>
        {edit ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="biz-name">Nome fantasia</Label>
              <Input
                id="biz-name"
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="biz-legal">Razão social</Label>
              <Input
                id="biz-legal"
                value={form.company_legal_name}
                onChange={(e) => set({ company_legal_name: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-cnpj">CNPJ</Label>
              <Input
                id="biz-cnpj"
                value={formatCpfCnpjDigits(form.cpf_cnpj)}
                onChange={(e) => set({ cpf_cnpj: formatCpfCnpjDigits(e.target.value) })}
                className="h-12 rounded-xl text-base sm:text-sm"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-email">E-mail da empresa</Label>
              <Input
                id="biz-email"
                type="email"
                value={form.company_email}
                onChange={(e) => set({ company_email: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-wa">WhatsApp da empresa</Label>
              <Input
                id="biz-wa"
                value={formatPhoneBrDigits(form.company_whatsapp)}
                onChange={(e) => set({ company_whatsapp: formatPhoneBrDigits(e.target.value) })}
                className="h-12 rounded-xl text-base sm:text-sm"
                inputMode="tel"
                placeholder="(00) 00000-0000"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="biz-site">Site</Label>
              <Input
                id="biz-site"
                value={form.company_website}
                onChange={(e) => set({ company_website: e.target.value })}
                className="h-12 rounded-xl text-base sm:text-sm"
                placeholder="https://"
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Row icon={Building2} label="Nome fantasia" value={form.name} />
            <Row icon={Building2} label="Razão social" value={form.company_legal_name} />
            <Row icon={Hash} label="CNPJ" value={formatCpfCnpjDigits(form.cpf_cnpj)} />
            <Row icon={Mail} label="E-mail" value={form.company_email} />
            <Row icon={Phone} label="WhatsApp" value={formatPhoneBrDigits(form.company_whatsapp) || '—'} />
            <Row icon={Globe} label="Site" value={form.company_website} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
