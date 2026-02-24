import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="border-t border-border/50 bg-background py-12">
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">M</span>
            </div>
            <span className="font-display text-lg font-bold text-foreground">MultiCRM</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <a href="#recursos" className="transition-colors hover:text-foreground">Recursos</a>
            <a href="#planos" className="transition-colors hover:text-foreground">Preços</a>
            <Link to="/login" className="transition-colors hover:text-foreground">Contato</Link>
            <a href="#" className="transition-colors hover:text-foreground">Termos</a>
            <a href="#" className="transition-colors hover:text-foreground">Privacidade</a>
          </nav>
        </div>

        <div className="mt-8 border-t border-border/50 pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} MultiCRM. Todos os direitos reservados.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
