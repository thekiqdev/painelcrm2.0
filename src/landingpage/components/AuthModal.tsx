import React, { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { useSignupEntry } from "@/hooks/useSignupEntry";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal público apenas para login. Cadastro segue a estratégia ativa (checkout ou /cadastro). */
export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { signupPath, showSignupOnLogin } = useSignupEntry();

  const resetForm = () => {
    setIdentifier("");
    setPassword("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const goToSignup = () => {
    resetForm();
    handleOpenChange(false);
    navigate(signupPath);
  };

  const detectLoginType = (value: string): "email" | "phone" => {
    if (value.includes("@")) return "email";
    if (/^[\d\s\-\+\(\)]+$/.test(value) && value.replace(/\D/g, "").length >= 10) return "phone";
    return loginType;
  };

  const handleIdentifierChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setIdentifier(value);
    if (value.length > 0) {
      const detected = detectLoginType(value);
      if (detected !== loginType) setLoginType(detected);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const dest = await signIn(identifier.trim(), password);
      if (dest && dest !== "/login") {
        handleOpenChange(false);
        navigate(dest, { replace: true });
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Ocorreu um erro.";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="landing-page sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Entrar</DialogTitle>
          <DialogDescription>
            Use seu e-mail ou telefone e senha para acessar sua conta.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="auth-identifier">
              {loginType === "email" ? "E-mail" : "Telefone"}
            </Label>
            <div className="flex gap-2">
              <Input
                id="auth-identifier"
                type={loginType === "email" ? "email" : "tel"}
                placeholder={loginType === "email" ? "seu@email.com" : "(11) 99999-9999"}
                value={identifier}
                onChange={handleIdentifierChange}
                className="flex-1"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="default"
                className="whitespace-nowrap shrink-0"
                onClick={() => {
                  setLoginType(loginType === "email" ? "phone" : "email");
                  setIdentifier("");
                }}
              >
                {loginType === "email" ? "📱" : "✉️"}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-password">Senha</Label>
            <Input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Processando..." : "Entrar"}
          </Button>
        </form>
        {showSignupOnLogin ? (
          <div className="text-center pt-2 border-t border-border/50">
            <span className="text-sm text-muted-foreground">
              Ainda não tem conta?{" "}
              <Button type="button" variant="link" className="p-0 h-auto text-sm" onClick={goToSignup}>
                Cadastro
              </Button>
            </span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
