import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock } from 'lucide-react';
import { formatBrazilTaxIdDisplay } from '@/utils/brazilTaxId';

/** Alinhado ao PDF: bloco “Signatários e evidências mínimas” dentro da mesma folha. */
export type ContractA4SignerAppendixItem = {
  name: string;
  email: string;
  tax_id?: string | null;
  signed: boolean;
  signed_at: string | null;
  signature_image_png_base64: string | null;
};

type Props = {
  html: string;
  className?: string;
  /** Quando true, envolve `{{...}}` restantes com classe de destaque (útil em preview). */
  highlightUnresolved?: boolean;
  /** Assinaturas no fluxo do documento (igual ao PDF), após o HTML do contrato. */
  signersAppendix?: ContractA4SignerAppendixItem[];
};

function wrapUnresolved(html: string): string {
  if (!html) return html;
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    return `<span class="contract-ph-unresolved">{{${String(key)}}}</span>`;
  });
}

/**
 * Área de leitura em proporção de folha A4 (largura ~210mm, altura mínima ~297mm, expande com o conteúdo).
 */
function SignersAppendix({ signers }: { signers: ContractA4SignerAppendixItem[] }) {
  return (
    <section
      className="mt-10 pt-8 border-t border-black/[0.12] text-[15px] leading-[1.7]"
      aria-label="Signatários e evidências mínimas"
    >
      <h2 className="text-base font-semibold underline underline-offset-4 decoration-black/25 mb-6">
        Signatários e evidências mínimas
      </h2>
      {!signers.length ? (
        <p className="text-sm text-zinc-600">Nenhum signatário configurado para este contrato.</p>
      ) : (
      <div className="space-y-8">
        {signers.map((s, idx) => (
          <div
            key={`${s.email}-${idx}`}
            className="flex flex-col sm:flex-row sm:items-start gap-4 sm:gap-6"
          >
            <div className="flex-1 min-w-0 space-y-2">
              <div className="font-semibold text-zinc-900">{s.name}</div>
              <div className="text-sm text-zinc-600 break-words">{s.email}</div>
              {s.tax_id ? (
                <div className="text-xs text-zinc-600">
                  CPF/CNPJ: {formatBrazilTaxIdDisplay(s.tax_id)}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {s.signed ? (
                  <Badge className="bg-green-600 gap-1 font-normal text-white">
                    <CheckCircle2 className="h-3 w-3" />
                    Assinado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="gap-1 border-zinc-300 bg-white font-normal text-zinc-700 shadow-none"
                  >
                    <Clock className="h-3 w-3" />
                    Pendente de assinatura
                  </Badge>
                )}
              </div>
              {s.signed && s.signed_at ? (
                <p className="text-xs text-zinc-600">
                  {format(new Date(s.signed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}{' '}
                  <span className="opacity-80">(hora do registo)</span>
                </p>
              ) : null}
            </div>
            {s.signed && s.signature_image_png_base64 ? (
              <div className="shrink-0 rounded-md border border-black/10 bg-white p-2.5 shadow-sm">
                <p className="text-[10px] mb-1.5 uppercase tracking-wide text-zinc-500">
                  Assinatura manuscrita (e-sign)
                </p>
                <img
                  src={`data:image/png;base64,${s.signature_image_png_base64}`}
                  alt=""
                  className="h-[56px] w-[180px] max-w-[200px] object-contain"
                  loading="lazy"
                  decoding="async"
                />
              </div>
            ) : s.signed ? (
              <p className="text-xs text-zinc-600 sm:self-center sm:max-w-[200px]">
                Pré-visualização da assinatura indisponível.
              </p>
            ) : null}
          </div>
        ))}
      </div>
      )}
    </section>
  );
}

export function ContractA4Document({ html, className, highlightUnresolved, signersAppendix }: Props) {
  const piped = highlightUnresolved ? wrapUnresolved(html) : html;
  const safe = sanitizeHtml(piped || '<p></p>');
  return (
    <div className={cn('flex w-full justify-center', className)}>
      <article
        className={cn(
          'contract-a4-sheet w-full max-w-[210mm] min-h-[297mm] bg-white text-[15px] leading-[1.75]',
          'shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06]',
          'px-[8mm] py-[10mm] sm:px-[14mm] sm:py-[16mm]',
          'text-zinc-950 [font-family:Georgia,"Times_New_Roman",serif]',
          /* Folha sempre “papel”: não herdar paleta dark do tema na página */
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
            '[&_h3]:text-base [&_h3]:mt-5 [&_h3]:mb-2',
            '[&_ul]:pl-5 [&_ol]:pl-5 [&_ul]:my-3 [&_ol]:my-3',
            '[&_blockquote]:my-4 [&_blockquote]:pl-4 [&_blockquote]:border-l-2 [&_blockquote]:border-black/15',
            '[&_br]:leading-[1.75]',
          )}
          dangerouslySetInnerHTML={{ __html: safe }}
        />
        {signersAppendix != null ? <SignersAppendix signers={signersAppendix} /> : null}
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
