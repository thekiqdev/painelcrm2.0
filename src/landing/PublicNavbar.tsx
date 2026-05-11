import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";

/**
 * Navbar da landing estática — sem AuthProvider (bundle mínimo).
 * CTAs para login/checkout usam navegação completa para o SPA principal.
 */
export default function PublicNavbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2" onClick={() => setOpen(false)}>
          <Logo size="sm" />
          <span className="font-display truncate text-lg font-bold text-foreground">PainelCRM</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="#recursos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Recursos
          </a>
          <a href="#como-funciona" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Como funciona
          </a>
          <a href="#planos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            Planos
          </a>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <a href="/login">Acessar</a>
          </Button>
          <Button size="sm" asChild>
            <a href="/checkout">Começar grátis</a>
          </Button>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <Button
            type="button"
            size="lg"
            className={cn(
              "h-11 min-w-[7.5rem] rounded-full px-6 text-sm font-semibold shadow-md shadow-primary/15",
            )}
            asChild
          >
            <a href="/login">Acessar</a>
          </Button>
          <button
            type="button"
            className="text-foreground"
            aria-label={open ? "Fechar menu" : "Abrir menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-3 p-4">
            <a href="#recursos" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
              Recursos
            </a>
            <a href="#como-funciona" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
              Como funciona
            </a>
            <a href="#planos" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>
              Planos
            </a>
            <Button size="sm" asChild>
              <a href="/checkout" onClick={() => setOpen(false)}>
                Começar grátis
              </a>
            </Button>
          </div>
        </div>
      )}
    </nav>
  );
}
