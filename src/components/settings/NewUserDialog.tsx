import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound } from "lucide-react";
import { createTenantUser, type CreateTenantUserPayload } from "@/services/tenantLimits";
import { toast } from "sonner";

function generatePassword(length = 12): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface NewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export function NewUserDialog({ open, onOpenChange, onCreated }: NewUserDialogProps) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleGeneratePassword = () => {
    setPassword(generatePassword());
    toast.success("Senha gerada. Copie e envie ao usuário.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateTenantUserPayload = {
      full_name: fullName.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
    };
    if (phone.trim()) payload.phone = phone.trim().replace(/\D/g, "");
    if (!payload.full_name || !payload.email || !payload.password) {
      toast.error("Preencha nome completo, e-mail e senha.");
      return;
    }
    if (payload.password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await createTenantUser(payload);
      toast.success("Usuário criado com sucesso.");
      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao criar usuário.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setFullName("");
      setPhone("");
      setEmail("");
      setPassword("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            Preencha os dados do novo usuário. Ele poderá acessar a conta com o e-mail e a senha definidos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="new-user-fullname">Nome completo</Label>
            <Input
              id="new-user-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex.: Maria Silva"
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-phone">Celular</Label>
            <Input
              id="new-user-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="new-user-email">E-mail</Label>
            <Input
              id="new-user-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.com"
              required
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="new-user-password">Senha</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={handleGeneratePassword}
              >
                <KeyRound className="mr-1 h-3.5 w-3.5" />
                Gerar senha
              </Button>
            </div>
            <Input
              id="new-user-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Criando…" : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
