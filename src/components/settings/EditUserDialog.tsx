import React, { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  patchTenantUser,
  setUserRole,
  type PatchTenantUserPayload,
  type SetUserRolePayload,
  type TenantRole,
  type TenantUser,
} from "@/services/tenantLimits";
import { toast } from "@/components/ui/sonner";

function selectValueForUser(u: TenantUser): string {
  return u.custom_role_id ? `custom:${u.custom_role_id}` : (u.role ?? "");
}

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: TenantUser | null;
  roles: TenantRole[];
  onSaved: () => void;
}

export function EditUserDialog({ open, onOpenChange, user, roles, onSaved }: EditUserDialogProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [roleValue, setRoleValue] = useState("");
  const [initialRoleValue, setInitialRoleValue] = useState("");
  const [chatShowName, setChatShowName] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setFullName(user.full_name?.trim() ?? "");
    setEmail(user.email ?? "");
    setPhone(user.whatsapp_number?.trim() ?? "");
    setJobTitle(user.job_title?.trim() ?? "");
    const rv = selectValueForUser(user);
    setRoleValue(rv);
    setInitialRoleValue(rv);
    setChatShowName(user.chat_show_sender_name === true);
    setPassword("");
    setConfirmPassword("");
  }, [open, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (user.is_super_admin) {
      toast.error("Este utilizador não pode ser editado aqui.");
      return;
    }
    if (password || confirmPassword) {
      if (password.length < 6) {
        toast.error("A nova senha deve ter no mínimo 6 caracteres.");
        return;
      }
      if (password !== confirmPassword) {
        toast.error("A confirmação da senha não coincide.");
        return;
      }
    }
    const payload: PatchTenantUserPayload = {};
    if (fullName.trim()) payload.full_name = fullName.trim();
    if (email.trim()) payload.email = email.trim().toLowerCase();
    payload.phone = phone.trim() ? phone.trim().replace(/\D/g, "") : null;
    payload.job_title = jobTitle.trim() || null;
    payload.chat_show_sender_name = chatShowName;
    if (password) {
      payload.password = password;
      payload.confirm_password = confirmPassword;
    }

    setSaving(true);
    try {
      await patchTenantUser(user.id, payload);
      if (roleValue && roleValue !== initialRoleValue) {
        const rolePayload: SetUserRolePayload = roleValue.startsWith("custom:")
          ? { custom_role_id: roleValue.slice(7) }
          : { role: roleValue };
        await setUserRole(user.id, rolePayload);
      }
      toast.success("Utilizador atualizado.");
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar alterações.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPassword("");
      setConfirmPassword("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar utilizador</DialogTitle>
          <DialogDescription>
            Atualize dados do perfil, perfil de acesso e, se necessário, defina uma nova senha (opcional). A senha
            antiga não é necessária.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <form onSubmit={handleSubmit} className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-user-fullname">Nome completo</Label>
              <Input
                id="edit-user-fullname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-email">E-mail</Label>
              <Input
                id="edit-user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-phone">Telefone / WhatsApp</Label>
              <Input
                id="edit-user-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Apenas números ou deixe vazio para limpar"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-job">Cargo / função</Label>
              <Input
                id="edit-user-job"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="Ex.: Comercial"
              />
            </div>
            <div className="grid gap-2">
              <Label>Perfil de permissão</Label>
              {roles.length > 0 ? (
                <Select value={roleValue} onValueChange={setRoleValue}>
                  <SelectTrigger>
                    <SelectValue placeholder="Perfil de acesso" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem
                        key={r.id ?? r.role}
                        value={r.role === "custom" ? `custom:${r.id}` : r.role}
                      >
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">Sem perfis disponíveis.</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="edit-user-chat-name">Aparecer nome no chat</Label>
                <p className="text-xs text-muted-foreground">
                  Quando ativo, mensagens de texto enviadas manualmente podem ser prefixadas com o nome do atendente
                  (*Nome*).
                </p>
              </div>
              <Switch id="edit-user-chat-name" checked={chatShowName} onCheckedChange={setChatShowName} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-password">Nova senha (opcional)</Label>
              <Input
                id="edit-user-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe vazio para manter a senha atual"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-user-confirm">Confirmar nova senha</Label>
              <Input
                id="edit-user-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetir a nova senha"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "A guardar…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
