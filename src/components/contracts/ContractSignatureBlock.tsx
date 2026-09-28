import React from 'react';
import { cn } from '@/lib/utils';
import type { ContractSignatureDisplayModel } from '@/utils/contractSignatureDisplay';

type Props = {
  model: ContractSignatureDisplayModel;
  className?: string;
  compact?: boolean;
};

/** Bloco de assinatura sem borda nem título interno (título fica só na secção superior). */
export function ContractSignatureBlock({ model, className, compact = false }: Props) {
  const imgSrc = model.signatureImagePngBase64
    ? `data:image/png;base64,${model.signatureImagePngBase64}`
    : null;

  return (
    <div
      className={cn('text-slate-800', compact ? 'max-w-md' : 'w-full', className)}
      aria-label={`Assinatura de ${model.name}`}
    >
      <div
        className={cn('mb-4 max-w-xs border-t border-slate-300', compact && 'max-w-[200px]')}
        aria-hidden
      />

      <div className={cn('space-y-3', !compact && 'max-w-md')}>
        {model.signed && imgSrc ? (
          <img
            src={imgSrc}
            alt=""
            className={cn(
              'object-contain object-left',
              compact ? 'h-12 max-w-[200px]' : 'h-14 sm:h-16 max-w-[240px]',
            )}
            loading="lazy"
            decoding="async"
          />
        ) : model.signed ? (
          <p className="text-xs text-slate-500">Imagem da assinatura indisponível.</p>
        ) : (
          <p className="text-xs text-slate-500 italic">Aguardando assinatura</p>
        )}

        <div className="max-w-xs border-t border-slate-300 pt-2">
          <p className="text-sm font-semibold text-slate-900">{model.name}</p>
        </div>

        <ul className="space-y-0.5 text-xs text-slate-700">
          {model.taxId ? (
            <li>
              <span className="font-medium text-slate-800">CPF:</span> {model.taxId}
            </li>
          ) : null}
          <li>
            <span className="font-medium text-slate-800">E-mail:</span>{' '}
            <span className="break-all">{model.email}</span>
          </li>
          {model.signedAtLabel ? (
            <li>
              <span className="font-medium text-slate-800">Data da assinatura:</span>{' '}
              {model.signedAtLabel}
            </li>
          ) : null}
          {model.ip ? (
            <li>
              <span className="font-medium text-slate-800">IP:</span> {model.ip}
            </li>
          ) : null}
          {model.methodLabel ? (
            <li>
              <span className="font-medium text-slate-800">Método:</span> {model.methodLabel}
            </li>
          ) : null}
          {model.signatureId ? (
            <li className="break-all">
              <span className="font-medium text-slate-800">ID da assinatura:</span>{' '}
              <span className="font-mono text-[11px]">{model.signatureId}</span>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

type ListProps = {
  signers: ContractSignatureDisplayModel[];
  title?: string;
  className?: string;
  compact?: boolean;
};

export function ContractSignatureBlocksList({
  signers,
  title = 'Assinatura',
  className,
  compact = false,
}: ListProps) {
  if (!signers.length) {
    return (
      <p className="text-sm text-muted-foreground">Nenhum signatário configurado para este contrato.</p>
    );
  }
  return (
    <section className={cn('space-y-8', className)} aria-label={title}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {signers.map((m, idx) => (
        <div key={m.signerId} className={cn(idx > 0 && 'pt-8')}>
          <ContractSignatureBlock model={m} compact={compact} />
        </div>
      ))}
    </section>
  );
}
