import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { CONTRACT_A4_PROSE_CLASS, CONTRACT_A4_SHEET_CLASS } from '@/utils/contractA4Styles';
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
      <article className={CONTRACT_A4_SHEET_CLASS}>
        <div className={CONTRACT_A4_PROSE_CLASS} dangerouslySetInnerHTML={{ __html: safe }} />
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
