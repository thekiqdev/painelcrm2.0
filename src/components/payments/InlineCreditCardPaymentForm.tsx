import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { CreditCard, ExternalLink, Loader2 } from 'lucide-react';
import { formatCpfCnpjDigits, formatPhoneBrDigits } from '@/lib/brazilInputMasks';

export type InlineCreditCardFormState = {
  holder_name: string;
  number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
  ch_name: string;
  ch_email: string;
  ch_cpf_cnpj: string;
  ch_postal_code: string;
  ch_address_number: string;
  ch_phone: string;
  ch_complement: string;
  ch_mobile: string;
};

export const createEmptyInlineCreditCardForm = (): InlineCreditCardFormState => ({
  holder_name: '',
  number: '',
  expiry_month: '',
  expiry_year: '',
  cvv: '',
  ch_name: '',
  ch_email: '',
  ch_cpf_cnpj: '',
  ch_postal_code: '',
  ch_address_number: '',
  ch_phone: '',
  ch_complement: '',
  ch_mobile: '',
});

type Props = {
  form: InlineCreditCardFormState;
  setForm: React.Dispatch<React.SetStateAction<InlineCreditCardFormState>>;
  onSubmit: (e: React.FormEvent) => void | Promise<void>;
  paying: boolean;
  /** Mesmo fallback da página pública de faturas (link hosted do provedor). */
  hostedCheckoutUrl?: string | null;
  /** Prefixo opcional para ids de campo (evita colisão se houver dois formulários na página). */
  fieldIdPrefix?: string;
};

/**
 * Formulário de captura de cartão alinhado ao fluxo público de faturas (`CustomerInvoicePay` / pay-with-card).
 */
export function InlineCreditCardPaymentForm({
  form,
  setForm,
  onSubmit,
  paying,
  hostedCheckoutUrl,
  fieldIdPrefix = '',
}: Props) {
  const p = fieldIdPrefix;
  return (
    <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <CreditCard className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
        Cartão de crédito
      </h3>
      <div className="space-y-3 rounded-lg border bg-background/80 p-4">
        <p className="text-xs font-medium text-muted-foreground">Dados do cartão</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}cc_holder`}>Nome no cartão</Label>
            <Input
              id={`${p}cc_holder`}
              autoComplete="cc-name"
              value={form.holder_name}
              onChange={(e) => setForm((f) => ({ ...f, holder_name: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}cc_num`}>Número do cartão</Label>
            <Input
              id={`${p}cc_num`}
              inputMode="numeric"
              autoComplete="cc-number"
              value={form.number}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  number: e.target.value.replace(/\D/g, '').slice(0, 19),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${p}cc_m`}>Mês</Label>
            <Input
              id={`${p}cc_m`}
              inputMode="numeric"
              placeholder="MM"
              autoComplete="cc-exp-month"
              value={form.expiry_month}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expiry_month: e.target.value.replace(/\D/g, '').slice(0, 2),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${p}cc_y`}>Ano</Label>
            <Input
              id={`${p}cc_y`}
              inputMode="numeric"
              placeholder="AAAA"
              autoComplete="cc-exp-year"
              value={form.expiry_year}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expiry_year: e.target.value.replace(/\D/g, '').slice(0, 4),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}cc_cvv`}>CVV</Label>
            <Input
              id={`${p}cc_cvv`}
              inputMode="numeric"
              autoComplete="cc-csc"
              type="password"
              value={form.cvv}
              onChange={(e) =>
                setForm((f) => ({ ...f, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))
              }
              className="mt-1"
              required
            />
          </div>
        </div>
      </div>
      <div className="space-y-3 rounded-lg border bg-background/80 p-4">
        <p className="text-xs font-medium text-muted-foreground">Titular do cartão</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}ch_name`}>Nome completo</Label>
            <Input
              id={`${p}ch_name`}
              value={form.ch_name}
              onChange={(e) => setForm((f) => ({ ...f, ch_name: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}ch_email`}>E-mail</Label>
            <Input
              id={`${p}ch_email`}
              type="email"
              autoComplete="email"
              value={form.ch_email}
              onChange={(e) => setForm((f) => ({ ...f, ch_email: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}ch_cpf`}>CPF ou CNPJ</Label>
            <Input
              id={`${p}ch_cpf`}
              inputMode="numeric"
              value={formatCpfCnpjDigits(form.ch_cpf_cnpj)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ch_cpf_cnpj: e.target.value.replace(/\D/g, '').slice(0, 14),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${p}ch_cep`}>CEP</Label>
            <Input
              id={`${p}ch_cep`}
              inputMode="numeric"
              value={form.ch_postal_code}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ch_postal_code: e.target.value.replace(/\D/g, '').slice(0, 8),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${p}ch_num`}>Número</Label>
            <Input
              id={`${p}ch_num`}
              value={form.ch_address_number}
              onChange={(e) => setForm((f) => ({ ...f, ch_address_number: e.target.value }))}
              className="mt-1"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor={`${p}ch_comp`}>Complemento (opcional)</Label>
            <Input
              id={`${p}ch_comp`}
              value={form.ch_complement}
              onChange={(e) => setForm((f) => ({ ...f, ch_complement: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor={`${p}ch_phone`}>Telefone</Label>
            <Input
              id={`${p}ch_phone`}
              inputMode="tel"
              value={formatPhoneBrDigits(form.ch_phone)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ch_phone: e.target.value.replace(/\D/g, '').slice(0, 11),
                }))
              }
              className="mt-1"
              required
            />
          </div>
          <div>
            <Label htmlFor={`${p}ch_mobile`}>Celular (opcional)</Label>
            <Input
              id={`${p}ch_mobile`}
              inputMode="tel"
              value={formatPhoneBrDigits(form.ch_mobile)}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ch_mobile: e.target.value.replace(/\D/g, '').slice(0, 11),
                }))
              }
              className="mt-1"
            />
          </div>
        </div>
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={paying}>
        {paying ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processando…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4 mr-2" />
            Pagar agora
          </>
        )}
      </Button>
      {hostedCheckoutUrl ? (
        <p className="text-xs text-muted-foreground">
          Alternativa:{' '}
          <a
            href={hostedCheckoutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 inline-flex items-center gap-1"
          >
            abrir página do provedor
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
          </a>
        </p>
      ) : null}
    </form>
  );
}
