import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";

const legalLinksEnabled = import.meta.env.VITE_ENABLE_LEGAL_PAGES !== "false";

const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-background py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="font-display text-lg font-bold text-foreground">PainelCRM</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-6 font-sans text-sm text-muted-foreground">
            <a href="#recursos" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#planos" className="transition-colors hover:text-foreground">Preços</a>
            <Link to="/login" className="transition-colors hover:text-foreground">Contato</Link>
            {legalLinksEnabled ? (
              <>
                <Link to="/legal/terms-of-service" className="transition-colors hover:text-foreground">
                  Termos de Uso
                </Link>
                <Link to="/legal/privacy-policy" className="transition-colors hover:text-foreground">
                  Privacidade
                </Link>
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
};

export default Footer;
