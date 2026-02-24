import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import AuthModal from "./AuthModal";

const Navbar = () => {
  const [open, setOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<"login" | "register">("login");

  const openAuthModal = (tab: "login" | "register" = "login") => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
    setOpen(false);
  };

  const openRegisterModal = () => {
    setAuthModalTab("register");
    setAuthModalOpen(true);
    setOpen(false);
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">M</span>
            </div>
            <span className="font-display text-lg font-bold text-foreground">MultiCRM</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#recursos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Recursos</a>
            <a href="#como-funciona" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Como funciona</a>
            <a href="#planos" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Planos</a>
          </div>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" size="sm" onClick={() => openAuthModal("login")}>
              Acessar
            </Button>
            <Button size="sm" onClick={openRegisterModal}>
              Começar grátis
            </Button>
          </div>

          <button className="md:hidden text-foreground" onClick={() => setOpen(!open)} type="button" aria-label="Menu">
            {open ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {open && (
          <div className="border-t border-border/50 bg-background/95 backdrop-blur-xl md:hidden">
            <div className="flex flex-col gap-4 p-4">
              <a href="#recursos" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Recursos</a>
              <a href="#como-funciona" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Como funciona</a>
              <a href="#planos" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Planos</a>
              <div className="flex gap-3 pt-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => openAuthModal("login")}>
                  Acessar
                </Button>
                <Button size="sm" className="flex-1" onClick={openRegisterModal}>
                  Começar grátis
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultTab={authModalTab}
      />
    </>
  );
};

export default Navbar;
