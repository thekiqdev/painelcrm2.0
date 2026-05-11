import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const legalLinksEnabled = import.meta.env.VITE_ENABLE_LEGAL_PAGES !== "false";

/**
 * Rodapé da landing estática: links legais com <a href> para carregar o SPA principal (/index.html).
 */
export default function LandingPublicFooter() {
  return (
    <footer className="border-t border-border/50 bg-background py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-display text-lg font-bold text-foreground">PainelCRM</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-6 font-sans text-sm text-muted-foreground">
            <a href="#recursos" className="transition-colors hover:text-foreground">
              Recursos
            </a>
            <a href="#planos" className="transition-colors hover:text-foreground">
              Preços
            </a>
            <a href="/login" className="transition-colors hover:text-foreground">
              Contato
            </a>
            {legalLinksEnabled ? (
              <>
                <a href="/legal/terms-of-service" className="transition-colors hover:text-foreground">
                  Termos de Uso
                </a>
                <a href="/legal/privacy-policy" className="transition-colors hover:text-foreground">
                  Privacidade
                </a>
              </>
            ) : (
              <>
                <span className="text-muted-foreground/80">Termos</span>
                <span className="text-muted-foreground/80">Privacidade</span>
              </>
            )}
          </nav>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6 text-center font-sans text-sm text-muted-foreground">
          © {new Date().getFullYear()} PainelCRM. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
}
