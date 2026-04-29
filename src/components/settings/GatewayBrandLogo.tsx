import React, { useState } from "react";
import { cn } from "@/lib/utils";

type GatewayBrandLogoProps = {
  src: string;
  alt: string;
  /** Exibido só se a imagem falhar ao carregar (mesmo tamanho aproximado). */
  fallback: React.ReactNode;
  className?: string;
};

/**
 * Área fixa para marca do gateway (Asaas / Mercado Pago): mesma caixa nos dois cards,
 * `object-contain` centralizado (sem distorção). Fallback apenas em erro de carregamento.
 */
export const GatewayBrandLogo: React.FC<GatewayBrandLogoProps> = ({ src, alt, fallback, className }) => {
  const [failed, setFailed] = useState(false);

  /** ~40–44px de altura; largura contida para o nome do gateway dominar a linha. */
  const boxClass = cn(
    "flex h-11 w-[56px] shrink-0 items-center justify-center rounded-md border border-border/35 bg-muted/20",
    className
  );

  if (failed) {
    return (
      <div className={boxClass} role="img" aria-label={alt}>
        <div className="flex h-full w-full items-center justify-center px-0.5">{fallback}</div>
      </div>
    );
  }

  return (
    <div className={boxClass}>
      <img
        src={src}
        alt={alt}
        className="max-h-9 max-w-[52px] object-contain object-center"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
};
