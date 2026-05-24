import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { stripTrailingSignatureSectionFromHtml } from '@/utils/contractDocumentHtml';
import {
  ContractSignatureBlocksList,
} from '@/components/contracts/ContractSignatureBlock';
import {
  parseContractSignerSignatureDisplay,
  type ContractSignatureDisplayInput,
} from '@/utils/contractSignatureDisplay';

/** @deprecated Use ContractSignatureDisplayInput — mantido para compatibilidade. */
export type ContractA4SignerAppendixItem = {
  name: string;
  email: string;
  tax_id?: string | null;
  signed: boolean;
  signed_at: string | null;
  signature_image_png_base64: string | null;
  id?: string;
  signature_data?: Record<string, unknown> | null;
};

type Props = {
  html: string;
  className?: string;
  highlightUnresolved?: boolean;
  signersAppendix?: ContractA4SignerAppendixItem[];
};

function wrapUnresolved(html: string): string {
  if (!html) return html;
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    return `<span class="contract-ph-unresolved">{{${String(key)}}}</span>`;
  });
}

function appendixToDisplayModels(items: ContractA4SignerAppendixItem[]) {
  return items.map((s) => {
    const input: ContractSignatureDisplayInput = {
      id: s.id ?? s.email,
      name: s.name,
      email: s.email,
      tax_id: s.tax_id,
      signed_at: s.signed ? s.signed_at : null,
      signature_data:
        s.signature_data ??
        (s.signature_image_png_base64
          ? { signature_image_png_base64: s.signature_image_png_base64 }
          : null),
    };
    return parseContractSignerSignatureDisplay(input);
  });
}

export function ContractA4Document({ html, className, highlightUnresolved, signersAppendix }: Props) {
  const raw = signersAppendix != null ? stripTrailingSignatureSectionFromHtml(html) : html;
  const piped = highlightUnresolved ? wrapUnresolved(raw) : raw;
  const safe = sanitizeHtml(piped || '<p></p>');
  const signatureModels =
    signersAppendix != null ? appendixToDisplayModels(signersAppendix) : null;

  return (
    <div className={cn('flex w-full justify-center', className)}>
      <article
        className={cn(
          'contract-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-[15px] leading-[1.75]',
          'shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06]',
          'px-[8mm] py-[10mm] sm:px-[14mm] sm:py-[16mm]',
          'text-zinc-950 [font-family:Georgia,"Times_New_Roman",serif]',
          '[color-scheme:light]',
        )}
      >
        <div
          className={cn(
            'prose prose-sm prose-neutral max-w-none contract-a4-prose text-zinc-900',
            '[&_p]:my-3 [&_p]:leading-[1.75]',
            '[&_li]:my-1 [&_li]:leading-[1.7]',
            '[&_h1]:text-xl [&_h1]:mt-8 [&_h1]:mb-3 [&_h1]:leading-snug',
            '[&_h2]:text-lg [&_h2]:mt-6 [&_h2]:mb-2.5 [&_h2]:leading-snug',
            '[&_h3]:text-base [&_h3]:mt-5 [&_h3]:mb-2.5',
            '[&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-3 [&_ol]:my-3',
            '[&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-black/15',
            '[&_br]:leading-[1.75]',
          )}
          dangerouslySetInnerHTML={{ __html: safe }}
        />
        {signatureModels != null ? (
          <div className="mt-10 pt-6 [font-family:ui-sans-serif,system-ui,sans-serif]">
            <ContractSignatureBlocksList signers={signatureModels} title="Assinatura" />
          </div>
        ) : null}
        <style>{`
          .contract-ph-unresolved {
            background: rgba(251, 191, 36, 0.28);
            padding: 0 3px;
            border-radius: 3px;
            font-family: ui-sans-serif, system-ui, sans-serif;
            font-size: 0.88em;
          }
        `}</style>
      </article>
    </div>
  );
}
