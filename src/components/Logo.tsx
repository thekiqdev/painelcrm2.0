/**
 * Logo PainelCRM — ícone tecnológico com tema CRM (painéis/dashboard).
 * Animação sutil de brilho para transmitir modernidade.
 */
import React from "react";

interface LogoProps {
  className?: string;
  /** Tamanho do container (ex: h-8 w-8). O SVG preenche 100%. */
  size?: "sm" | "md" | "lg";
  /** primary = tema padrão (landing), crm = azul do app */
  variant?: "primary" | "crm";
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
};

const variantClasses = {
  primary: "bg-primary text-primary-foreground",
  crm: "bg-crm-primary text-white",
};

export function Logo({ className = "", size = "sm", variant = "primary" }: LogoProps) {
  const sizeClass = sizeClasses[size];
  const variantClass = variantClasses[variant];

  return (
    <div
      className={`flex items-center justify-center rounded-lg overflow-hidden ${sizeClass} ${variantClass} ${className}`}
      aria-hidden
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full p-1.5"
        role="img"
        aria-label="PainelCRM"
      >
        <defs>
          <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* Grid 2x2 — painéis de dashboard / CRM */}
        <rect x="2" y="2" width="12" height="12" rx="2.5" fill="currentColor" opacity="0.95" />
        <rect x="18" y="2" width="12" height="12" rx="2.5" fill="currentColor" opacity="0.6" />
        <rect x="2" y="18" width="12" height="12" rx="2.5" fill="currentColor" opacity="0.6" />
        {/* Célula “ativa” com animação sutil */}
        <rect
          x="18"
          y="18"
          width="12"
          height="12"
          rx="2.5"
          fill="currentColor"
          opacity="1"
          className="animate-logo-pulse"
        />
      </svg>
    </div>
  );
}

export default Logo;
